import type { BudgetDocument } from './budgetDocument'
import { bufferBalance } from './buffer'
import { cardTracker, monthOf, needsSort, shiftMonth } from './cardTracker'
import { moneyArrivesDates } from './monthStages'
import type { BudgetDestination } from './monthlyBudget'
import { monthSpending, monthTransactions, PACE_AHEAD_MIN_PENCE, PACE_AHEAD_SHARE } from './cardSpending'
import { potKind } from './potKinds'

/**
 * "Can we afford…" (month-health plan §4, `affordCheck`): an amount against a pot, answered before anything is bought.
 * It records nothing. Tracked pots get Yes or Over, with pace; a Funded only pot says to check the bank, because North
 * only sees its Amex spend. Saving pots, carry-over pots, the Amex pot and months other than this one aren't offered.
 * An over pot is answered with the card's buffer (P9): what it held when last checked, less what the month's other
 * over pots will take, and whether that covers this. From next month's first payday to the 1st, the answer also says
 * which month's money it is and when the next month's starts (the month line).
 */
export type AffordAnswer =
  | { kind: 'within'; leftAfterPence: number; daysLeft: number; /** Steady pots: still on pace, or this far ahead of it (to the pound). */ pace?: 'on-pace' | 'ahead'; aheadPence?: number; toSort?: ToSort; overlap?: Overlap }
  | { kind: 'over'; overPence: number; toSort?: ToSort; buffer?: BufferAnswer; overlap?: Overlap }
  | { kind: 'funded-only'; goesOnAmex: boolean; overlap?: Overlap }
  | { kind: 'not-offered' }

/** After next month's first payday and before the 1st: this month still owns the spend; `nextPlannedPence` is the pot's plan for the next. */
export type Overlap = { potName: string; month: string; nextMonth: string; nextPlannedPence: number; startsOn: string }

/**
 * What the card's buffer can do for an over pot. `balancePence` is absent until the buffer has been checked.
 * `availablePence` is that less the other Tracked pots' overspends, which draw on the buffer first.
 */
export type BufferAnswer = { destination: BudgetDestination; checkedAt?: string; balancePence?: number; otherOverPence: number; availablePence?: number; covers?: boolean; shortPence?: number }

/** Rows brought in but not sorted yet, card-wide: what changes if they were sorted to this pot. */
export type ToSort = { count: number; pence: number; /** Left (negative is over) if they all went here too. */ leftIfSortedPence: number }

export function affordCheck(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, potId: string, pence: number, today: string): AffordAnswer {
  const kind = potKind(document, potId)
  const month = monthOf(today)
  if (pence <= 0) return { kind: 'not-offered' }
  const overlap = overlapFor(document, potId, today)
  const lap = overlap ? { overlap } : {}
  if (kind === 'funded-only') return { kind: 'funded-only', goesOnAmex: cardTracker(document).cards.some(card => !!card.setAside), ...lap }
  if (kind !== 'tracked') return { kind: 'not-offered' }
  const figures = monthSpending(document, month, today)
  const row = figures.rows.find(item => item.key === `pot:${potId}`)
  if (!row) return { kind: 'not-offered' }
  const leftAfterPence = row.leftPence - pence
  const unsorted = monthTransactions(cardTracker(document), month).filter(needsSort)
  const toSortPence = unsorted.reduce((sum, item) => sum + item.amountPence, 0)
  const toSort: { toSort?: ToSort } = unsorted.length ? { toSort: { count: unsorted.length, pence: toSortPence, leftIfSortedPence: leftAfterPence - toSortPence } } : {}
  if (leftAfterPence < 0) {
    const otherOverPence = figures.rows.filter(item => item.kind === 'tracked' && item.key !== row.key && item.leftPence < 0).reduce((sum, item) => sum - item.leftPence, 0)
    const buffer = bufferAnswer(document, -leftAfterPence, otherOverPence, today)
    return { kind: 'over', overPence: -leftAfterPence, ...toSort, ...buffer ? { buffer } : {}, ...lap }
  }
  if (row.expectedPence === undefined) return { kind: 'within', leftAfterPence, daysLeft: figures.daysLeft, ...toSort, ...lap }
  const ahead = row.spentPence + row.takenPence + pence - row.expectedPence
  const behind = ahead >= Math.max(PACE_AHEAD_MIN_PENCE, row.plannedPence * PACE_AHEAD_SHARE)
  return { kind: 'within', leftAfterPence, daysLeft: figures.daysLeft, pace: behind ? 'ahead' : 'on-pace', ...behind ? { aheadPence: Math.round(ahead / 100) * 100 } : {}, ...toSort, ...lap }
}

function bufferAnswer(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, overPence: number, otherOverPence: number, today: string): BufferAnswer | undefined {
  const buffer = bufferBalance(document, today)
  if (!buffer) return undefined
  if (buffer.balancePence === undefined) return { destination: buffer.destination, otherOverPence }
  const availablePence = buffer.balancePence - otherOverPence
  return { destination: buffer.destination, checkedAt: buffer.checked!.at, balancePence: buffer.balancePence, otherOverPence, availablePence, covers: availablePence >= overPence, ...availablePence < overPence ? { shortPence: overPence - Math.max(0, availablePence) } : {} }
}

function overlapFor(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, potId: string, today: string): Overlap | undefined {
  const month = monthOf(today), nextMonth = shiftMonth(month, 1)
  const firstPayday = moneyArrivesDates(document, nextMonth)[0]
  if (!firstPayday || firstPayday > today) return undefined
  const nextPlannedPence = monthSpending(document, nextMonth, today).rows.find(row => row.key === `pot:${potId}`)?.plannedPence ?? 0
  const potName = document.budget.pots.find(pot => pot.id === potId)?.name
  return nextPlannedPence > 0 && potName ? { potName, month, nextMonth, nextPlannedPence, startsOn: `${nextMonth}-01` } : undefined
}
