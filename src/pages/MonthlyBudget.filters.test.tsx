// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); window.localStorage.clear() })
/** Desktop has Expand all in the toolbar; phones keep it in the Filter sheet. */
const expandAll = () => { const direct = screen.queryByRole('button', { name: 'Expand all' }); if (direct) { fireEvent.click(direct); return } fireEvent.click(screen.getByRole('button', { name: /^Filter/ })); fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: 'Expand all' })) }

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
  expandAll()
  expect(screen.getByText('Item 3')).toBeVisible()
  expect(screen.queryByPlaceholderText('Search items')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
})

it('shows search with matching owner and category filters from five items', () => {
  render(<MonthlyBudget document={withItems(5)} setDocument={vi.fn()} month="2026-11"/>)
  expect(screen.getByPlaceholderText('Search items')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
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
const bandNames = (dataGroup: string) => [...document.querySelectorAll(`tr[data-budget-group="${dataGroup}"] .plan-group-name`)].map(name => name.textContent)
const itemNames = () => [...document.querySelectorAll('.budget-v3-item-name')].map(button => button.textContent)

/** Desktop: Owner and Category live in the Filter sheet. */
function filterDesktop(label: 'Owner' | 'Category', value: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Filter/ }))
  fireEvent.change(within(screen.getByRole('dialog', { name: 'Filter' })).getByLabelText(label), { target: { value } })
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: 'Done' }))
}

it('groups the desktop Plan by category only, across owners', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  expect(screen.getByRole('table', { name: 'Budget items by category' })).toBeInTheDocument()
  expect(bandNames('owner')).toEqual([])
  expect(bandNames('category')).toEqual(['Bills', 'Fun'])
  // Desktop opens every group by default (D4).
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone', 'Cinema', 'Books'])
})

it('narrows the desktop Plan with the Owner and Category filters', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  filterDesktop('Owner', 'Ada')
  expect(bandNames('category')).toEqual(['Bills', 'Fun'])
  expect(itemNames()).toEqual(['Phone', 'Books'])
  filterDesktop('Owner', 'All')
  filterDesktop('Category', 'fun')
  expect(bandNames('category')).toEqual(['Fun'])
  expect(itemNames()).toEqual(['Cinema', 'Books'])
})

it('groups phones by category too, with Owner left to the filter', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  expect(bandNames('category')).toEqual(['Bills', 'Fun'])
  expect(screen.getByRole('button', { name: 'Bills, 3 items, £3.00, 60.0% of plan' })).toHaveAttribute('aria-expanded', 'false')
})

it('opens desktop groups by default with each share of the plan, collapses and reopens them, and totals what is shown', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  const card = screen.getByRole('region', { name: 'Budget items' })
  expect(document.querySelector('.plan-toolbar-count')).toHaveTextContent('5 items')
  expect(within(card).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Item', 'Share of plan', 'Monthly', 'Actions'])
  const bills = document.querySelector('tr[data-budget-group="category"]')!
  expect(bills.querySelector('.plan-share')).toHaveTextContent('60.0%')
  expect(bills.querySelector('.plan-group-total')).toHaveTextContent('£3.00')
  expect(card.querySelector('tfoot')).toHaveTextContent('Total 5 items£5.00')
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone', 'Cinema', 'Books'])
  fireEvent.click(screen.getByRole('button', { name: /^Fun,/ }))
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone'])
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
  expect(itemNames()).toEqual([])
  expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument()
  fireEvent.click(bills.querySelector('.plan-share-cell')!)
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone'])
})

it('keeps groups closed for the rest of the session, and opens them again in a new one', () => {
  desktop()
  const { unmount } = render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
  unmount()
  const again = render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  expect(itemNames()).toEqual([])
  again.unmount()
  window.sessionStorage.clear()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone', 'Cinema', 'Books'])
})

it('names the owner and category of each desktop search result', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  const contexts = (query: string) => { fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: query } }); return [...document.querySelectorAll('.budget-v3-result-context')].map(context => context.textContent) }
  expect(contexts('Phone')).toEqual(['Ada · Bills'])
  expect(contexts('Cinema')).toEqual(['Joint · Fun'])
})

it('puts Owner and Category in one Filter sheet on desktop, with a count, removable chips and Clear filters', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  filterDesktop('Owner', 'Ada')
  expect(screen.getByRole('button', { name: 'Filter · 1' })).toHaveAttribute('aria-expanded', 'false')
  expect(within(screen.getByRole('group', { name: 'Active filters' })).getByRole('button', { name: 'Remove filter: Ada’s accounts' })).toBeInTheDocument()
  expect(itemNames()).toEqual(['Phone', 'Books'])
  filterDesktop('Category', 'fun')
  expect(itemNames()).toEqual(['Books'])
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Fun' }))
  expect(itemNames()).toEqual(['Phone', 'Books'])
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Phone', 'Cinema', 'Books'])
  expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument()
})

it('puts phone filters in a sheet behind one Filter button that counts what is active, next to +', () => {
  const onChange = vi.fn()
  render(<MonthlyBudget document={household()} setDocument={onChange} month="2026-11" view="plan"/>)
  expect(screen.queryByLabelText('Owner')).not.toBeInTheDocument()
  expandAll()
  const filter = screen.getByRole('button', { name: 'Filter' })
  fireEvent.click(filter)
  let sheet = screen.getByRole('dialog', { name: 'Filter' })
  expect(within(sheet).getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  fireEvent.change(within(sheet).getByLabelText('Category'), { target: { value: 'fun' } })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
  expect(screen.queryByRole('dialog', { name: 'Filter' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Filter · 1' })).toHaveFocus()
  expect(itemNames()).toEqual(['Cinema', 'Books'])
  fireEvent.click(screen.getByRole('button', { name: 'Filter · 1' }))
  sheet = screen.getByRole('dialog', { name: 'Filter' })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Clear filters' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
  expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
  const add = document.querySelector<HTMLElement>('.plan-toolbar .plan-toolbar-add')!
  expect(add).toHaveAccessibleName('Add item')
  fireEvent.click(add)
  expect(screen.getByRole('form', { name: 'Add item' })).toBeInTheDocument()
})

it('switches between Category and Destination bands, remembers the choice, and keeps each grouping’s open groups', () => {
  desktop()
  const { unmount } = render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  const switcher = screen.getByRole('group', { name: 'Group items by' })
  expect(within(switcher).getByRole('button', { name: 'Category' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: /^Bills,/ }))
  expect(itemNames()).toEqual(['Cinema', 'Books'])
  fireEvent.click(within(switcher).getByRole('button', { name: 'Destination' }))
  expect(within(switcher).getByRole('button', { name: 'Destination' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('table', { name: 'Budget items by destination' })).toBeInTheDocument()
  expect(bandNames('destination')).toHaveLength(2)
  expect(itemNames()).toEqual(['Rent', 'Gas', 'Cinema', 'Phone', 'Books'])
  // Destination bands name the account, so each item's line names its category instead.
  expect(document.querySelector('.budget-v3-item-meta')).toHaveTextContent('Category: Bills')
  fireEvent.click(document.querySelector<HTMLButtonElement>('tr[data-budget-group="destination"] th button')!)
  expect(itemNames()).toEqual(['Phone', 'Books'])
  unmount()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  expect(screen.getByRole('button', { name: 'Destination' })).toHaveAttribute('aria-pressed', 'true')
  expect(itemNames()).toEqual(['Phone', 'Books'])
  fireEvent.click(screen.getByRole('button', { name: 'Category' }))
  expect(itemNames()).toEqual(['Cinema', 'Books'])
})

it('hides the grouping switch while searching', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  expect(screen.queryByRole('group', { name: 'Group items by' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument()
})

it('splits an open category by whose account each item goes to, with subtotals and shares', () => {
  desktop()
  render(<MonthlyBudget document={household()} setDocument={vi.fn()} month="2026-11" view="plan"/>)
  fireEvent.click(screen.getByRole('button', { name: /^Fun,/ }))
  const rows = [...document.querySelectorAll('.plan-card tbody tr')].map(row => row.classList.contains('plan-subgroup') ? `# ${row.textContent}` : row.classList.contains('budget-v3-item') ? `${row.querySelector('.budget-v3-item-name')!.textContent}${row.classList.contains('is-nested') ? ' (nested)' : ''}` : null).filter(Boolean)
  expect(rows).toEqual(['# Joint accounts40.0%£2.00', 'Rent (nested)', 'Gas (nested)', '# Ada’s accounts20.0%£1.00', 'Phone (nested)'])
  // Searching lists matches directly, without the second level.
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  expect(document.querySelector('.plan-subgroup')).toBeNull()
})
