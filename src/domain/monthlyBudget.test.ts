import { expect, it } from 'vitest'
import { defaultMonthlyBudget, resolveMonthBudget } from './monthlyBudget'

it('applies effective-dated income from the selected month onward and preserves earlier months', () => {
  const budget = defaultMonthlyBudget()
  budget.incomes = [{ personId: 'alex', monthlyNetPence: 300000, mode: 'all-income', liveOnPence: 300000, surplusPotId: '' }]
  budget.incomeChanges = {
    '2026-04': [{ personId: 'alex', monthlyNetPence: 350000, mode: 'all-income', liveOnPence: 350000, surplusPotId: '' }],
    '2026-09': [{ personId: 'alex', monthlyNetPence: 400000, mode: 'all-income', liveOnPence: 400000, surplusPotId: '' }],
  }

  expect(resolveMonthBudget(budget, '2026-03').incomes[0]?.monthlyNetPence).toBe(300000)
  expect(resolveMonthBudget(budget, '2026-04').incomes[0]?.monthlyNetPence).toBe(350000)
  expect(resolveMonthBudget(budget, '2026-08').incomes[0]?.monthlyNetPence).toBe(350000)
  expect(resolveMonthBudget(budget, '2026-09').incomes[0]?.monthlyNetPence).toBe(400000)
})
