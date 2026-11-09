// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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

/** Two adults, a joint and a personal account, two categories: enough to tell owner grouping from category grouping. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Current', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'ada-own', name: 'Spending', provider: 'Starling', ownerPersonIds: ['ada'] },
  ]
  document.budget.categories = [{ id: 'bills', name: 'Bills' }, { id: 'fun', name: 'Fun' }]
  const item = (id: string, name: string, categoryId: string, accountId: string) => ({ id, name, categoryId, destination: { kind: 'account' as const, accountId }, frequency: 'monthly' as const, entryAmountPence: 100, amountPence: 100, funding: 'equal' as const })
  document.budget.snapshots['2026-11'] = { items: [
    item('rent', 'Rent', 'bills', 'joint'), item('gas', 'Gas', 'bills', 'joint'), item('phone', 'Phone', 'bills', 'ada-own'),
    item('cinema', 'Cinema', 'fun', 'joint'), item('books', 'Books', 'fun', 'ada-own'),
  ] }
  return document
}
const desktop = () => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
const bandNames = (dataGroup: string) => [...document.querySelectorAll(`tr[data-budget-group="${dataGroup}"]`)].map(row => row.textContent?.replace(/\d+ items? ·.*$/, '').trim())
const itemNames = () => [...document.querySelectorAll('.budget-v3-item-name')].map(button => button.textContent)

it('groups the desktop Plan by category only, across owners', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" mobileBudgetView="plan"/>)
  expect(screen.getByRole('table', { name: 'Budget items by category' })).toBeInTheDocument()
  expect(bandNames('owner')).toEqual([])
  expect(bandNames('category')).toEqual(['Bills', 'Fun'])
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone', 'Cinema', 'Books'])
})

it('narrows the desktop Plan with the Owner and Category filters', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" mobileBudgetView="plan"/>)
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Ada' } })
  expect(bandNames('category')).toEqual(['Bills', 'Fun'])
  expect(itemNames()).toEqual(['Phone', 'Books'])
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'All' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'fun' } })
  expect(bandNames('category')).toEqual(['Fun'])
  expect(itemNames()).toEqual(['Cinema', 'Books'])
})

it('keeps owner then category groups on phones', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" mobileBudgetView="plan"/>)
  expect(bandNames('category')).toEqual(['Joint · Bills', 'Joint · Fun', 'Ada · Bills', 'Ada · Fun'])
})

it('names the owner and category of each desktop search result', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" mobileBudgetView="plan"/>)
  const contexts = (query: string) => { fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: query } }); return [...document.querySelectorAll('.budget-v3-result-context')].map(context => context.textContent) }
  expect(contexts('Phone')).toEqual(['Ada · Bills'])
  expect(contexts('Cinema')).toEqual(['Joint · Fun'])
})
