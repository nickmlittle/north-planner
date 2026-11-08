import { expect, it } from 'vitest'
import { budgetEditScope, defaultMonthlyBudget, incomeEditScope, type IncomeSource } from '../domain/monthlyBudget'
import { formatEditScope } from './month'

it('labels the inclusive edit range and excludes the next saved budget', () => {
  const budget = defaultMonthlyBudget()
  budget.snapshots = { '2026-11': { items: [] }, '2027-03': { items: [] } }
  expect(budgetEditScope(budget, '2026-12')).toEqual({ fromMonth: '2026-12', throughMonth: '2027-02' })
  expect(formatEditScope(budgetEditScope(budget, '2026-12'))).toBe('December 2026–February 2027')
  expect(formatEditScope(budgetEditScope(budget, '2027-02'))).toBe('February 2027')
  expect(formatEditScope(budgetEditScope(budget, '2027-03'))).toBe('March 2027 onward')
})

it('handles January boundaries and income histories independently of budget dates', () => {
  const source: IncomeSource = { id: 'pay', personId: 'nick', name: 'Pay', type: 'employment', baseAmountPence: 100, changes: { '2026-11': 150, '2027-01': 200 } }
  expect(formatEditScope(incomeEditScope(source, '2026-11'))).toBe('November 2026–December 2026')
  expect(formatEditScope(incomeEditScope(source, '2027-01'))).toBe('January 2027 onward')
})
