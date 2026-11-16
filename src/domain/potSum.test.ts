import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance } from './potBalances'
import { savePotKind } from './potKinds'
import { potSum } from './potSum'
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
