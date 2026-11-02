import { expect, it } from 'vitest'
import { defaultMonthlyBudget } from './monthlyBudget'
import { createPotsForAccounts, planPotCreation } from './bulkPots'

it('rechecks the latest pots, skips matches, and preserves existing records and snapshots', () => {
  const budget = defaultMonthlyBudget()
  budget.accounts = [{ id: 'a', name: 'A', ownerPersonIds: [] }, { id: 'b', name: 'B', ownerPersonIds: [] }]
  const selected = ['a', 'a', 'b']
  expect(planPotCreation(budget, ' Spending ', selected).create).toHaveLength(2)
  budget.pots = [{ id: 'old', name: ' SPENDING ', accountId: 'a' }]
  const next = createPotsForAccounts(budget, ' Spending ', selected, new Map([['a', 'new-a'], ['b', 'new-b']]))
  expect(next.pots).toEqual([budget.pots[0], { id: 'new-b', name: 'Spending', accountId: 'b' }])
  expect(next.pots[0]).toBe(budget.pots[0])
  expect(next.snapshots).toBe(budget.snapshots)
  expect(createPotsForAccounts(next, 'spending', selected, new Map())).toBe(next)
  expect(createPotsForAccounts(next, ' ', selected, new Map())).toBe(next)
})
