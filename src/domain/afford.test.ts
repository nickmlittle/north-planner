import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { savePotKind } from './potKinds'
import { affordCheck } from './afford'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {},
})

/** Groceries £300 planned, £100 spent by 22 Nov (day 22 of 30, so £220 would be the steady pace); Going out is a person's own pot. */
function household(spent = 10000): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }, { id: 'ada-a', name: 'Starling', provider: 'Starling', ownerPersonIds: ['ada'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'ada-spend', name: 'Ada spending', accountId: 'ada-a' }, { id: 'holidays', name: 'Holidays', accountId: 'joint', kind: 'savings' }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  document.budget.snapshots['2026-11'] = { items: [item('g', 'groceries', 30000), item('a', 'ada-spend', 20000), item('h', 'holidays', 10000)] }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [tx('2026-11-05', pot('groceries'), spent)],
  }
  return savePotKind(document, 'groceries', 'tracked')
}
const TODAY = '2026-11-22'

describe('affordCheck', () => {
  it('says yes with what would be left, and records nothing', () => {
    const document = household()
    const before = JSON.stringify(document)
    expect(affordCheck(document, 'groceries', 5000, TODAY)).toEqual({ kind: 'within', leftAfterPence: 15000, daysLeft: 8, pace: 'on-pace' })
    expect(JSON.stringify(document)).toBe(before)
  })

  it('says how far behind a steady pace it would put the pot, to the pound', () => {
    // Steady pace to day 22 is £220: £100 + £150 is £30 past it (more than 10% of the plan).
    expect(affordCheck(household(), 'groceries', 15000, TODAY)).toMatchObject({ kind: 'within', leftAfterPence: 5000, pace: 'ahead', aheadPence: 3000 })
  })

  it('says over by how much when it goes past Left, and exactly Left is still yes', () => {
    expect(affordCheck(household(), 'groceries', 20000, TODAY)).toMatchObject({ kind: 'within', leftAfterPence: 0 })
    expect(affordCheck(household(), 'groceries', 21234, TODAY)).toEqual({ kind: 'over', overPence: 1234 })
  })

  it('answers for a pot that is already over', () => {
    expect(affordCheck(household(32000), 'groceries', 1000, TODAY)).toEqual({ kind: 'over', overPence: 3000 })
  })

  it('names the rows to sort and what sorting them here would do', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-21', null, 2400))
    expect(affordCheck(document, 'groceries', 5000, TODAY)).toMatchObject({ kind: 'within', toSort: { count: 1, pence: 2400, leftIfSortedPence: 12600 } })
  })

  it('tells a Funded only pot to check the bank, and whether the Amex is in play', () => {
    expect(affordCheck(household(), 'ada-spend', 5000, TODAY)).toEqual({ kind: 'funded-only', goesOnAmex: true })
  })

  it('is not offered for Saving, the Amex pot, or no amount', () => {
    const document = household()
    expect(affordCheck(document, 'holidays', 5000, TODAY).kind).toBe('not-offered')
    expect(affordCheck(document, 'amex-pot', 5000, TODAY).kind).toBe('not-offered')
    expect(affordCheck(document, 'groceries', 0, TODAY).kind).toBe('not-offered')
  })
})
