import type { BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { monthSpending, potSettings, spentByDestination, monthTransactions, type MonthSpending } from './cardSpending'
import { statementSummary } from './cardStatements'
import { toMove } from './setAside'
import { potBalance } from './potBalances'
import { addDays, bufferOf, cardTracker, closeDateFor, daysBetween, destinationKey, lastDayOf, localDate, monthOf, sameDestination, shiftMonth, statementKey, type CardTracker, type CoverSource, type MonthCover, type MonthRecord } from './cardTracker'
import { moneyArrives } from './workingDays'
import { resolveBudget, type BudgetDestination } from './monthlyBudget'
import { orderTransferAccounts, personTransferPlans } from './personTransfers'
import { buildTransferInstructions, type TransferInstructions } from './transferInstructions'
import { personProgress, stepStatus, type StepTick } from './transferTicks'

/** Days after a month ends before its last postings are trusted to be in (§6.10). */
export const LATE_POSTING_DAYS = 3

// ——— Funding: the month's payday steps (Transfers) ———

export type Funding = { total: number; done: number; changed: number }

/** How far through a month's payday steps the household is: the same steps and ticks as Transfers. */
export function paydayProgress(document: Pick<BudgetDocument, 'budget' | 'household' | 'ticks'>, month: string): Funding {
  const ids = document.household.adults.map(person => person.id)
  const items = resolveBudget(document.budget, month).items
  const transfers = budgetTransfers(document.budget, ids, month, items)
  let instructions: TransferInstructions | undefined
  try { instructions = buildTransferInstructions(document as BudgetDocument, month) } catch { /* No steps when they can't be worked out. */ }
  const plans = personTransferPlans(orderTransferAccounts(transfers.accounts, instructions, document.budget.accounts, ids, new Map()), instructions, ids)
  return plans.people.map(plan => personProgress(plan, document.ticks?.[month])).reduce((sum, row) => ({ total: sum.total + row.total, done: sum.done + row.done, changed: sum.changed + row.changed }), { total: 0, done: 0, changed: 0 })
}

// ——— Stages (§6.9) ———

export type MonthStage = 'upcoming' | 'funding' | 'funded' | 'in-progress' | 'closing' | 'to-settle' | 'settled'
export type MonthStatus = {
  month: string
  stage: MonthStage
  funding: Funding
  closedAt?: string
  /** Statements holding any of the month's transactions. */
  statements: string[]
  unsettled: string[]
}

/** The statements a month's purchases and refunds sit on. */
export const monthStatementKeys = (tracker: Pick<CardTracker, 'transactions'>, month: string) => [...new Set(monthTransactions(tracker, month).map(row => row.statementKey))].sort()

/**
 * A month's stage: upcoming / funding / funded before it starts (by its payday ticks), in progress while
 * today is in it, then closing until it's closed, to settle until every statement holding its transactions
 * is settled, then settled.
 */
export function monthStage(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, month: string, today: string): MonthStatus {
  const tracker = cardTracker(document)
  const funding = paydayProgress(document, month)
  const record = tracker.months[month]
  const statements = monthStatementKeys(tracker, month)
  const unsettled = statements.filter(key => !statementSummary(document, key, today)?.settled)
  const base = { month, funding, statements, unsettled, ...record?.closedAt ? { closedAt: record.closedAt } : {} }
  const current = monthOf(today)
  if (month > current) return { ...base, stage: funding.total > 0 && funding.done === funding.total ? 'funded' : funding.done > 0 ? 'funding' : 'upcoming' }
  if (month === current) return { ...base, stage: 'in-progress' }
  if (!record?.closedAt) return { ...base, stage: 'closing' }
  return { ...base, stage: unsettled.length ? 'to-settle' : 'settled' }
}

// ——— Closing a month (§6.10) ———

export type CoverOption = { source: CoverSource; leftPence?: number }
export type Overspend = { potId: string; overPence: number; cover: MonthCover; options: CoverOption[]; stepKey: string }
export type Leftover = { potId: string; leftPence: number; plannedPence: number; builtUpPence: number; flag?: { limitPence: number; movePence: number } }
export type CloseReadiness = { toSort: number; lastImportDate?: string; postingsIn: boolean; allIn: boolean; canClose: boolean }
export type ClosePlan = {
  month: string
  figures: MonthSpending
  readiness: CloseReadiness
  overspends: Overspend[]
  leftovers: Leftover[]
  carryOver: Array<{ potId: string; freePence?: number; checkedAt?: string }>
  closedAt?: string
  /** Destinations whose spending changed after the month was closed. */
  changedSinceClosed: Array<{ key: string; destination: BudgetDestination; closedPence: number; nowPence: number }>
}

export const coverKey = (potId: string) => `cover:${potId}`

/** Money left in a monthly pot at close: Planned − Spent − what last month took − what covers took from it. */
function leftAfterCovers(figures: MonthSpending, covers: readonly MonthCover[], potId: string) {
  const row = figures.rows.find(item => item.key === `pot:${potId}`)
  if (!row) return 0
  const given = covers.filter(cover => cover.source.kind === 'pot' && cover.source.potId === potId).reduce((sum, cover) => sum + cover.amountPence, 0)
  return row.leftPence - given
}

/** Built up in a monthly pot: Σ leftovers of closed months, without `exceptMonth`, minus what was moved out (D8). */
export function builtUp(tracker: Pick<CardTracker, 'months' | 'pots'>, potId: string, exceptMonth?: string): number {
  const left = Object.entries(tracker.months).filter(([month]) => month !== exceptMonth).reduce((sum, [, record]) => sum + (record.leftovers?.[potId] ?? 0), 0)
  return left - (tracker.pots[potId]?.movedOut ?? []).reduce((sum, row) => sum + row.pence, 0)
}

/** Everything the Close <Month> screen needs: readiness, overspends with their covers, leftovers and the build-up flag. */
export function closeMonthPlan(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, month: string, today: string): ClosePlan | null {
  const tracker = cardTracker(document)
  const card = tracker.cards[0]
  if (!card) return null
  const record = tracker.months[month]
  const figures = monthSpending(document, month, today)
  const monthly = figures.rows.filter(row => row.destination.kind === 'pot' && !row.carriesOver && row.plannedPence > 0)
  const potId = (row: { destination: BudgetDestination }) => (row.destination as { potId: string }).potId
  const lastImportDate = [...tracker.imports].reverse()[0]?.at
  const toSort = monthTransactions(tracker, month).filter(row => !row.sort).length
  const postingsIn = !!lastImportDate && lastImportDate.slice(0, 10) >= addDays(lastDayOf(month), LATE_POSTING_DAYS)
  const allIn = !!record?.allInAt
  const readiness: CloseReadiness = { toSort, ...lastImportDate ? { lastImportDate } : {}, postingsIn, allIn, canClose: today > lastDayOf(month) && toSort === 0 && (postingsIn || allIn) }
  const buffer = bufferOf(card)
  const stored = record?.covers ?? []
  const overRows = monthly.filter(row => row.leftPence < 0)
  // A cover keeps its chosen source, at today's overspend.
  const covers: MonthCover[] = overRows.map(row => {
    const chosen = stored.find(cover => cover.potId === potId(row))
    return { potId: potId(row), amountPence: -row.leftPence, source: chosen?.source ?? buffer }
  })
  const overspends: Overspend[] = overRows.map((row, index) => {
    const others = monthly.filter(other => other.leftPence > 0 && potId(other) !== potId(row)).sort((a, b) => b.leftPence - a.leftPence)
    const options: CoverOption[] = [{ source: buffer }, ...others.map(other => ({ source: other.destination, leftPence: leftAfterCovers(figures, covers.filter((_, at) => at !== index), potId(other)) })), { source: { kind: 'next-month' } }]
    return { potId: potId(row), overPence: -row.leftPence, cover: covers[index]!, options: options.filter((option, at) => options.findIndex(other => sourceKey(other.source) === sourceKey(option.source)) === at), stepKey: coverKey(potId(row)) }
  })
  const leftovers: Leftover[] = monthly.filter(row => row.leftPence > 0).map(row => {
    const left = Math.max(0, leftAfterCovers(figures, covers, potId(row)))
    const settings = potSettings(document, potId(row))
    const total = builtUp(tracker, potId(row), month) + left
    const limitPence = Math.round(settings.buildUpLimit * row.plannedPence)
    const kept = tracker.pots[potId(row)]?.keptBuildUpPence
    const flagged = total > limitPence && (kept === undefined || total > kept)
    return { potId: potId(row), leftPence: left, plannedPence: row.plannedPence, builtUpPence: total, ...flagged ? { flag: { limitPence, movePence: total - row.plannedPence } } : {} }
  }).filter(row => row.leftPence > 0)
  const carryOver = figures.rows.filter(row => row.carriesOver && row.destination.kind === 'pot').map(row => { const free = potBalance(document, potId(row), today); return { potId: potId(row), ...free.freePence !== undefined ? { freePence: free.freePence, checkedAt: free.checked!.at } : {} } })
  const spentNow = spentByDestination(monthTransactions(tracker, month))
  const changedSinceClosed = record?.closedSpent ? [...new Set([...Object.keys(record.closedSpent), ...spentNow.keys()])].flatMap(key => {
    const closedPence = record.closedSpent![key] ?? 0, nowPence = spentNow.get(key)?.pence ?? 0
    const destination = spentNow.get(key)?.destination ?? (key.startsWith('pot:') ? { kind: 'pot' as const, potId: key.slice(4) } : { kind: 'account' as const, accountId: key.slice(8) })
    return closedPence !== nowPence ? [{ key, destination, closedPence, nowPence }] : []
  }) : []
  return { month, figures, readiness, overspends, leftovers, carryOver, ...record?.closedAt ? { closedAt: record.closedAt } : {}, changedSinceClosed }
}

const sourceKey = (source: CoverSource) => source.kind === 'next-month' ? 'next-month' : destinationKey(source)

const withMonth = <T extends Pick<BudgetDocument, 'card'>>(document: T, month: string, change: (record: MonthRecord) => MonthRecord): T => {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, months: { ...tracker.months, [month]: change({ ...tracker.months[month] }) } } }
}

/** Choose where an overspend is covered from. A different source drops the cover's tick. */
export function setCover<T extends Pick<BudgetDocument, 'card'>>(document: T, month: string, cover: MonthCover): T {
  return withMonth(document, month, record => {
    const previous = record.covers?.find(row => row.potId === cover.potId)
    const covers = [...(record.covers ?? []).filter(row => row.potId !== cover.potId), cover]
    const coverTicks = { ...record.coverTicks }
    if (previous && sourceKey(previous.source) !== sourceKey(cover.source)) delete coverTicks[coverKey(cover.potId)]
    const next: MonthRecord = { ...record, covers }
    if (Object.keys(coverTicks).length) next.coverTicks = coverTicks
    else delete next.coverTicks
    return next
  })
}

/** Tick a cover step once the money has moved (or untick it). */
export function setCoverTick<T extends Pick<BudgetDocument, 'card'>>(document: T, month: string, potId: string, amountPence: number | null, now: Date): T {
  return withMonth(document, month, record => {
    const coverTicks: Record<string, StepTick> = { ...record.coverTicks }
    if (amountPence === null) delete coverTicks[coverKey(potId)]
    else coverTicks[coverKey(potId)] = { amountPence, at: now.toISOString() }
    const next: MonthRecord = { ...record, coverTicks }
    if (!Object.keys(coverTicks).length) delete next.coverTicks
    return next
  })
}

export const coverStepStatus = (record: MonthRecord | undefined, overspend: Overspend) => stepStatus(record?.coverTicks, overspend.stepKey, overspend.cover.amountPence)

/** "All <Month> transactions are in": close before the 3-day wait. */
export const markAllIn = <T extends Pick<BudgetDocument, 'card'>>(document: T, month: string, now: Date): T => withMonth(document, month, record => ({ ...record, allInAt: now.toISOString() }))

/**
 * The household's one Close button (D11): records each overspend's cover, each monthly pot's leftover, and what
 * each destination had spent (so a later re-sort shows "Changed since closed"). Closing again updates them.
 */
export function closeMonth<T extends Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>>(document: T, month: string, today: string, now: Date): T {
  const plan = closeMonthPlan(document, month, today)
  if (!plan) return document
  const spent = spentByDestination(monthTransactions(cardTracker(document), month))
  return withMonth(document, month, record => ({
    ...record,
    closedAt: now.toISOString(),
    covers: plan.overspends.map(row => row.cover),
    leftovers: Object.fromEntries(plan.leftovers.map(row => [row.potId, row.leftPence])),
    closedSpent: Object.fromEntries([...spent].map(([key, row]) => [key, row.pence])),
  }))
}

/** "Move £X…": built-up money moved elsewhere in the bank (D8). */
export function moveBuiltUp<T extends Pick<BudgetDocument, 'card'>>(document: T, potId: string, pence: number, now: Date): T {
  const tracker = cardTracker(document)
  const tracking = tracker.pots[potId] ?? {}
  return { ...document, card: { ...tracker, pots: { ...tracker.pots, [potId]: { ...tracking, movedOut: [...(tracking.movedOut ?? []), { pence, at: now.toISOString() }] } } } }
}

/** "Keep it": hide the flag until the build-up grows past today's amount. */
export function keepBuiltUp<T extends Pick<BudgetDocument, 'card'>>(document: T, potId: string, builtUpPence: number): T {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, pots: { ...tracker.pots, [potId]: { ...tracker.pots[potId], keptBuildUpPence: builtUpPence } } } }
}

/** Where a cover comes from, for its step: an account's main balance, or another pot. */
export const coverFromAccount = (source: CoverSource): source is Extract<BudgetDestination, { kind: 'account' }> => source.kind === 'account'
export const isNextMonth = (source: CoverSource): source is { kind: 'next-month' } => source.kind === 'next-month'
export const sameSource = (a: CoverSource, b: CoverSource) => a.kind === 'next-month' ? b.kind === 'next-month' : b.kind !== 'next-month' && sameDestination(a, b)
export const previousMonth = (month: string) => shiftMonth(month, -1)

// ——— Home: one card per month that isn't finished (§7.1) ———

export type HomeTask = { key: string; done: boolean; kind: 'sorted' | 'close' | 'settle' | 'bring-in' | 'final-export' | 'transfers' | 'closes-soon' | 'move'; statementKey?: string; amountPence?: number; count?: number; cardId?: string; dueDate?: string; month: string }
export type HomeMonth =
  | { role: 'current'; month: string; status: MonthStatus; figures: MonthSpending; tasks: HomeTask[]; lastImportAt?: string }
  | { role: 'previous'; month: string; status: MonthStatus; tasks: HomeTask[]; overspends: number; leftovers: number }
  | { role: 'next'; month: string; status: MonthStatus; arrives: string[]; early: boolean; tasks: HomeTask[] }
  | { role: 'settled'; month: string; settledAt?: string }

/** When a month's money arrives: each employment source's payday, in the month before (D1). */
export function moneyArrivesDates(document: Pick<BudgetDocument, 'budget' | 'household'>, month: string): string[] {
  const adults = new Set(document.household.adults.map(person => person.id))
  const dates = document.budget.incomeSources.filter(source => source.type === 'employment' && source.payday && adults.has(source.personId)).map(source => moneyArrives(month, source.payday!))
  return [...new Set(dates)].sort()
}

/** Months with card activity or a record, before `current`. */
const pastMonths = (tracker: Pick<CardTracker, 'transactions' | 'months'>, current: string) => [...new Set([...tracker.transactions.filter(row => row.kind !== 'payment').map(row => monthOf(row.date)), ...Object.keys(tracker.months)])].filter(month => month < current).sort()

/**
 * Home's month cards, oldest first: every past month that isn't settled (closing or to settle), the last settled
 * month as a one-liner until the month after it settles, the current month, and next month.
 */
export function homeMonths(document: Pick<BudgetDocument, 'budget' | 'card' | 'household' | 'ticks'>, today: string): HomeMonth[] {
  const tracker = cardTracker(document)
  if (!tracker.cards.length) return []
  const current = monthOf(today), next = shiftMonth(current, 1)
  const cards: HomeMonth[] = []
  const past = pastMonths(tracker, current).map(month => monthStage(document, month, today))
  const settledMonths = past.filter(row => row.stage === 'settled')
  const lastSettled = settledMonths.at(-1)
  if (lastSettled) {
    const after = past.find(row => row.month === shiftMonth(lastSettled.month, 1))
    if (!after || after.stage !== 'settled') {
      const times = lastSettled.statements.map(key => tracker.statements[key]?.settledAt).filter((at): at is string => !!at).sort()
      cards.push({ role: 'settled', month: lastSettled.month, ...times.at(-1) ?? lastSettled.closedAt ? { settledAt: times.at(-1) ?? lastSettled.closedAt } : {} })
    }
  }
  for (const status of past.filter(row => row.stage !== 'settled')) {
    const plan = closeMonthPlan(document, status.month, today)!
    const tasks: HomeTask[] = [
      { key: `sorted:${status.month}`, kind: 'sorted', month: status.month, done: plan.readiness.toSort === 0 && (plan.readiness.postingsIn || plan.readiness.allIn) },
      { key: `close:${status.month}`, kind: 'close', month: status.month, done: !!status.closedAt },
      ...status.statements.map(key => { const summary = statementSummary(document, key, today)!; return { key: `settle:${key}`, kind: 'settle' as const, month: status.month, statementKey: key, amountPence: summary.totalPence, dueDate: summary.dueDate, done: summary.settled } }),
    ]
    cards.push({ role: 'previous', month: status.month, status, tasks, overspends: plan.overspends.length, leftovers: plan.leftovers.length })
  }
  const status = monthStage(document, current, today)
  const figures = monthSpending(document, current, today)
  const lastImportAt = [...tracker.imports].reverse()[0]?.at
  const tasks: HomeTask[] = []
  if (!lastImportAt || daysBetween(localDate(new Date(lastImportAt)), today) >= BRING_IN_AFTER_DAYS) tasks.push({ key: 'bring-in', kind: 'bring-in', month: current, done: false })
  for (const card of tracker.cards) {
    // Money sorted since the last move, for the set-aside pot (the Amex pot).
    const rows = toMove(document, card.id)
    if (rows.length) tasks.push({ key: `move:${card.id}`, kind: 'move', month: current, done: false, cardId: card.id, count: rows.length, amountPence: rows.reduce((sum, row) => sum + row.pence, 0) })
    const close = closeDateFor(today, card.closeDay)
    if (addDays(today, 1) === close) tasks.push({ key: `closes:${card.id}`, kind: 'closes-soon', month: current, done: false, statementKey: statementKey(card.id, close) })
  }
  // After a statement closes, ask once for its final export (§7.1).
  for (const key of Object.keys(tracker.statements).concat(tracker.transactions.map(row => row.statementKey))) {
    if (tasks.some(task => task.statementKey === key && task.kind === 'final-export')) continue
    const summary = statementSummary(document, key, today)
    if (summary && !summary.open && !summary.complete && !summary.settled) tasks.push({ key: `final:${key}`, kind: 'final-export', month: current, statementKey: key, done: false })
  }
  cards.push({ role: 'current', month: current, status, figures, tasks, ...lastImportAt ? { lastImportAt } : {} })
  const nextStatus = monthStage(document, next, today)
  const arrives = moneyArrivesDates(document, next)
  const ticks = Object.values(document.ticks?.[next] ?? {})
  const early = !!arrives[0] && ticks.some(tick => tick.at.slice(0, 10) < addDays(arrives[0]!, -EARLY_PAY_DAYS))
  cards.push({ role: 'next', month: next, status: nextStatus, arrives, early, tasks: nextStatus.funding.done > 0 ? [{ key: `transfers:${next}`, kind: 'transfers', month: next, done: nextStatus.funding.done === nextStatus.funding.total }] : [] })
  return cards
}

/** Home asks for a bring-in once the last one is this many days old. */
export const BRING_IN_AFTER_DAYS = 3
/** A payday step ticked this many days before the earliest payday is early pay ("January's money has arrived early"). */
export const EARLY_PAY_DAYS = 3
