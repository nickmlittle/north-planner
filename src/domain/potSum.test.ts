import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance } from './potBalances'
import { savePotKind } from './potKinds'
import { carriedOverByMonth, moneyIn, potSum, recentMonths, typicalShop, weekFigures } from './potSum'
import { recordMove } from './setAside'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})
const at = (date: string, hour = 9) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)

/** Groceries: £520 planned, £50 carried over from October, £80 moved to the Amex pot and £30 still waiting. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  document.budget.snapshots['2026-11'] = { items: [item('g', 'groceries', 52000), item('b', 'bills', 15000)] }
  document.ticks = { '2026-11': { 'household:move:groceries': { amountPence: 52000, at: at('2026-11-01').toISOString() } } }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    pots: { groceries: { checkedBalance: { pence: 5000, at: at('2026-10-31').toISOString() } } },
    months: { '2026-10': { closedAt: 'x', leftovers: { groceries: 5000 } } },
    transactions: [tx('2026-11-03', pot('groceries'), 8000, { id: 'tesco' }), tx('2026-11-10', pot('groceries'), 3000, { id: 'lidl' }), tx('2026-11-11', null, 1250, { id: 'unsorted' })],
  }
  return recordMove(document, 'amex', ['tesco'], at('2026-11-05'), 'm1')
}

describe('the pot sum (D2)', () => {
  it('is Left this month + Waiting to move + Carried over = In the pot', () => {
    const sum = potSum(household(), 'groceries', '2026-11', '2026-11-16')
    expect(sum).toMatchObject({ kind: 'tracked', leftPence: 41000, waitingPence: 3000, carriedOverPence: 5000, inPotPence: 49000, notExplainedPence: 0, fresh: false, toSortPence: 1250, toSort: 1 })
    expect(sum.leftPence! + sum.waitingPence + sum.carriedOverPence!).toBe(sum.inPotPence)
  })

  it('has no In the pot before the first check: Left and Waiting only', () => {
    const document = household()
    delete document.card!.pots.groceries!.checkedBalance
    const sum = potSum(document, 'groceries', '2026-11', '2026-11-16')
    expect(sum).toMatchObject({ leftPence: 41000, waitingPence: 3000 })
    expect(sum.inPotPence).toBeUndefined()
    expect(sum.notExplainedPence).toBeUndefined()
  })

  it('shows what does not add up as Not explained, until the next check (P1)', () => {
    const missed = household()
    missed.ticks = {}
    expect(potSum(missed, 'groceries', '2026-11', '2026-11-16').notExplainedPence).toBe(-52000)
    const checked = checkPotBalance(household(), 'groceries', 48000, at('2026-11-12'))
    expect(potSum(checked, 'groceries', '2026-11', '2026-11-16')).toMatchObject({ inPotPence: 48000, fresh: true, notExplainedPence: -1000 })
  })

  it('keeps carried-over money out of Left (D13)', () => {
    const sum = potSum(household(), 'groceries', '2026-11', '2026-11-16')
    expect(sum.leftPence).toBe(52000 - 11000)
    expect(sum.carriedOverPence).toBe(5000)
  })

  it('has no Not explained for another month: the balance is today’s', () => {
    expect(potSum(household(), 'groceries', '2026-10', '2026-11-16').notExplainedPence).toBeUndefined()
  })

  it('recomputes when a pot changes kind mid-month: a carry-over pot shows Spare', () => {
    const document = savePotKind(household(), 'groceries', 'carries-over')
    const sum = potSum(document, 'groceries', '2026-11', '2026-11-16')
    expect(sum).toMatchObject({ kind: 'carries-over', inPotPence: 49000, waitingPence: 3000, sparePence: 46000 })
    expect(sum.leftPence).toBeUndefined()
    expect(sum.notExplainedPence).toBeUndefined()
  })

  it('has no Left or Carried over for Funded only and Saving pots', () => {
    const sum = potSum(savePotKind(household(), 'groceries', 'saving'), 'groceries', '2026-11', '2026-11-16')
    expect(sum).toMatchObject({ kind: 'saving', inPotPence: 49000, waitingPence: 3000 })
    expect(sum.leftPence).toBeUndefined()
    expect(sum.carriedOverPence).toBeUndefined()
  })
})

describe('the pot page figures (health/5)', () => {
  const monday = '2026-11-16'
  it('spreads Left over the days left to Sunday: This week to Thursday, This weekend from Friday (P3)', () => {
    // Nov 16 is a Monday: 15 days left including today, 7 of them to Sunday.
    expect(weekFigures(30000, '2026-11', '2026-11-16')).toEqual({ label: 'This week', pence: 14000, through: '2026-11-22', days: 7 })
    expect(weekFigures(30000, '2026-11', '2026-11-19')).toMatchObject({ label: 'This week', days: 4, pence: Math.round(30000 * 4 / 12) })
    expect(weekFigures(30000, '2026-11', '2026-11-20')).toMatchObject({ label: 'This weekend', days: 3, pence: Math.round(30000 * 3 / 11) })
    expect(weekFigures(30000, '2026-11', '2026-11-22')).toMatchObject({ label: 'This weekend', days: 1 })
  })

  it('makes it all of Left when the month ends first, and £0.00 over a pot (P3)', () => {
    // 30 Nov is a Monday and the last day; 31 Oct 2026 is a Saturday and the last day.
    expect(weekFigures(9000, '2026-11', '2026-11-30')).toMatchObject({ label: 'This week', pence: 9000, days: 1 })
    expect(weekFigures(9000, '2026-10', '2026-10-31')).toMatchObject({ label: 'This weekend', pence: 9000, through: '2026-10-31', days: 1 })
    expect(weekFigures(-1200, '2026-11', monday)!.pence).toBe(0)
    expect(weekFigures(0, '2026-11', monday)!.pence).toBe(0)
  })

  it('has no weekly figure for a month that is not the current one', () => {
    expect(weekFigures(30000, '2026-10', monday)).toBeUndefined()
    expect(weekFigures(30000, '2026-12', monday)).toBeUndefined()
  })

  it('works out a typical shop from £30+ purchases in the last 3 months, once there are 3 (P4)', () => {
    const document = household()
    document.card!.transactions = [tx('2026-11-03', pot('groceries'), 8000), tx('2026-10-12', pot('groceries'), 4000)]
    expect(typicalShop(document, 'groceries', '2026-11-11')).toBeUndefined()
    document.card!.transactions.push(tx('2026-09-20', pot('groceries'), 6000), tx('2026-11-04', pot('groceries'), 2999), tx('2026-11-05', pot('groceries'), -5000), tx('2026-08-10', pot('groceries'), 90000))
    // £29.99 is under £30, the refund isn't a purchase and 10 Aug is older than 3 months.
    expect(typicalShop(document, 'groceries', '2026-11-11')).toEqual({ pence: 6000, count: 3 })
    document.card!.transactions.push(tx('2026-11-06', pot('bills'), 70000))
    expect(typicalShop(document, 'groceries', '2026-11-11')!.count).toBe(3)
  })

  it('lists Carried over by month and what moved out, adding to builtUp (D13)', () => {
    const document = household()
    document.card!.months['2026-09'] = { closedAt: 'x', leftovers: { groceries: 2500 } }
    document.card!.pots.groceries = { ...document.card!.pots.groceries, movedOut: [{ pence: 1000, at: at('2026-10-20').toISOString() }] }
    const carried = carriedOverByMonth(document, 'groceries', '2026-11')
    expect(carried.months).toEqual([{ month: '2026-10', pence: 5000 }, { month: '2026-09', pence: 2500 }])
    expect(carried.movedOut).toEqual([{ at: at('2026-10-20').toISOString(), pence: 1000 }])
    expect(carried.totalPence).toBe(6500)
    expect(carried.totalPence).toBe(potSum(document, 'groceries', '2026-11', '2026-11-11').carriedOverPence)
    // Asking about October leaves October out, like potSum.
    expect(carriedOverByMonth(document, 'groceries', '2026-10').months).toEqual([{ month: '2026-09', pence: 2500 }])
  })

  it('shows the last 3 months of a pot, leaving out empty ones', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-10-05', pot('groceries'), 30000))
    document.budget.snapshots['2026-10'] = document.budget.snapshots['2026-11']!
    expect(recentMonths(document, 'groceries', '2026-11', '2026-11-11')).toEqual([{ month: '2026-10', plannedPence: 52000, spentPence: 30000, leftPence: 22000 }])
  })

  it('reports what payday moved into a pot and its card spend', () => {
    const document = household()
    expect(moneyIn(document, 'groceries', '2026-11', '2026-11-11')).toEqual({ plannedPence: 52000, movedInPence: 52000, onCardPence: 11000 })
    delete document.ticks
    expect(moneyIn(document, 'groceries', '2026-11', '2026-11-11')).toEqual({ plannedPence: 52000, onCardPence: 11000 })
  })
})
