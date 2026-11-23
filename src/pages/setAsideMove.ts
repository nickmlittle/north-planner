import type { Dispatch, SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, destinationKey, parseStatementKey, sameDestination, type CardAccount } from '../domain/cardTracker'
import { refreshSettled } from '../domain/cardStatements'
import { frontsOwed } from '../domain/fronts'
import { moveSteps, potPhrase, recordMove, type MovePlan, type ToMoveRow } from '../domain/setAside'
import { billName, pounds } from './spendingFormat'
import { frontSourceName, shortName } from './cardLabels'
import { shortAccountLabels } from './budgetLabels'

/**
 * Record a set-aside move ("Moved £140.59"): the chosen transactions are now in the pot (or, for rows the buffer covered
 * at Pay, back in the buffer), and any statement they settle refreshes. Returns the message and the move's id, for Undo. Shared by Spending's Set aside block and the sheet.
 */
export function markSetAsideMoved(document: BudgetDocument, setDocument: Dispatch<SetStateAction<BudgetDocument>>, cardId: string, rows: readonly ToMoveRow[], at: Date): { text: string; id: string } {
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = document.budget.pots.find(row => row.id === card?.setAside?.potId)
  const plan = moveSteps(document, cardId, rows)
  const total = plan?.totalPence ?? 0
  const phrase = potPhrase(pot?.name ?? card?.name ?? 'the pot')
  const id = crypto.randomUUID()
  const keys = [...new Set(rows.map(row => row.transaction.statementKey))]
  setDocument(current => keys.reduce((next, key) => refreshSettled(next, key, at), recordMove(current, cardId, rows.map(row => row.transaction.id), at, id)))
  // Rows the buffer covered at Pay pay it back (W11): "Moved £45.10 to the Amex pot and £88.00 back to the buffer."
  const parts = [total > 0 ? `${pounds(total)} to ${phrase}` : total < 0 ? `${pounds(-total)} back out of ${phrase}` : '',
    ...card ? (plan?.payBack ?? []).map(row => row.pence > 0 ? `${pounds(row.pence)} back to ${frontSourceName(document, card, row.source)}` : `${pounds(-row.pence)} out of ${frontSourceName(document, card, row.source)}`) : []].filter(Boolean)
  return { text: parts.length ? `Moved ${parts.join(' and ')}.` : 'Moved between pots.', id }
}

/** "November bill", or "November and December bills". */
export const billsName = (statementKeys: readonly string[]) => {
  const months = [...new Set(statementKeys.map(key => parseStatementKey(key)?.closeDate ?? '').filter(Boolean).sort().map(date => billName(date).replace(/ bill$/, '')))]
  return months.length > 1 ? `${months.slice(0, -1).join(', ')} and ${months.at(-1)} bills` : `${months[0] ?? 'the'} bill`
}

/**
 * Paying the buffer back (W11): "£88.00 stays in Monzo Joint’s main balance. It pays the buffer back for the November bill.
 * £124.40 is still owed, for the 4 still waiting." One per source.
 */
export function payBackNotes(document: BudgetDocument, card: CardAccount, plan: MovePlan, rows: readonly ToMoveRow[], today: string): Array<{ key: string; lead: string; detail: string }> {
  const owed = frontsOwed(document, today)
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  return plan.payBack.map(payBack => {
    const source = payBack.source
    const stays = source.kind === 'account' && source.accountId === plan.accountId
    const lead = stays ? `${pounds(Math.abs(payBack.pence))} stays in ${labels.get(source.accountId) ?? 'the account'}’s main balance`
      : payBack.pence < 0 ? `${pounds(-payBack.pence)} comes out of ${shortName(document, source)}` : `${pounds(payBack.pence)} goes ${source.kind === 'pot' ? 'into' : 'to'} ${shortName(document, source)}`
    // What's still owed after this move: the Fronts' total, less every line these rows record (lines already at the source too).
    const fronts = owed.filter(row => sameDestination(row.front.source, source))
    const recorded = rows.filter(row => row.front && sameDestination(row.front.source, source)).reduce((sum, row) => sum + row.pence, 0)
    const after = fronts.reduce((sum, row) => sum + row.owedPence, 0) - recorded
    const unsorted = fronts.reduce((sum, row) => sum + row.unsorted, 0), waiting = fronts.reduce((sum, row) => sum + row.waiting, 0)
    const unsortedPence = fronts.reduce((sum, row) => sum + row.unsortedPence, 0)
    const forWhat = unsorted && after === unsortedPence ? `, for ${waiting === unsorted ? `the ${unsorted} still waiting` : `${unsorted} not sorted yet`}` : ''
    const still = after > 0 ? ` ${pounds(after)} is still owed${forWhat}.` : ''
    return { key: destinationKey(source), lead, detail: `It pays ${frontSourceName(document, card, source)} back for the ${billsName(payBack.statementKeys)}.${still}` }
  })
}
