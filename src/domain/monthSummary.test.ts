import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { monthSpending, needsALook } from './cardSpending'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { closeMonth, markAllIn, setCover, setCoverTick } from './monthStages'
import { markSummarySeen, monthSummary, summaryMonth } from './monthSummary'
import type { BudgetDestination } from './monthlyBudget'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, statementKey = 'amex:2026-10-24'): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {},
})
const now = new Date('2026-11-04T09:00:00Z')

/** October: Groceries £8.20 left, Eating out £35.00 over, Car £45.00 left, Bills (carries over) £40.00 gone out, Holidays (Saving) put by. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'car', name: 'Car', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }, { id: 'holidays', name: 'Holidays', accountId: 'joint' }]
  document.budget.incomeSources = [{ id: 'a', personId: 'ada', name: 'Pay', type: 'employment', baseAmountPence: 300000, changes: {} }, { id: 'b', personId: 'ben', name: 'Pay', type: 'employment', baseAmountPence: 200000, changes: {} }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  const items = [item('g', 'groceries', 52000), item('e', 'eating', 15000), item('c', 'car', 8000), item('b', 'bills', 15000), item('h', 'holidays', 20000)]
  document.budget.snapshots['2026-09'] = { items }
  document.budget.snapshots['2026-10'] = { items }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    pots: { bills: { kind: 'carries-over', carriesOver: true }, holidays: { kind: 'saving' } },
    transactions: [tx('2026-09-06', pot('groceries'), 47000, 'amex:2026-09-24'), tx('2026-09-15', pot('eating'), 12000, 'amex:2026-09-24'),
      tx('2026-10-05', pot('groceries'), 51180), tx('2026-10-10', pot('eating'), 18500), tx('2026-10-12', pot('car'), 3500), tx('2026-10-28', pot('bills'), 4000, 'amex:2026-11-24')],
    imports: [{ at: '2026-11-04T08:00:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 1, added: 1, skipped: 0, sortedByRules: 0, latestDate: '2026-10-28', matchesSummary: true }],
  }
  return document
}
const closed = (document = household()) => closeMonth(markAllIn(document, '2026-10', now), '2026-10', '2026-11-04', now)

describe('monthSummary', () => {
  it('is empty until the month is closed', () => {
    expect(monthSummary(household(), '2026-10', '2026-11-04')).toBeNull()
    expect(monthSummary(closed(), '2026-10', '2026-11-04')).not.toBeNull()
  })

  it('judges Tracked pots only: over first, then what is left, the tightest first', () => {
    const summary = monthSummary(closed(), '2026-10', '2026-11-04')!
    expect(summary.verdict).toBe('Eating out £35.00 over. Groceries £8.20 left. Car £45.00 left.')
    expect(summary.tracked.map(row => row.potId).sort()).toEqual(['car', 'eating', 'groceries'])
    expect(summary.trackedPlannedPence).toBe(75000)
    expect(summary.trackedSpentPence).toBe(51180 + 18500 + 3500)
  })

  it('compares each Tracked pot with the month before, once that month has spending', () => {
    const summary = monthSummary(closed(), '2026-10', '2026-11-04')!
    expect(summary.tracked.find(row => row.potId === 'groceries')).toMatchObject({ lastMonthSpentPence: 47000 })
    expect(summary.tracked.find(row => row.potId === 'car')!.lastMonthSpentPence).toBe(0)
    expect(summary.lastMonthSpentPence).toBe(47000 + 12000)
    const alone = household()
    alone.card!.transactions = alone.card!.transactions.filter(row => row.date >= '2026-10-01')
    expect(monthSummary(closed(alone), '2026-10', '2026-11-04')!.lastMonthSpentPence).toBeUndefined()
  })

  it('gives Bills and Saving their own lines, never a verdict', () => {
    const summary = monthSummary(closed(), '2026-10', '2026-11-04')!
    expect(summary.bills).toEqual({ plannedPence: 15000, spentPence: 4000 })
    expect(summary.saving).toEqual({ plannedPence: 20000, spentPence: 0 })
    expect(summary.verdict).not.toMatch(/Bills|Holidays/)
  })

  it('lists covers, how much the buffer covered, and whether each is ticked', () => {
    let document = closed()
    expect(monthSummary(document, '2026-10', '2026-11-04')).toMatchObject({ covers: [{ potId: 'eating', pence: 3500, ticked: false, source: { kind: 'account', accountId: 'joint' } }], fromBufferPence: 3500, nextMonthPence: 0 })
    document = setCoverTick(document, '2026-10', 'eating', 3500, now)
    expect(monthSummary(document, '2026-10', '2026-11-04')!.covers[0]!.ticked).toBe(true)
    // From next month's pot: it moves no money, the buffer covers nothing and next month starts short.
    document = setCover(document, '2026-10', { potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } })
    expect(monthSummary(document, '2026-10', '2026-11-04')).toMatchObject({ fromBufferPence: 0, nextMonthPence: 3500, covers: [{ ticked: true }] })
  })

  it('shows what stays in the pots and the bill that is open now', () => {
    const summary = monthSummary(closed(), '2026-10', '2026-11-04')!
    expect(summary.leftovers.map(row => [row.name, row.leftPence])).toEqual([['Car', 4500], ['Groceries', 820]])
    // No pot pays the Amex bill here, so there is none to show.
    expect(summary.bill).toBeNull()
  })
})

describe('when the summary leads Home (P8)', () => {
  it('leads from close until Seen it, or the 7th of the next month', () => {
    const document = closed()
    expect(summaryMonth(household(), '2026-11-04')).toBeNull()
    expect(summaryMonth(document, '2026-11-04')).toBe('2026-10')
    expect(summaryMonth(document, '2026-11-07')).toBe('2026-10')
    expect(summaryMonth(document, '2026-11-08')).toBeNull()
    const seen = markSummarySeen(document, '2026-10', now)
    expect(summaryMonth(seen, '2026-11-04')).toBeNull()
    expect(monthSummary(seen, '2026-10', '2026-11-04')!.seen).toBe(true)
  })

  it('names the latest closed month that is unseen, and wraps over the year end', () => {
    const document = closed()
    const december = { ...document, card: { ...document.card!, months: { ...document.card!.months, '2026-12': { closedAt: 'x' } } } }
    expect(summaryMonth(december, '2027-01-03')).toBe('2026-12')
    expect(summaryMonth(markSummarySeen(december, '2026-12', now), '2027-01-03')).toBeNull()
    expect(summaryMonth(december, '2027-01-08')).toBeNull()
  })

  it('survives a save and load', () => {
    const seen = markSummarySeen(closed(), '2026-10', now)
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(seen)))?.card?.months['2026-10']?.summarySeenAt).toBe(now.toISOString())
  })
})

describe('Needs a look after close', () => {
  const look = (document: BudgetDocument) => needsALook(document, monthSpending(document, '2026-10', '2026-11-04')).map(row => row.row.key)
  it('drops an overspend once its cover is ticked, or taken from next month', () => {
    const document = closed()
    expect(look(document)).toContain('pot:eating')
    expect(look(setCoverTick(document, '2026-10', 'eating', 3500, now))).not.toContain('pot:eating')
    expect(look(setCover(document, '2026-10', { potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } }))).not.toContain('pot:eating')
  })
  it('keeps it when the tick is for another amount, and before the month closes', () => {
    expect(look(setCoverTick(closed(), '2026-10', 'eating', 3000, now))).toContain('pot:eating')
    expect(look(household())).toContain('pot:eating')
  })
})
