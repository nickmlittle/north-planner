import type { BudgetDocument } from './budgetDocument'
import { type BillSum, homeBill } from './billSum'
import { monthSpending, plannedByDestination } from './cardSpending'
import { bufferOf, cardTracker, destinationKey, shiftMonth, type CoverSource } from './cardTracker'
import { closeMonthPlan, coverStepStatus } from './monthStages'
import type { BudgetDestination } from './monthlyBudget'
import { potKind } from './potKinds'
import { formatGBP } from '../formatting/money'

/**
 * "How did November go?" (month-health PR 11, P8): the closed month in one place. Worked out from the month's record,
 * its figures and the close plan, so it needs nothing stored but `summarySeenAt`. Tracked pots only get a verdict
 * (D3, D4); Bills and Saving get their own lines.
 */

/** The summary leads Home until "Seen it", or until this day of the month after the one it covers. */
export const SUMMARY_UNTIL_DAY = 7

export type SummaryPot = {
  potId: string
  name: string
  plannedPence: number
  spentPence: number
  /** Planned − Spent − Taken at close, before any cover. Negative is over. */
  leftPence: number
  /** What the pot spent the month before, when it had a row. */
  lastMonthSpentPence?: number
}
export type SummaryCover = { potId: string; name: string; pence: number; source: CoverSource; ticked: boolean }
export type SummaryLeftover = { potId: string; name: string; leftPence: number; builtUpPence: number }
export type MonthSummary = {
  month: string
  closedAt: string
  seen: boolean
  /** "Groceries £77.03 over. Going out £103.87 left." Absent when no pot is Tracked. */
  verdict?: string
  tracked: SummaryPot[]
  trackedPlannedPence: number
  trackedSpentPence: number
  /** Tracked pots' spending the month before, when any. */
  lastMonthSpentPence?: number
  bills?: { plannedPence: number; spentPence: number }
  /** Put by this month, and what was spent from the Saving pots. */
  saving?: { plannedPence: number; spentPence: number }
  covers: SummaryCover[]
  /** Overspends the buffer is covering. */
  fromBufferPence: number
  /** Cover taken from the next month's pot: it starts that much short. */
  nextMonthPence: number
  leftovers: SummaryLeftover[]
  /** The bill Home shows now: the oldest unpaid one, else the open one. */
  bill: BillSum | null
}

const pounds = (pence: number) => formatGBP(pence / 100)

/** The closed month whose summary leads Home today: the latest closed month not yet seen, until the 7th of the month after. */
export function summaryMonth(document: Pick<BudgetDocument, 'card'>, today: string): string | null {
  const { months } = cardTracker(document)
  const open = Object.entries(months).filter(([month, record]) => record.closedAt && !record.summarySeenAt && today <= `${shiftMonth(month, 1)}-${String(SUMMARY_UNTIL_DAY).padStart(2, '0')}`).map(([month]) => month).sort()
  return open.at(-1) ?? null
}

/** "Seen it": the summary stops leading Home. */
export function markSummarySeen<T extends Pick<BudgetDocument, 'card'>>(document: T, month: string, now: Date): T {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, months: { ...tracker.months, [month]: { ...tracker.months[month], summarySeenAt: now.toISOString() } } } }
}

/** Null until the month has been closed. */
export function monthSummary(document: BudgetDocument, month: string, today: string): MonthSummary | null {
  const tracker = cardTracker(document)
  const record = tracker.months[month]
  const plan = closeMonthPlan(document, month, today)
  if (!record?.closedAt || !plan) return null
  const potName = (potId: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
  const before = monthSpending(document, shiftMonth(month, -1), today)
  const rows = plan.figures.rows.filter(row => row.destination.kind === 'pot')
  const potId = (row: { destination: BudgetDestination }) => row.destination.kind === 'pot' ? row.destination.potId : ''
  const tracked: SummaryPot[] = rows.filter(row => row.kind === 'tracked' && row.plannedPence > 0).map(row => {
    const last = before.rows.find(item => item.key === row.key && item.kind === 'tracked')
    return { potId: potId(row), name: potName(potId(row)), plannedPence: row.plannedPence, spentPence: row.spentPence + row.takenPence, leftPence: row.leftPence, ...last ? { lastMonthSpentPence: last.spentPence + last.takenPence } : {} }
  })
  const lastTotal = tracked.reduce((sum, row) => sum + (row.lastMonthSpentPence ?? 0), 0)
  // Bills and Saving read the plan: a Saving pot with nothing spent from it has no spending row.
  const group = (kind: 'carries-over' | 'saving') => {
    const planned = [...plannedByDestination(document, month).values()].filter(row => row.destination.kind === 'pot' && row.pence > 0 && potKind(document, potId(row)) === kind)
    if (!planned.length) return undefined
    return { plannedPence: planned.reduce((sum, row) => sum + row.pence, 0), spentPence: planned.reduce((sum, row) => sum + (rows.find(item => item.key === destinationKey(row.destination))?.spentPence ?? 0), 0) }
  }
  const bills = group('carries-over'), saving = group('saving')
  const covers: SummaryCover[] = plan.overspends.map(row => ({ potId: row.potId, name: potName(row.potId), pence: row.cover.amountPence, source: row.cover.source, ticked: row.cover.source.kind === 'next-month' || coverStepStatus(record, row).state === 'done' }))
  const over = [...tracked].filter(row => row.leftPence < 0).sort((a, b) => a.leftPence - b.leftPence)
  const rest = tracked.filter(row => row.leftPence >= 0).sort((a, b) => a.leftPence - b.leftPence)
  const sentences = [...over.map(row => `${row.name} ${pounds(-row.leftPence)} over`), ...rest.map(row => `${row.name} ${pounds(row.leftPence)} left`)]
  const card = tracker.cards[0]
  const buffer = card && bufferOf(card)
  return {
    month, closedAt: record.closedAt, seen: !!record.summarySeenAt,
    ...sentences.length ? { verdict: `${sentences.join('. ')}.` } : {},
    tracked, trackedPlannedPence: tracked.reduce((sum, row) => sum + row.plannedPence, 0), trackedSpentPence: tracked.reduce((sum, row) => sum + row.spentPence, 0),
    ...lastTotal > 0 ? { lastMonthSpentPence: lastTotal } : {},
    ...bills ? { bills } : {}, ...saving ? { saving } : {},
    covers,
    fromBufferPence: covers.filter(row => row.source.kind !== 'next-month' && !!buffer && destinationKey(row.source) === destinationKey(buffer)).reduce((sum, row) => sum + row.pence, 0),
    nextMonthPence: covers.filter(row => row.source.kind === 'next-month').reduce((sum, row) => sum + row.pence, 0),
    leftovers: plan.leftovers.map(row => ({ potId: row.potId, name: potName(row.potId), leftPence: row.leftPence, builtUpPence: row.builtUpPence })),
    bill: homeBill(document, today),
  }
}
