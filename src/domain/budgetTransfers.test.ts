import { expect, it } from 'vitest'
import { defaultMonthlyBudget } from './monthlyBudget'
import { budgetTransfers } from './budgetTransfers'

it('splits monthly items in proportion to net income and keeps pence exact', () => {
  const budget = defaultMonthlyBudget()
  budget.incomes = [
    { personId: 'alex', monthlyNetPence: 400000, mode: 'all-income', liveOnPence: 0, surplusPotId: '' },
    { personId: 'sam', monthlyNetPence: 200000, mode: 'all-income', liveOnPence: 0, surplusPotId: '' },
  ]
  budget.lines = [{ id: 'rent', category: 'Living Expenses', ownerName: 'Joint', name: 'Rent', entryAmountPence: 100001, frequency: 'monthly', amountPence: 100001, potId: 'bills', funding: 'proportional' }]
  const result = budgetTransfers(budget, ['alex', 'sam'])
  expect(result.plannedPence).toBe(100001)
  expect(result.remainingPence).toBe(499999)
  expect(result.people.map(person => person.pots[0]?.amountPence)).toEqual([66667, 33334])
})

it('routes lifestyle surplus to a savings destination', () => {
  const budget = defaultMonthlyBudget()
  budget.incomes = [{ personId: 'alex', monthlyNetPence: 400000, mode: 'live-on', liveOnPence: 300000, surplusPotId: 'savings' }]
  expect(budgetTransfers(budget, ['alex'])).toMatchObject({ spendablePence: 300000, surplusPence: 100000, pots: [{ potId: 'savings', amountPence: 100000 }] })
})
