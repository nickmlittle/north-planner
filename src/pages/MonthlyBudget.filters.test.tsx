// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => cleanup())

function withItems(count: number): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Household', provider: 'Monzo', ownerPersonIds: ['ada'] }]
  document.budget.categories = [{ id: 'bills', name: 'Bills' }]
  document.budget.snapshots['2026-11'] = { items: Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`, name: `Item ${i}`, categoryId: 'bills', destination: { kind: 'account' as const, accountId: 'joint' },
    frequency: 'monthly' as const, entryAmountPence: 100, amountPence: 100, funding: 'equal' as const,
  })) }
  return document
}

it('hides search and filters while the month has fewer than five items', () => {
  render(<MonthlyBudget document={withItems(4)} setDocument={vi.fn()} month="2026-11"/>)
  expect(screen.getByText('Item 3')).toBeVisible()
  expect(screen.queryByPlaceholderText('Search budget')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
})

it('shows search with matching owner and category filters from five items', () => {
  render(<MonthlyBudget document={withItems(5)} setDocument={vi.fn()} month="2026-11"/>)
  expect(screen.getByPlaceholderText('Search budget')).toBeInTheDocument()
  const owner = screen.getByLabelText('Owner'), category = screen.getByLabelText('Category')
  expect(owner).toHaveClass('budget-v3-filter-select')
  expect(category).toHaveClass('budget-v3-filter-select')
})
