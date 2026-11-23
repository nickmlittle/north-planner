import type { BudgetDocument } from './budgetDocument'
import { addDays, cardTracker, daysBetween, needsSort, daysInMonth, lastDayOf, localDate, monthOf, shiftMonth, type PotKind } from './cardTracker'
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
  /** The month's purchases and refunds to sort (not waiting), card-wide: shown beside Left, not part of the sum. */
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
  const unsorted = monthTransactions(tracker, month).filter(needsSort)
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

/** The week's allowance (P3): "This week" Monday to Thursday, "This weekend" Friday to Sunday. */
export type WeekFigures = { label: 'This week' | 'This weekend'; pence: number; /** The Sunday it runs to, or the month's last day. */ through: string; days: number }

/**
 * What a Tracked pot can spend by Sunday night and still be on pace (P3): Left spread over the days left, for the days
 * to Sunday. From Monday to Thursday that's "This week", from Friday "This weekend". The month ending before Sunday
 * makes it all of Left; a pot that's over has £0.00. Only the current month has one.
 */
export function weekFigures(leftPence: number, month: string, today: string): WeekFigures | undefined {
  if (month !== monthOf(today)) return undefined
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
  const through = [addDays(today, 6 - weekday), lastDayOf(month)].sort()[0]!
  const days = daysBetween(today, through) + 1
  const monthDays = daysInMonth(month) - Number(today.slice(8)) + 1
  return { label: weekday >= 4 ? 'This weekend' : 'This week', pence: leftPence > 0 ? Math.round(leftPence * days / monthDays) : 0, through, days }
}

/** A purchase this size or bigger counts as a shop (P4). */
export const SHOP_MIN_PENCE = 3000
/** How many shops a typical shop needs (P4). */
export const SHOPS_NEEDED = 3

/** A typical shop (P4): the average of the pot's purchases of £30 or more over the last 3 months; absent until there are 3. */
export function typicalShop(document: Pick<BudgetDocument, 'card'>, potId: string, today: string): { pence: number; count: number } | undefined {
  const from = `${shiftMonth(monthOf(today), -3)}-${String(Math.min(Number(today.slice(8)), daysInMonth(shiftMonth(monthOf(today), -3)))).padStart(2, '0')}`
  const shops = cardTracker(document).transactions.filter(row => row.kind === 'purchase' && row.date > from && row.date <= today)
    .flatMap(row => (row.sort?.lines ?? []).filter(line => line.destination.kind === 'pot' && line.destination.potId === potId && line.amountPence >= SHOP_MIN_PENCE))
  return shops.length >= SHOPS_NEEDED ? { pence: Math.round(shops.reduce((sum, line) => sum + line.amountPence, 0) / shops.length), count: shops.length } : undefined
}

/** Carried over by month (D13): each closed month's leftover still in the pot, and what was moved out. Its total is `builtUp`. */
export type CarriedOver = { months: Array<{ month: string; pence: number }>; movedOut: Array<{ at: string; pence: number }>; totalPence: number }

export function carriedOverByMonth(document: Pick<BudgetDocument, 'card'>, potId: string, month: string): CarriedOver {
  const tracker = cardTracker(document)
  const months = Object.entries(tracker.months).filter(([key, record]) => key !== month && !!record.leftovers?.[potId]).map(([key, record]) => ({ month: key, pence: record.leftovers![potId]! })).sort((a, b) => b.month.localeCompare(a.month))
  const movedOut = [...tracker.pots[potId]?.movedOut ?? []].sort((a, b) => b.at.localeCompare(a.at))
  return { months, movedOut, totalPence: builtUp(tracker, potId, month) }
}

/** One of the last 3 months on a pot's page: planned, spent and what was left (negative is over). */
export type RecentMonth = { month: string; plannedPence: number; spentPence: number; leftPence: number }

/** The 3 months before `month`, for a Tracked pot. A month with nothing spent and no close record is left out: its plan alone says nothing. */
export function recentMonths(document: Pick<BudgetDocument, 'budget' | 'card' | 'household'>, potId: string, month: string, today: string, count = 3): RecentMonth[] {
  return Array.from({ length: count }, (_, index) => shiftMonth(month, -(index + 1))).flatMap(key => {
    const row = monthSpending(document, key, today).rows.find(item => item.key === `pot:${potId}`)
    return row && (row.spentPence !== 0 || !!cardTracker(document).months[key]) ? [{ month: key, plannedPence: row.plannedPence, spentPence: row.spentPence, leftPence: row.leftPence }] : []
  })
}

/** What payday put in a Funded only or Saving pot this month: planned, and what its Move tick says went in. */
export type MoneyIn = { plannedPence: number; movedInPence?: number; /** Card spend sorted to the pot: "£115.30 on the Amex". */ onCardPence: number }

export function moneyIn(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, potId: string, month: string, today: string): MoneyIn {
  const row = monthSpending(document, month, today).rows.find(item => item.key === `pot:${potId}`)
  const ticked = Object.entries(document.ticks?.[month] ?? {}).filter(([key]) => key.endsWith(`:move:${potId}`))
  return { plannedPence: row?.plannedPence ?? 0, ...ticked.length ? { movedInPence: ticked.reduce((sum, [, tick]) => sum + tick.amountPence, 0) } : {}, onCardPence: (row?.spentPence ?? 0) - (row?.billsPaidPence ?? 0) }
}
