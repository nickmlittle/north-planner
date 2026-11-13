import type { BudgetDocument } from './budgetDocument'
import { daysInMonth } from './cardTracker'
import { resolveBudget, type BillDay, type BillPaidBy, type BudgetDestination, type BudgetItem, type RecurringBill } from './monthlyBudget'

/**
 * Recurring bills: plan items that come out on a set date (docs/recurring-bills-rules.md). The details live on the
 * item (`BudgetItem.bill`), so they follow the plan's snapshot rules. Everything here is pure.
 */

/** A bill is seen through a card's statement only when it's on a card North tracks; otherwise it's assumed paid on its day. */
export function billTracked(bill: RecurringBill, document: Pick<BudgetDocument, 'card'>): boolean {
  return bill.paidBy === 'card' && !!bill.cardId && !!document.card?.cards.some(card => card.id === bill.cardId)
}

/**
 * The names of the items, in any month, whose bill is paid on this card: what removing it would change. Each item is
 * counted once, by its latest name.
 */
export function billsOnCard(document: Pick<BudgetDocument, 'budget'>, cardId: string): string[] {
  const { snapshots, importedBaseline } = document.budget
  const months = Object.keys(snapshots).sort()
  const lists: BudgetItem[][] = [importedBaseline ?? [], ...months.map(month => snapshots[month]!.items)]
  const names = new Map<string, string>()
  for (const items of lists) for (const item of items) if (item.bill?.paidBy === 'card' && item.bill.cardId === cardId) names.set(item.id, item.name)
  return [...names.values()]
}

/** A bill's date in a month (YYYY-MM-DD): its day, or the month's last day (the 28th or 29th in February). */
export function billDate(month: string, day: BillDay): string {
  return `${month}-${String(day === 'last' ? daysInMonth(month) : day).padStart(2, '0')}`
}

/** `paid` once its day has come (North assumes it went out, unless it's on a tracked card); `due` until then. */
export type BillState = 'paid' | 'due'

export type MonthBill = {
  itemId: string
  name: string
  destination: BudgetDestination
  /** YYYY-MM-DD. */
  date: string
  /** Monthly: the item's amount. Yearly: the full yearly price, in its renewal month only. */
  amountPence: number
  paidBy: BillPaidBy
  cardId?: string
  /** On a card North tracks: its charge comes in through Bring in and Sort, so it's never assumed. */
  tracked: boolean
  state: BillState
}

/**
 * The bills that come out in a month (recurring-bills-rules › A month's bills), from that month's own plan: every
 * monthly bill, and each yearly bill in its renewal month. Paid when the date is on or before today, so every bill in
 * a past month is paid and every bill in a future month is due. Sorted by date, then name.
 */
export function monthBills(document: Pick<BudgetDocument, 'budget' | 'card'>, month: string, today: string): MonthBill[] {
  const bills: MonthBill[] = []
  for (const item of resolveBudget(document.budget, month).items) {
    const bill = item.bill
    if (!bill) continue
    const yearly = item.frequency === 'annually'
    if (yearly && bill.month !== Number(month.slice(5))) continue
    const date = billDate(month, bill.day)
    bills.push({
      itemId: item.id, name: item.name, destination: item.destination, date, amountPence: yearly ? item.entryAmountPence : item.amountPence,
      paidBy: bill.paidBy, ...bill.cardId ? { cardId: bill.cardId } : {}, tracked: billTracked(bill, document), state: date <= today ? 'paid' : 'due',
    })
  }
  return bills.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'en-GB'))
}

/** One pot's bills in a month, as Spending counts them. Bills to an account aren't counted (P2). */
export type PotBillTotals = {
  /** Paid and not tracked: what North assumes went out. It counts as Spent and lowers the balance. */
  assumedPaidPence: number
  /** Not out yet, tracked or not: "£172.00 of it due". */
  duePence: number
  /** Not out yet and not tracked: what's about to leave the pot itself. */
  assumedDuePence: number
  /** Every bill dated on or before today, tracked or not (pace). */
  soFarPence: number
  /** Every bill this month, tracked or not (pace). */
  allPence: number
  count: number
}

export function potBillTotals(bills: readonly MonthBill[], potId: string): PotBillTotals {
  const totals: PotBillTotals = { assumedPaidPence: 0, duePence: 0, assumedDuePence: 0, soFarPence: 0, allPence: 0, count: 0 }
  for (const bill of bills) {
    if (bill.destination.kind !== 'pot' || bill.destination.potId !== potId) continue
    totals.count++
    totals.allPence += bill.amountPence
    if (bill.state === 'paid') {
      totals.soFarPence += bill.amountPence
      if (!bill.tracked) totals.assumedPaidPence += bill.amountPence
    } else {
      totals.duePence += bill.amountPence
      if (!bill.tracked) totals.assumedDuePence += bill.amountPence
    }
  }
  return totals
}

/** A yearly bill's next renewal: the first date with its day and month on or after today (YYYY-MM-DD). */
export function nextRenewal(bill: Pick<RecurringBill, 'day' | 'month'>, today: string): string {
  const month = String(bill.month ?? 1).padStart(2, '0')
  const thisYear = billDate(`${today.slice(0, 4)}-${month}`, bill.day)
  return thisYear >= today ? thisYear : billDate(`${Number(today.slice(0, 4)) + 1}-${month}`, bill.day)
}

export type YearlyBill = {
  itemId: string
  name: string
  /** The next renewal (YYYY-MM-DD); absent when the item has no date. */
  renews?: string
  paidBy?: BillPaidBy
  cardId?: string
  tracked: boolean
  monthlyPence: number
  yearlyPence: number
}

/**
 * The yearly items a pot sets money aside for, in a month's plan: each one's next renewal, the monthly set-aside and
 * the yearly price. Soonest renewal first, then the ones with no date, by name.
 */
export function yearlyBillsFor(document: Pick<BudgetDocument, 'budget' | 'card'>, potId: string, month: string, today: string): YearlyBill[] {
  return resolveBudget(document.budget, month).items
    .filter(item => item.frequency === 'annually' && item.destination.kind === 'pot' && item.destination.potId === potId)
    .map(item => ({
      itemId: item.id, name: item.name, monthlyPence: item.amountPence, yearlyPence: item.entryAmountPence, tracked: !!item.bill && billTracked(item.bill, document),
      ...item.bill ? { renews: nextRenewal(item.bill, today), paidBy: item.bill.paidBy, ...item.bill.cardId ? { cardId: item.bill.cardId } : {} } : {},
    }))
    .sort((a, b) => (a.renews ?? '9999').localeCompare(b.renews ?? '9999') || a.name.localeCompare(b.name, 'en-GB'))
}
