import { expect, it } from 'vitest'
import { newBudgetDocument } from './budgetDocument'
import { budgetImpact } from './budgetImpact'
import { updateBudgetAtMonth } from './monthlyBudget'

function fixture() {
  const document = newBudgetDocument()
  document.household.adults = [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }]
  document.budget.categories = [{ id: 'bills', name: 'Bills' }]
  document.budget.accounts = [{ id: 'first', name: 'First', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }, { id: 'second', name: 'Second', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.incomeSources = [{ id: 'pay', personId: 'ada', name: 'Pay', type: 'employment', baseAmountPence: 10001, changes: {} }]
  document.budget.snapshots['2026-11'] = { items: [{ id: 'rent', name: 'Rent', categoryId: 'bills', destination: { kind: 'account', accountId: 'first' }, entryAmountPence: 10001, amountPence: 10001, frequency: 'monthly', funding: 'equal' }] }
  return document
}

it('previews exact contribution and shortfall changes through the Transfers calculation', () => {
  const before = fixture()
  const after = { ...before, budget: updateBudgetAtMonth(before.budget, '2026-11', items => items.map(item => ({ ...item, entryAmountPence: 10003, amountPence: 10003 }))) }
  const result = budgetImpact(before, after, '2026-11', ['rent'])
  expect(result).toMatchObject({ impact: { beforeBalancePence: 0, afterBalancePence: -2, people: [{ personId: 'ada', beforePence: 5001, afterPence: 5002 }, { personId: 'ben', beforePence: 5000, afterPence: 5001 }], accounts: [{ accountId: 'first', beforePence: 10001, afterPence: 10003 }] } })
})

it('marks both destinations for a move and ignores name-only changes', () => {
  const before = fixture()
  const moved = { ...before, budget: updateBudgetAtMonth(before.budget, '2026-11', items => items.map(item => ({ ...item, destination: { kind: 'account' as const, accountId: 'second' } }))) }
  expect(budgetImpact(before, moved, '2026-11', ['rent'])).toMatchObject({ impact: { accounts: [{ accountId: 'first', beforePence: 10001, afterPence: 0 }, { accountId: 'second', beforePence: 0, afterPence: 10001 }] } })
  const renamed = { ...before, budget: updateBudgetAtMonth(before.budget, '2026-11', items => items.map(item => ({ ...item, name: 'New rent' }))) }
  expect(budgetImpact(before, renamed, '2026-11', ['rent'])).toMatchObject({ impact: { accounts: [] } })
})
