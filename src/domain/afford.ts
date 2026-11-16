import type { BudgetDocument } from './budgetDocument'
import { cardTracker, monthOf } from './cardTracker'
import { monthSpending, monthTransactions, PACE_AHEAD_MIN_PENCE, PACE_AHEAD_SHARE } from './cardSpending'
import { potKind } from './potKinds'

/**
 * "Can we afford…" (month-health plan §4, `affordCheck`): an amount against a pot, answered before anything is bought.
 * It records nothing. Tracked pots get Yes or Over, with pace; a Funded only pot says to check the bank, because North
 * only sees its Amex spend. Saving pots, carry-over pots, the Amex pot and months other than this one aren't offered.
 * The buffer answer for an over pot, and the overlap-day month line, come with health/8.
 */
export type AffordAnswer =
  | { kind: 'within'; leftAfterPence: number; daysLeft: number; /** Steady pots: still on pace, or this far ahead of it (to the pound). */ pace?: 'on-pace' | 'ahead'; aheadPence?: number; toSort?: ToSort }
  | { kind: 'over'; overPence: number; toSort?: ToSort }
  | { kind: 'funded-only'; goesOnAmex: boolean }
  | { kind: 'not-offered' }

/** Rows brought in but not sorted yet, card-wide: what changes if they were sorted to this pot. */
export type ToSort = { count: number; pence: number; /** Left (negative is over) if they all went here too. */ leftIfSortedPence: number }

export function affordCheck(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, potId: string, pence: number, today: string): AffordAnswer {
  const kind = potKind(document, potId)
  const month = monthOf(today)
  if (pence <= 0) return { kind: 'not-offered' }
  if (kind === 'funded-only') return { kind: 'funded-only', goesOnAmex: cardTracker(document).cards.some(card => !!card.setAside) }
  if (kind !== 'tracked') return { kind: 'not-offered' }
  const figures = monthSpending(document, month, today)
  const row = figures.rows.find(item => item.key === `pot:${potId}`)
  if (!row) return { kind: 'not-offered' }
  const leftAfterPence = row.leftPence - pence
  const unsorted = monthTransactions(cardTracker(document), month).filter(item => item.kind !== 'payment' && !item.sort)
  const toSortPence = unsorted.reduce((sum, item) => sum + item.amountPence, 0)
  const toSort: { toSort?: ToSort } = unsorted.length ? { toSort: { count: unsorted.length, pence: toSortPence, leftIfSortedPence: leftAfterPence - toSortPence } } : {}
  if (leftAfterPence < 0) return { kind: 'over', overPence: -leftAfterPence, ...toSort }
  if (row.expectedPence === undefined) return { kind: 'within', leftAfterPence, daysLeft: figures.daysLeft, ...toSort }
  const ahead = row.spentPence + row.takenPence + pence - row.expectedPence
  const behind = ahead >= Math.max(PACE_AHEAD_MIN_PENCE, row.plannedPence * PACE_AHEAD_SHARE)
  return { kind: 'within', leftAfterPence, daysLeft: figures.daysLeft, pace: behind ? 'ahead' : 'on-pace', ...behind ? { aheadPence: Math.round(ahead / 100) * 100 } : {}, ...toSort }
}
