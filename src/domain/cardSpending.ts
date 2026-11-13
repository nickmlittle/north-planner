import type { BudgetDocument } from './budgetDocument'
import { cardTracker, daysInMonth, DEFAULT_BUILD_UP_LIMIT, destinationKey, monthOf, shiftMonth, type CardTracker, type CardTransaction, type PacePolicy } from './cardTracker'
import { resolveBudget, type BudgetDestination, type BudgetPot } from './monthlyBudget'
import { monthBills, potBillTotals } from './recurringBills'

/** Pace thresholds (§6.5), in one place: ahead of pace when spent − expected ≥ max(£10, 10% of Planned). */
export const PACE_AHEAD_MIN_PENCE = 1000
export const PACE_AHEAD_SHARE = 0.1

export type PotSettings = { pace: PacePolicy; carriesOver: boolean; buildUpLimit: number }

/** A pot's tracking settings with their defaults: steady pace for spending pots; none for carry-over or savings pots. */
export function potSettings(document: Pick<BudgetDocument, 'budget' | 'card'>, potId: string): PotSettings {
  const tracking = document.card?.pots[potId]
  const pot = document.budget.pots.find(row => row.id === potId)
  const account = pot && document.budget.accounts.find(row => row.id === pot.accountId)
  const carriesOver = tracking?.carriesOver ?? false
  const savings = pot?.kind === 'savings' || account?.accountTypeId === 'savings-account' || account?.accountTypeId === 'cash-isa' || account?.accountTypeId === 'stocks-shares-isa' || account?.accountTypeId === 'pension'
  return { pace: tracking?.pace ?? (carriesOver || savings ? 'none' : 'steady'), carriesOver, buildUpLimit: tracking?.buildUpLimit ?? DEFAULT_BUILD_UP_LIMIT }
}

/** Save a pot's settings. Values equal to the defaults are still stored, so a later default change doesn't move them. */
export function savePotSettings<T extends Pick<BudgetDocument, 'card'>>(document: T, potId: string, settings: Partial<PotSettings>): T {
  const tracker = cardTracker(document)
  const tracking = { ...tracker.pots[potId], ...settings.pace !== undefined ? { pace: settings.pace } : {}, ...settings.carriesOver !== undefined ? { carriesOver: settings.carriesOver } : {}, ...settings.buildUpLimit !== undefined ? { buildUpLimit: settings.buildUpLimit } : {} }
  return { ...document, card: { ...tracker, pots: { ...tracker.pots, [potId]: tracking } } }
}

export type PaceStatus = 'over' | 'ahead' | 'on-track' | 'left' | 'one-offs'

export type DestinationSpending = {
  destination: BudgetDestination
  key: string
  /** 'joint', a person's id, or 'accounts' (spend sorted straight to an account). */
  group: string
  plannedPence: number
  /** Card spend sorted here, plus the bills North assumes went out (recurring-bills-rules › Spent). */
  spentPence: number
  /** The part of Spent that's assumed bills: direct debits and payments on another card whose day has come. */
  billsPaidPence: number
  /** This month's bills to the pot that haven't come out yet, tracked or not: "£172.00 of it due". Part of Left. */
  duePence: number
  /** Taken by the previous month's "next month" covers (R1): "£35.00 taken by October". */
  takenPence: number
  /** Planned − Spent − Taken. Negative is over. */
  leftPence: number
  pace: PacePolicy
  carriesOver: boolean
  status: PaceStatus
  /** Steady pots in the current month. */
  expectedPence?: number
  aheadPence?: number
  /** YYYY-MM-DD when the daily average would reach Planned before the month ends. */
  runsOut?: string
  needsCare: boolean
}

export type MonthSpending = {
  month: string
  /** The day the figures were worked out for (YYYY-MM-DD). */
  today: string
  /** 'past', 'current' or 'future' against today. */
  when: 'past' | 'current' | 'future'
  /** Day of the month today (current month), else the month's length or 0. */
  day: number
  daysInMonth: number
  daysLeft: number
  rows: DestinationSpending[]
  plannedPence: number
  spentPence: number
  needsCare: number
  /** The latest transaction date brought in: "Sorted to 10 Nov". */
  sortedTo?: string
}

/** Transactions that count in a month: purchases and refunds dated in it (D2). Payments never count. */
export const monthTransactions = (tracker: Pick<CardTracker, 'transactions'>, month: string) => tracker.transactions.filter(row => row.kind !== 'payment' && monthOf(row.date) === month)

/** Σ split lines by destination for these transactions. */
export function spentByDestination(transactions: readonly CardTransaction[]): Map<string, { destination: BudgetDestination; pence: number }> {
  const spent = new Map<string, { destination: BudgetDestination; pence: number }>()
  for (const transaction of transactions) for (const line of transaction.sort?.lines ?? []) {
    const key = destinationKey(line.destination)
    const row = spent.get(key) ?? { destination: line.destination, pence: 0 }
    row.pence += line.amountPence
    spent.set(key, row)
  }
  return spent
}

/** Planned per destination: the month's resolved items, monthly amounts. */
export function plannedByDestination(document: Pick<BudgetDocument, 'budget'>, month: string): Map<string, { destination: BudgetDestination; pence: number }> {
  const planned = new Map<string, { destination: BudgetDestination; pence: number }>()
  for (const item of resolveBudget(document.budget, month).items) {
    const key = destinationKey(item.destination)
    const row = planned.get(key) ?? { destination: item.destination, pence: 0 }
    row.pence += item.amountPence
    planned.set(key, row)
  }
  return planned
}

/** Who a destination belongs to on this screen: joint pots, each person's pots, then accounts. */
function groupOf(document: Pick<BudgetDocument, 'budget'>, destination: BudgetDestination): string {
  if (destination.kind === 'account') return 'accounts'
  const pot = document.budget.pots.find(row => row.id === destination.potId)
  const owners = document.budget.accounts.find(row => row.id === pot?.accountId)?.ownerPersonIds ?? []
  return owners.length === 1 ? owners[0]! : 'joint'
}

/** "Sorted to" date: the latest transaction date brought in (the posted lag is a few days). */
export const sortedTo = (tracker: Pick<CardTracker, 'transactions'>) => tracker.transactions.reduce<string | undefined>((latest, row) => !latest || row.date > latest ? row.date : latest, undefined)

/**
 * Planned vs spent for each destination in a month (§6.5), with pace for steady pots in the current month.
 * Shows pots with a plan that are paced, pots with a bill this month, and anything with spending; accounts show only
 * what was spent on them. A pot's Spent includes the bills North assumes went out; its Due is the bills still to come
 * (recurring-bills-rules › Spent, Due and pace).
 */
export function monthSpending(document: Pick<BudgetDocument, 'budget' | 'card' | 'household'>, month: string, today: string): MonthSpending {
  const tracker = cardTracker(document)
  const length = daysInMonth(month)
  const when = month < monthOf(today) ? 'past' : month > monthOf(today) ? 'future' : 'current'
  const day = when === 'current' ? Number(today.slice(8)) : when === 'past' ? length : 0
  const planned = plannedByDestination(document, month)
  const spent = spentByDestination(monthTransactions(tracker, month))
  const taken = new Map<string, number>()
  for (const cover of tracker.months[shiftMonth(month, -1)]?.covers ?? []) if (cover.source.kind === 'next-month') taken.set(`pot:${cover.potId}`, (taken.get(`pot:${cover.potId}`) ?? 0) + cover.amountPence)
  const bills = monthBills(document, month, today)
  const billPots = new Set(bills.flatMap(bill => bill.destination.kind === 'pot' ? [`pot:${bill.destination.potId}`] : []))
  const keys = new Set([...planned.keys(), ...spent.keys(), ...taken.keys(), ...billPots])
  const rows: DestinationSpending[] = []
  for (const key of keys) {
    const destination = planned.get(key)?.destination ?? spent.get(key)?.destination ?? { kind: 'pot' as const, potId: key.slice(4) }
    if (destination.kind === 'pot' && !document.budget.pots.some(pot => pot.id === destination.potId)) continue
    const plannedPence = destination.kind === 'pot' ? planned.get(key)?.pence ?? 0 : 0
    const potBills = destination.kind === 'pot' ? potBillTotals(bills, destination.potId) : undefined
    const billsPaidPence = potBills?.assumedPaidPence ?? 0
    const spentPence = (spent.get(key)?.pence ?? 0) + billsPaidPence
    const takenPence = taken.get(key) ?? 0
    const settings = destination.kind === 'pot' ? potSettings(document, destination.potId) : { pace: 'none' as const, carriesOver: false }
    // A pot shows when it's paced and planned, has a bill this month, or anything was spent or taken; accounts only with spending.
    const shown = spentPence !== 0 || takenPence !== 0 || !!potBills?.count || destination.kind === 'pot' && plannedPence > 0 && settings.pace === 'steady'
    if (!shown) continue
    const leftPence = plannedPence - spentPence - takenPence
    const row: DestinationSpending = { destination, key, group: groupOf(document, destination), plannedPence, spentPence, billsPaidPence, duePence: potBills?.duePence ?? 0, takenPence, leftPence, pace: settings.pace, carriesOver: settings.carriesOver, status: 'left', needsCare: false }
    if (destination.kind === 'account' || plannedPence === 0 && !settings.carriesOver) row.status = 'one-offs'
    else if (settings.carriesOver) row.status = 'left'
    else if (leftPence < 0) row.status = 'over'
    else if (settings.pace === 'steady' && when === 'current') {
      // Bills come out on their day, not steadily (P4): expect the ones so far, plus the rest of Planned at a steady pace.
      const billsSoFar = potBills?.soFarPence ?? 0, billsAll = potBills?.allPence ?? 0
      const steadyPlanned = Math.max(0, plannedPence - billsAll)
      const expected = billsSoFar + Math.round(steadyPlanned * day / length)
      const ahead = spentPence + takenPence - expected
      row.expectedPence = expected
      row.status = ahead >= Math.max(PACE_AHEAD_MIN_PENCE, plannedPence * PACE_AHEAD_SHARE) ? 'ahead' : 'on-track'
      if (row.status === 'ahead') row.aheadPence = ahead
      // "Runs out" is the steady spending only: what isn't an assumed bill, against what's planned beyond the bills.
      const average = (spentPence - billsPaidPence + takenPence) / day
      if (average > 0) {
        const runOutDay = Math.ceil(steadyPlanned / average)
        if (runOutDay < length) row.runsOut = `${month}-${String(Math.max(runOutDay, day)).padStart(2, '0')}`
      }
    }
    row.needsCare = row.status === 'over' || row.status === 'ahead'
    rows.push(row)
  }
  const groupOrder = ['joint', ...document.household.adults.map(person => person.id), 'accounts']
  const name = (row: DestinationSpending) => row.destination.kind === 'pot' ? document.budget.pots.find(pot => pot.id === (row.destination as { potId: string }).potId)?.name ?? '' : ''
  rows.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || Number(a.carriesOver) - Number(b.carriesOver) || name(a).localeCompare(name(b), 'en-GB') || a.key.localeCompare(b.key))
  return {
    month, today, when, day, daysInMonth: length, daysLeft: when === 'current' ? length - day : when === 'future' ? length : 0, rows,
    plannedPence: rows.reduce((sum, row) => sum + row.plannedPence, 0), spentPence: rows.reduce((sum, row) => sum + row.spentPence, 0),
    needsCare: rows.filter(row => row.needsCare).length, sortedTo: sortedTo(tracker),
  }
}

/**
 * Cumulative spend by day for a destination, for the pot chart: [day, pence] from day 1 to `throughDay`. `extra` adds
 * other spending on its date, such as the bills North assumes went out.
 */
export function cumulativeByDay(tracker: Pick<CardTracker, 'transactions'>, month: string, destination: BudgetDestination, throughDay: number, extra: ReadonlyArray<{ date: string; destination: BudgetDestination; pence: number }> = []): Array<[number, number]> {
  const key = destinationKey(destination)
  const byDay = new Map<number, number>()
  for (const row of extra) if (monthOf(row.date) === month && destinationKey(row.destination) === key) byDay.set(Number(row.date.slice(8)), (byDay.get(Number(row.date.slice(8))) ?? 0) + row.pence)
  for (const transaction of monthTransactions(tracker, month)) for (const line of transaction.sort?.lines ?? []) if (destinationKey(line.destination) === key) {
    const day = Number(transaction.date.slice(8))
    byDay.set(day, (byDay.get(day) ?? 0) + line.amountPence)
  }
  const points: Array<[number, number]> = []
  let total = 0
  for (let day = 1; day <= throughDay; day++) { total += byDay.get(day) ?? 0; points.push([day, total]) }
  return points
}

/** A destination's transactions in a month, newest first. */
export function destinationTransactions(tracker: Pick<CardTracker, 'transactions'>, month: string, destination: BudgetDestination): CardTransaction[] {
  const key = destinationKey(destination)
  return monthTransactions(tracker, month).filter(row => row.sort?.lines.some(line => destinationKey(line.destination) === key)).sort((a, b) => b.date.localeCompare(a.date))
}

/** "£X left" for every pot with a plan, for the sort sheet's options (the transaction's month). Carry-over pots aren't included. */
export function leftByDestination(document: Pick<BudgetDocument, 'budget' | 'card'>, month: string): Map<string, number> {
  const tracker = cardTracker(document)
  const spent = spentByDestination(monthTransactions(tracker, month))
  const taken = new Map<string, number>()
  for (const cover of tracker.months[shiftMonth(month, -1)]?.covers ?? []) if (cover.source.kind === 'next-month') taken.set(`pot:${cover.potId}`, (taken.get(`pot:${cover.potId}`) ?? 0) + cover.amountPence)
  const left = new Map<string, number>()
  for (const [key, row] of plannedByDestination(document, month)) {
    if (row.destination.kind !== 'pot' || potSettings(document, row.destination.potId).carriesOver) continue
    left.set(key, row.pence - (spent.get(key)?.pence ?? 0) - (taken.get(key) ?? 0))
  }
  return left
}

export const potName = (pots: readonly BudgetPot[], destination: BudgetDestination) => destination.kind === 'pot' ? pots.find(pot => pot.id === destination.potId)?.name : undefined

// ——— Carry-over pots (§6.6): balances and what's free are in potBalances.ts ———

/** The annual costs a carry-over pot saves for: the month's Plan items to it that are entered yearly. */
export function annualCosts(document: Pick<BudgetDocument, 'budget'>, potId: string, month: string) {
  return resolveBudget(document.budget, month).items.filter(item => item.frequency === 'annually' && item.destination.kind === 'pot' && item.destination.potId === potId)
    .map(item => ({ id: item.id, name: item.name, yearlyPence: item.entryAmountPence, monthlyPence: item.amountPence }))
}
