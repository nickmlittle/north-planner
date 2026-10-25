import { describe, expect, it } from 'vitest'
import { defaultMonthlyBudget } from './monthlyBudget'
import { budgetTransfers } from './budgetTransfers'

describe('monthly budget', () => {
  it('sweeps income above the chosen lifestyle amount into savings', () => {
    const budget = defaultMonthlyBudget()
    budget.incomes = [{ personId: 'nick', monthlyNetPence: 700000, mode: 'live-on', liveOnPence: 455000, surplusPotId: 'nick-isa' }]
    budget.lines = [{ id: 'rent', name: 'Rent', amountPence: 120000, potId: 'bills', funding: 'proportional' }]
    expect(budgetTransfers(budget, ['nick'])).toMatchObject({ spendablePence: 455000, plannedPence: 120000, surplusPence: 245000, remainingPence: 335000, pots: [{ potId: 'bills', amountPence: 120000 }, { potId: 'nick-isa', amountPence: 245000 }] })
  })
  it('splits pounds proportionally in whole pennies with no lost remainder', () => {
    const budget = defaultMonthlyBudget()
    budget.incomes = [{ personId: 'a', monthlyNetPence: 20000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'nick-isa' }, { personId: 'b', monthlyNetPence: 10000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'immy-isa' }]
    budget.lines = [{ id: 'x', name: 'x', amountPence: 10001, potId: 'bills', funding: 'proportional' }]
    expect(budgetTransfers(budget, ['a', 'b']).people.map(p => p.pots[0]!.amountPence)).toEqual([6667, 3334])
  })
})
