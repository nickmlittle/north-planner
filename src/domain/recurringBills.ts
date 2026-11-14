import type { BudgetDocument } from './budgetDocument'
import { addDays, daysBetween, daysInMonth } from './cardTracker'
import { DEFAULT_REMIND_WEEKS, monthlyContributionPence, resolveBudget, updateBudgetAtMonth, type BillDay, type BillPaidBy, type BudgetDestination, type BudgetItem, type RecurringBill } from './monthlyBudget'

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

/** When Home starts reminding about a renewal (YYYY-MM-DD), or undefined when the reminder is off. */
export function reminderFrom(renews: string, bill: Pick<RecurringBill, 'remindWeeks'>): string | undefined {
  const weeks = bill.remindWeeks ?? DEFAULT_REMIND_WEEKS
  return weeks ? addDays(renews, -weeks * 7) : undefined
}

export type DatedItem = { item: BudgetItem; bill: RecurringBill; tracked: boolean }
export type RenewingItem = DatedItem & { renews: string; remindFrom?: string }

/**
 * Plan › Dates (board 5): the month's recurring bills by day, the yearly ones by their next renewal, and the yearly
 * items with no date (nearly every yearly item is a renewal).
 */
export function planDates(document: Pick<BudgetDocument, 'card'>, items: readonly BudgetItem[], today: string): { monthly: DatedItem[]; yearly: RenewingItem[]; undated: BudgetItem[] } {
  const dayOrder = (day: BillDay) => day === 'last' ? 29 : day
  const monthly = items.filter(item => item.bill && item.frequency === 'monthly').map(item => ({ item, bill: item.bill!, tracked: billTracked(item.bill!, document) }))
    .sort((a, b) => dayOrder(a.bill.day) - dayOrder(b.bill.day) || a.item.name.localeCompare(b.item.name, 'en-GB'))
  const yearly = items.filter(item => item.bill && item.frequency === 'annually').map(item => {
    const renews = nextRenewal(item.bill!, today)
    const remindFrom = reminderFrom(renews, item.bill!)
    return { item, bill: item.bill!, tracked: billTracked(item.bill!, document), renews, ...remindFrom ? { remindFrom } : {} }
  }).sort((a, b) => a.renews.localeCompare(b.renews) || a.item.name.localeCompare(b.item.name, 'en-GB'))
  const undated = items.filter(item => !item.bill && item.frequency === 'annually').sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
  return { monthly, yearly, undated }
}

// ——— Renewals (recurring-bills-rules › Renewals) ———

/** Who's answered which renewal: item id → the renewal date (YYYY-MM-DD) answered with Same price or Save new price. */
export type BillRenewals = Record<string, string>
export type BillsState = { renewals: BillRenewals }

export function validBillsState(value: unknown): value is BillsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const renewals = (value as { renewals?: unknown }).renewals
  if (!renewals || typeof renewals !== 'object' || Array.isArray(renewals)) return false
  return Object.entries(renewals).every(([id, date]) => !!id && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
}

/** How long a renewal that passed unanswered stays on To do, titled "… renewed 6 Dec". */
export const RENEWAL_LATE_DAYS = 28

/**
 * Whether an answer covers a renewal. One answer covers its year: a renewal within six months of the answered date
 * counts as answered, so moving the renewal date while answering doesn't ask again.
 */
export function renewalAnswered(answered: string | undefined, date: string): boolean {
  return !!answered && Math.abs(daysBetween(answered, date)) < 183
}

/**
 * The renewal Home is asking about for a yearly bill, if any: one that passed in the last 4 weeks, or the next one
 * once its reminder has started. Answered or not: the caller checks `renewalAnswered`. None with the reminder off.
 */
export function renewalInView(bill: Pick<RecurringBill, 'day' | 'month' | 'remindWeeks'>, today: string): { date: string; late: boolean } | undefined {
  if ((bill.remindWeeks ?? DEFAULT_REMIND_WEEKS) === 0 || bill.month === undefined) return undefined
  const next = nextRenewal(bill, today)
  const previous = billDate(`${Number(next.slice(0, 4)) - 1}-${next.slice(5, 7)}`, bill.day)
  if (previous < today && daysBetween(previous, today) <= RENEWAL_LATE_DAYS) return { date: previous, late: true }
  const from = reminderFrom(next, bill)
  return from && today >= from ? { date: next, late: false } : undefined
}

export type RenewalInView = { item: BudgetItem; bill: RecurringBill; date: string; late: boolean; tracked: boolean; answered: boolean }

/** Every yearly bill in this month's plan with a renewal in view, soonest first. */
export function renewalsInView(document: Pick<BudgetDocument, 'budget' | 'card' | 'bills'>, today: string): RenewalInView[] {
  const rows: RenewalInView[] = []
  for (const item of resolveBudget(document.budget, today.slice(0, 7)).items) {
    if (!item.bill || item.frequency !== 'annually') continue
    const view = renewalInView(item.bill, today)
    if (!view) continue
    rows.push({ item, bill: item.bill, ...view, tracked: billTracked(item.bill, document), answered: renewalAnswered(document.bills?.renewals[item.id], view.date) })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.item.name.localeCompare(b.item.name, 'en-GB'))
}

/** How far ahead Home's Coming up lists bills. */
export const BILLS_AHEAD_DAYS = 7

/** The bills that come out from today to `days` days ahead, across a month end, by date then name. */
export function billsAhead(document: Pick<BudgetDocument, 'budget' | 'card'>, today: string, days = BILLS_AHEAD_DAYS): MonthBill[] {
  const until = addDays(today, days)
  const months = [...new Set([today.slice(0, 7), until.slice(0, 7)])]
  return months.flatMap(month => monthBills(document, month, today)).filter(bill => bill.date >= today && bill.date <= until)
}

/** A new yearly price, and optionally a new renewal day and month, from the renewal's month. */
export type RenewalChange = { entryAmountPence: number; day: BillDay; month: number }

/**
 * Answer a renewal (recurring-bills-rules › Renewals): Same price records it; with a change, Save new price also edits
 * the item from the renewal's month, by snapshot rules. Unchanged when the item isn't a yearly bill that month.
 */
export function answerRenewal(document: BudgetDocument, itemId: string, date: string, change?: RenewalChange): BudgetDocument {
  const month = date.slice(0, 7)
  const item = resolveBudget(document.budget, month).items.find(row => row.id === itemId)
  if (!item?.bill || item.frequency !== 'annually') return document
  const answered: BudgetDocument = { ...document, bills: { renewals: { ...document.bills?.renewals, [itemId]: date } } }
  if (!change) return answered
  const same = change.entryAmountPence === item.entryAmountPence && change.day === item.bill.day && change.month === item.bill.month
  if (same) return answered
  return { ...answered, budget: updateBudgetAtMonth(document.budget, month, items => items.map(row => row.id === itemId && row.bill
    ? { ...row, entryAmountPence: change.entryAmountPence, amountPence: monthlyContributionPence(change.entryAmountPence, 'annually'), bill: { ...row.bill, day: change.day, month: change.month } }
    : row)) }
}

/** Whether Save new price can change the item's price: not when it's split by fixed amounts that must add up to it. */
export function renewalPriceEditable(item: Pick<BudgetItem, 'funding'>): boolean {
  return item.funding !== 'fixed'
}

/** The next renewal after the one being answered, for a chosen day and month (YYYY-MM-DD). */
export function renewalAfter(date: string, day: BillDay, month: number): string {
  const mm = String(month).padStart(2, '0'), year = Number(date.slice(0, 4))
  const same = billDate(`${year}-${mm}`, day)
  return same > date ? same : billDate(`${year + 1}-${mm}`, day)
}

/** Undo for an answer: puts back the answer before it and, when the price changed, the renewal month's plan. */
export function undoRenewalAnswer(before: BudgetDocument, itemId: string, date: string): (current: BudgetDocument) => BudgetDocument {
  const month = date.slice(0, 7)
  const answered = before.bills?.renewals[itemId]
  const snapshot = before.budget.snapshots[month]
  return current => {
    const renewals = { ...current.bills?.renewals }
    if (answered) renewals[itemId] = answered
    else delete renewals[itemId]
    const snapshots = { ...current.budget.snapshots }
    if (snapshot) snapshots[month] = snapshot
    else delete snapshots[month]
    return { ...current, bills: { renewals }, budget: { ...current.budget, snapshots } }
  }
}
