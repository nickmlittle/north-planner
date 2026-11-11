import type { BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { monthSpending, potFree, potSettings, spentByDestination, monthTransactions, type MonthSpending } from './cardSpending'
import { statementSummary } from './cardStatements'
import { addDays, bufferOf, cardTracker, destinationKey, lastDayOf, monthOf, sameDestination, shiftMonth, type CardTracker, type CoverSource, type MonthCover, type MonthRecord } from './cardTracker'
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
  const carryOver = figures.rows.filter(row => row.carriesOver && row.destination.kind === 'pot').map(row => { const free = potFree(document, potId(row)); return { potId: potId(row), ...free.freePence !== undefined ? { freePence: free.freePence, checkedAt: free.checked!.at } : {} } })
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
