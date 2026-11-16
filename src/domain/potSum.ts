import type { BudgetDocument } from './budgetDocument'
import { cardTracker, localDate, monthOf, type PotKind } from './cardTracker'
import { monthSpending, monthTransactions } from './cardSpending'
import { builtUp } from './monthStages'
import { potBalance, type WaitingShare } from './potBalances'
import { potKind } from './potKinds'

/**
 * One sum per pot (month-health plan D2, D13, P1): In the pot = Left this month + Waiting to move + Carried over.
 * - Left this month: the month's Left (Tracked pots only).
 * - Waiting to move: card spend on the pot that hasn't moved out of it yet (to the Amex pot, or at settle up).
 * - Carried over: closed months' leftovers still in the pot (`builtUp`). Shown, never part of Left (D13).
 * - In the pot: the balance worked out from the last check (`potBalance`); unknown before the first check.
 * - Not explained: In the pot − the three parts, once checked (P1). It never hides inside another line.
 * Carries over pots show Spare instead: In the pot − waiting to move − bills still due (what "free" was).
 * Rules: docs/card-tracker-rules.md, "Bill and pot sums".
 */

export type PotSum = {
  potId: string
  kind?: PotKind
  /** Tracked pots: the month's Left (negative is over). */
  leftPence?: number
  /** The month's purchases and refunds not sorted yet, card-wide: shown beside Left, not part of the sum. */
  toSortPence: number
  toSort: number
  waiting: WaitingShare[]
  waitingPence: number
  /** Tracked pots: leftovers of closed months still in the pot. */
  carriedOverPence?: number
  /** Worked out from the last check; absent until the pot has been checked. */
  inPotPence?: number
  checkedAt?: string
  /** Checked, and nothing has moved since: the figure is the bank's, not worked out. */
  fresh: boolean
  /** Tracked pots, this month, once checked: In the pot − (Left + Waiting + Carried over). 0 when it adds up. */
  notExplainedPence?: number
  /** Carries over pots, once checked: In the pot − waiting to move − bills still due. */
  sparePence?: number
  billsDuePence: number
}

/** A pot's sum for a month (D2). The parts that need a check are absent until the pot has one. */
export function potSum(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, potId: string, month: string, today: string = localDate()): PotSum {
  const tracker = cardTracker(document)
  const kind = potKind(document, potId)
  const balance = potBalance(document, potId, today)
  const unsorted = monthTransactions(tracker, month).filter(row => row.kind !== 'payment' && !row.sort)
  const base: PotSum = {
    potId, ...kind ? { kind } : {}, toSortPence: unsorted.reduce((sum, row) => sum + row.amountPence, 0), toSort: unsorted.length,
    waiting: balance.waiting, waitingPence: balance.waitingPence, billsDuePence: balance.billsDuePence, fresh: !!balance.checked && balance.since.length === 0,
    ...balance.balancePence !== undefined ? { inPotPence: balance.balancePence, checkedAt: balance.checked!.at } : {},
  }
  if (kind === 'carries-over') return { ...base, ...balance.freePence !== undefined ? { sparePence: balance.freePence } : {} }
  if (kind !== 'tracked') return base
  const row = monthSpending(document, month, today).rows.find(item => item.key === `pot:${potId}`)
  const leftPence = row?.leftPence ?? 0
  const carriedOverPence = builtUp(tracker, potId, month)
  // Not explained only means something for this month: the balance is today's.
  const notExplained = base.inPotPence !== undefined && month === monthOf(today) ? { notExplainedPence: base.inPotPence - leftPence - base.waitingPence - carriedOverPence } : {}
  return { ...base, leftPence, carriedOverPence, ...notExplained }
}
