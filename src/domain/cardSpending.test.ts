import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { cumulativeByDay, destinationTransactions, leftByDestination, monthSpending, potSettings, savePotSettings } from './cardSpending'
import { emptyCardTracker, type CardTransaction, type SplitLine } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const joint: BudgetDestination = { kind: 'account', accountId: 'joint' }
let next = 0
const tx = (date: string, lines: Array<[BudgetDestination, number]> | null, overrides: Partial<CardTransaction> = {}): CardTransaction => {
  const amountPence = overrides.amountPence ?? (lines ?? []).reduce((sum, [, pence]) => sum + pence, 0)
  return {
    id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x',
    ...lines ? { sort: { lines: lines.map(([destination, pence]): SplitLine => ({ amountPence: pence, destination })), by: 'person' as const, at: 'x' } } : {}, ...overrides,
  }
}

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] },
    { id: 'ben-own', name: 'Ben', provider: 'Nationwide', ownerPersonIds: ['ben'] },
    { id: 'saver', name: 'Saver', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'], accountTypeId: 'savings-account' },
  ]
  document.budget.pots = [
    { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' },
    { id: 'treats', name: 'Treats', accountId: 'ada-own' }, { id: 'fuel', name: 'Fuel', accountId: 'ben-own' }, { id: 'rainy', name: 'Rainy day', accountId: 'saver' },
  ]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'equal' as const })
  document.budget.snapshots['2026-10'] = { items: [item('g', 'groceries', 52000), item('e', 'eating', 15000), item('b', 'bills', 15000), item('t', 'treats', 20000), item('f', 'fuel', 12000), item('r', 'rainy', 50000)] }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    pots: { bills: { carriesOver: true }, fuel: { pace: 'none' } },
    transactions: [
      tx('2026-11-01', [[pot('groceries'), 7490]]), tx('2026-11-03', [[pot('groceries'), 8835]]), tx('2026-11-05', [[pot('groceries'), 4460]]), tx('2026-11-07', [[pot('groceries'), 4120]]),
      tx('2026-11-08', [[pot('groceries'), 2715]]), tx('2026-11-10', [[pot('groceries'), 6240]]),
      tx('2026-11-06', [[pot('eating'), 6400]]),
      // A split: part Treats, part one-offs on the joint account.
      tx('2026-11-04', [[pot('treats'), 21250], [joint, 11281]]),
      tx('2026-11-06', [[pot('fuel'), 5820]]), tx('2026-11-05', [[pot('bills'), 4197]]),
      tx('2026-10-31', [[pot('groceries'), 9999]]), tx('2026-12-01', [[pot('groceries'), 9999]]),
      tx('2026-11-09', null, { amountPence: 5000 }),
      tx('2026-11-08', null, { amountPence: -35000, kind: 'payment' }),
    ],
  }
  return document
}

describe('pot settings', () => {
  it('defaults to a steady pace, none for carry-over and savings pots, and a 2× build-up limit', () => {
    const document = household()
    expect(potSettings(document, 'groceries')).toEqual({ pace: 'steady', carriesOver: false, buildUpLimit: 2 })
    expect(potSettings(document, 'bills')).toEqual({ pace: 'none', carriesOver: true, buildUpLimit: 2 })
    expect(potSettings(document, 'rainy').pace).toBe('none')
    expect(potSettings(savePotSettings(document, 'groceries', { buildUpLimit: 3, pace: 'none' }), 'groceries')).toEqual({ pace: 'none', carriesOver: false, buildUpLimit: 3 })
    expect(potSettings(savePotSettings(newBudgetDocument(), 'x', { carriesOver: true }), 'x').carriesOver).toBe(true)
  })
})

describe('monthSpending', () => {
  it('works out planned, spent, left and pace on day 12 of November', () => {
    const month = monthSpending(household(), '2026-11', '2026-11-12')
    expect(month).toMatchObject({ when: 'current', day: 12, daysInMonth: 30, daysLeft: 18, needsCare: 2, sortedTo: '2026-12-01' })
    const row = (key: string) => month.rows.find(item => item.key === key)!
    expect(row('pot:groceries')).toMatchObject({ group: 'joint', plannedPence: 52000, spentPence: 33860, leftPence: 18140, status: 'ahead', expectedPence: 20800, aheadPence: 13060, runsOut: '2026-11-19', needsCare: true })
    // A little ahead but within the threshold: on track, though at this rate it would run out a day early.
    expect(row('pot:eating')).toMatchObject({ spentPence: 6400, leftPence: 8600, status: 'on-track', needsCare: false, runsOut: '2026-11-29' })
    expect(row('pot:treats')).toMatchObject({ group: 'ada', spentPence: 21250, leftPence: -1250, status: 'over', needsCare: true })
    expect(row('pot:fuel')).toMatchObject({ group: 'ben', pace: 'none', leftPence: 6180, status: 'left' })
    expect(row('pot:bills')).toMatchObject({ carriesOver: true, spentPence: 4197, status: 'left' })
    expect(row('account:joint')).toMatchObject({ group: 'accounts', plannedPence: 0, spentPence: 11281, status: 'one-offs' })
    // A savings pot with a plan but no card spending stays off the list.
    expect(month.rows.some(item => item.key === 'pot:rainy')).toBe(false)
    expect(month.rows.map(item => item.key)).toEqual(['pot:eating', 'pot:groceries', 'pot:bills', 'pot:treats', 'pot:fuel', 'account:joint'])
    // Unsorted spending and payments don't count; October's and December's rows stay in their months.
    expect(month.spentPence).toBe(33860 + 6400 + 21250 + 5820 + 4197 + 11281)
    expect(month.plannedPence).toBe(52000 + 15000 + 15000 + 20000 + 12000)
  })

  it('lowers spent with a refund in the month it arrives', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-11', [[pot('groceries'), -2500]]))
    expect(monthSpending(document, '2026-11', '2026-11-12').rows.find(row => row.key === 'pot:groceries')).toMatchObject({ spentPence: 31360, leftPence: 20640 })
  })

  it('takes last month’s next-month covers off what’s left', () => {
    const document = household()
    document.card!.months['2026-10'] = { covers: [{ potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } }, { potId: 'groceries', amountPence: 1000, source: joint }] }
    const row = monthSpending(document, '2026-11', '2026-11-12').rows.find(item => item.key === 'pot:eating')!
    expect(row).toMatchObject({ takenPence: 3500, leftPence: 5100 })
    expect(monthSpending(document, '2026-11', '2026-11-12').rows.find(item => item.key === 'pot:groceries')!.takenPence).toBe(0)
  })

  it('has no pace on the first day until something is spent, and none for past months', () => {
    const document = household()
    const first = monthSpending(document, '2026-11', '2026-11-01').rows.find(row => row.key === 'pot:eating')!
    expect(first).toMatchObject({ spentPence: 6400, status: 'ahead', expectedPence: 500 })
    const past = monthSpending(document, '2026-11', '2026-12-03')
    expect(past).toMatchObject({ when: 'past', day: 30, daysLeft: 0 })
    expect(past.rows.find(row => row.key === 'pot:groceries')).toMatchObject({ status: 'left' })
    expect(past.rows.find(row => row.key === 'pot:groceries')).not.toHaveProperty('expectedPence')
    expect(past.rows.find(row => row.key === 'pot:treats')!.status).toBe('over')
  })

  it('handles the last day of a 31-day month and a month with no plan', () => {
    const document = household()
    document.card!.transactions = [tx('2026-12-31', [[pot('groceries'), 52000]]), tx('2026-12-02', [[pot('eating'), 100]])]
    const december = monthSpending(document, '2026-12', '2026-12-31')
    expect(december).toMatchObject({ day: 31, daysInMonth: 31, daysLeft: 0 })
    expect(december.rows.find(row => row.key === 'pot:groceries')).toMatchObject({ expectedPence: 52000, status: 'on-track', leftPence: 0 })
    const empty = household()
    empty.budget.snapshots = {}
    empty.card!.transactions = [tx('2026-11-03', [[pot('groceries'), 1000]])]
    expect(monthSpending(empty, '2026-11', '2026-11-12').rows).toEqual([expect.objectContaining({ key: 'pot:groceries', plannedPence: 0, status: 'one-offs' })])
  })

  it('is empty for a future month', () => {
    expect(monthSpending(household(), '2027-01', '2026-11-12')).toMatchObject({ when: 'future', day: 0, daysLeft: 31, spentPence: 0 })
  })
})

describe('pot detail', () => {
  it('builds a cumulative line by day and lists the pot’s transactions', () => {
    const document = household()
    const points = cumulativeByDay(document.card!, '2026-11', pot('groceries'), 12)
    expect(points).toHaveLength(12)
    expect(points[0]).toEqual([1, 7490])
    expect(points[11]).toEqual([12, 33860])
    expect(destinationTransactions(document.card!, '2026-11', pot('groceries')).map(row => row.date)).toEqual(['2026-11-10', '2026-11-08', '2026-11-07', '2026-11-05', '2026-11-03', '2026-11-01'])
  })

  it('gives the sort sheet what’s left for each planned pot', () => {
    const left = leftByDestination(household(), '2026-11')
    expect(left.get('pot:groceries')).toBe(18140)
    expect(left.get('pot:rainy')).toBe(50000)
    expect(left.has('pot:bills')).toBe(false)
  })
})
