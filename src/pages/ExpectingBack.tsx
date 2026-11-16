import { useState, type Dispatch, type SetStateAction } from 'react'
import { Section, useToast } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, daysBetween, localDate, parseStatementKey } from '../domain/cardTracker'
import { comingBackAgain, expectingBack, notComingBack, type HeldPurchase } from '../domain/expectingBack'
import { dayDate, destinationNamer } from './cardLabels'
import { billName, pounds } from './spendingFormat'
import './ExpectingBack.css'

/** "Held in Going out", or where it went once its bill closed. */
function heldWhere(document: BudgetDocument, row: HeldPurchase): string {
  const name = destinationNamer(document)
  const pots = row.byDestination.filter(part => part.outPence > 0).map(part => name(part.destination))
  if (row.open) return `Held in ${pots.join(' and ')} until the refund or the bill`
  const close = parseStatementKey(row.purchase.statementKey)?.closeDate
  return `Paid with the ${close ? billName(close) : 'bill'}: a refund moves it back`
}

/**
 * Spending › Expecting back (D11): each purchase with items on their way back, what's still out, where it's held and how
 * long ago it was marked. **Not coming back** turns it into spending (P7), with Undo.
 */
export function ExpectingBackList({ document, setDocument, today = localDate(), now = () => new Date() }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; today?: string; now?: () => Date }) {
  const { show, toast } = useToast()
  // Mounted from the first Not coming back on, so the page keeps one status line until then.
  const [toastShown, setToastShown] = useState(false)
  const rows = expectingBack(cardTracker(document), today)
  const total = rows.reduce((sum, row) => sum + row.outPence, 0)
  const ago = (iso: string) => { const days = daysBetween(localDate(new Date(iso)), today); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago` }
  const giveUp = (row: HeldPurchase) => {
    const at = now()
    setDocument(current => notComingBack(current, row.purchase.id, at))
    setToastShown(true)
    show(`${row.purchase.description}: ${pounds(row.outPence)} now counts as spending.`, [{ label: 'Undo', onClick: () => setDocument(current => comingBackAgain(current, row.purchase.id, at.toISOString())) }])
  }
  return <>
    {rows.length > 0 && <Section title="Expecting back" count={pounds(total)}>
      <p className="expecting-hint">When the refund comes in, open it and link it to its order.</p>
      <ul className="expecting-list" aria-label="Expecting back">{rows.map(row => <li key={row.purchase.id} className="expecting-row">
        <p className="expecting-main"><span className="expecting-title">{row.purchase.description}</span><span className="expecting-amount">{pounds(row.outPence)}</span></p>
        <p className="expecting-items">{row.lines.map(({ line }) => `${line.item ?? 'Item'} ${pounds(line.amountPence)}`).join(' · ')}{row.backPence > 0 && ` · ${pounds(row.backPence)} refunded`}</p>
        <p className="expecting-meta">Bought {dayDate(row.purchase.date)} · marked Back {ago(row.markedAt)}</p>
        <p className="expecting-meta">{heldWhere(document, row)}</p>
        <button type="button" className="text-button expecting-action" aria-label={`${row.purchase.description}: not coming back`} onClick={() => giveUp(row)}>Not coming back</button>
      </li>)}</ul>
    </Section>}
    {toastShown && toast}
  </>
}
