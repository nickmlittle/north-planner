// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { buildTransferMatrixModel } from '../domain/transferMatrix'
import { matrixAccountLabels } from './budgetLabels'
import { MobileTransferMatrix } from './MobileTransferMatrix'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

function fixture(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Household', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'personal', name: 'Savings', provider: 'Monzo', ownerPersonIds: ['ada'] },
  ]
  document.budget.pots = [{ id: 'bills-pot', name: 'Bills pot', accountId: 'joint' }]
  document.budget.categories = [{ id: 'bills', name: 'Bills' }]
  document.budget.snapshots['2026-11'] = { items: [
    { id: 'rent', name: 'Rent', categoryId: 'bills', destination: { kind: 'account', accountId: 'joint' }, frequency: 'monthly', entryAmountPence: 10001, amountPence: 10001, funding: 'equal' },
    { id: 'power', name: 'Power', categoryId: 'bills', destination: { kind: 'pot', potId: 'bills-pot' }, frequency: 'monthly', entryAmountPence: 101, amountPence: 101, funding: 'equal' },
    { id: 'water', name: 'Water', categoryId: 'bills', destination: { kind: 'pot', potId: 'bills-pot' }, frequency: 'monthly', entryAmountPence: 50, amountPence: 50, funding: 'equal' },
    { id: 'saving', name: 'Saving', categoryId: 'bills', destination: { kind: 'account', accountId: 'personal' }, frequency: 'monthly', entryAmountPence: 99, amountPence: 99, funding: 'single', singleFunderId: 'ben' },
  ] }
  return document
}

function showMatrix(document: BudgetDocument, onEditItem?: (itemId: string, accountId: string) => void) {
  return render(<MobileTransferMatrix model={buildTransferMatrixModel(document, '2026-11')} labels={matrixAccountLabels(document.budget.accounts, document.household.adults)} onEditItem={onEditItem}/>)
}

describe('mobile transfer matrix', () => {
  it('shows real accounts, allocation labels and independently rounded contribution totals', () => {
    showMatrix(fixture())
    const table = screen.getByRole('table', { name: /Planned contributions by receiving account/ })
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Destination', 'Ada', 'Ben', 'Total'])
    const account = within(table).getByRole('rowheader', { name: 'Joint · Household' }).closest('tr')!
    expect(within(account).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£51', '£51', '£102'])
    const pot = within(table).getByRole('rowheader', { name: /Bills pot/ }).closest('tr')!
    expect(pot).toHaveTextContent('2 items')
    expect(within(pot).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£1', '£1', '£2'])
    const personal = within(table).getByRole('rowheader', { name: 'Ada · Savings' }).closest('tr')!
    expect(within(personal).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£0', '£1', '£1'])
    expect(personal).toHaveTextContent('Direct · Saving')
    const total = within(table).getByRole('rowheader', { name: 'Allocated total' }).closest('tr')!
    expect(within(total).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£51', '£52', '£103'])
    expect(screen.getByText(/Indented rows break down the total above/)).toHaveTextContent('payment status is not tracked')
    expect(screen.getByText(/Rounded to whole pounds/)).toHaveTextContent('may not add up exactly')
    const scrollRegion = screen.getByRole('region', { name: 'Transfer matrix' })
    expect(scrollRegion).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(scrollRegion, { key: 'ArrowRight' })
    expect(scrollRegion.scrollLeft).toBe(120)
    fireEvent.keyDown(scrollRegion, { key: 'ArrowLeft' })
    expect(scrollRegion.scrollLeft).toBe(0)
  })

  it('discloses account and item breakdowns without changing parent totals or table context', () => {
    showMatrix(fixture())
    const table = screen.getByRole('table')
    const joint = screen.getByRole('button', { name: 'Collapse details for Joint · Household' })
    const jointRow = within(table).getByRole('rowheader', { name: 'Joint · Household' }).closest('tr')!
    expect(joint).toHaveAttribute('aria-expanded', 'true')
    expect(within(table).getAllByRole('row')).toHaveLength(6) // heading, two accounts, two allocations, total
    expect(within(table).queryByRole('rowheader', { name: /Power.*Category: Bills/ })).not.toBeInTheDocument()
    const pot = screen.getByRole('button', { name: 'Show items in Bills pot for Joint · Household' })
    const controlledIds = pot.getAttribute('aria-controls')!.split(' ')
    expect(controlledIds).toHaveLength(2)
    controlledIds.forEach(id => expect(document.getElementById(id)).toHaveAttribute('hidden'))
    pot.focus()
    fireEvent.click(pot)
    expect(pot).toHaveFocus()
    expect(pot).toHaveAttribute('aria-expanded', 'true')
    const power = within(table).getByRole('rowheader', { name: /Joint · Household: Bills pot: Power.*Category: Bills/ }).closest('tr')!
    expect(within(power).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£1', '£1', '£1'])
    expect(within(table).getByRole('rowheader', { name: /Joint · Household: Bills pot: Water.*Category: Bills/ })).toBeInTheDocument()
    expect(within(jointRow).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£51', '£51', '£102'])
    fireEvent.click(joint)
    expect(joint).toHaveAttribute('aria-expanded', 'false')
    expect(within(table).queryByRole('rowheader', { name: 'Joint · Household: Bills pot' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('rowheader', { name: /Power.*Category: Bills/ })).not.toBeInTheDocument()
    fireEvent.click(joint)
    expect(screen.getByRole('button', { name: 'Hide items in Bills pot for Joint · Household' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(table).getByRole('rowheader', { name: /Power.*Category: Bills/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide items in Bills pot for Joint · Household' }))
    expect(within(table).queryByRole('rowheader', { name: /Power.*Category: Bills/ })).not.toBeInTheDocument()
  })

  it('keeps a one-item direct account compact until expanded', () => {
    showMatrix(fixture())
    const table = screen.getByRole('table')
    const button = screen.getByRole('button', { name: 'Expand details for Ada · Savings' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(within(table).queryByRole('rowheader', { name: /Ada · Savings: Direct to account: Saving/ })).not.toBeInTheDocument()
    fireEvent.click(button)
    const item = within(table).getByRole('rowheader', { name: /Ada · Savings: Direct to account: Saving.*Category: Bills/ }).closest('tr')!
    expect(within(item).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£0', '£1', '£1'])
    fireEvent.click(button)
    expect(within(table).queryByRole('rowheader', { name: /Ada · Savings: Direct to account: Saving/ })).not.toBeInTheDocument()
  })

  it('hands off the exact disclosed item and receiving account to Plan', () => {
    const onEditItem = vi.fn()
    showMatrix(fixture(), onEditItem)
    expect(screen.queryByRole('button', { name: /Find Power in Plan/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show items in Bills pot for Joint · Household' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find Power in Plan for Joint · Household: Bills pot' }))
    expect(onEditItem).toHaveBeenCalledExactlyOnceWith('power', 'joint')
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for Ada · Savings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find Saving in Plan for Ada · Savings: Direct to account' }))
    expect(onEditItem).toHaveBeenLastCalledWith('saving', 'personal')
  })

  it('qualifies otherwise identical owner and account names', () => {
    const document = fixture()
    document.budget.accounts.push({ id: 'other', name: 'Savings', provider: 'Nationwide', ownerPersonIds: ['ada'] })
    expect(matrixAccountLabels(document.budget.accounts, document.household.adults)).toEqual(new Map([
      ['joint', 'Joint · Household'], ['personal', 'Ada · Savings · Monzo'], ['other', 'Ada · Savings · Nationwide'],
    ]))
  })

  it('shows planned and unallocated amounts and marks affected rows incomplete', () => {
    const document = fixture()
    document.budget.snapshots['2026-11']!.items.push({ id: 'unknown', name: 'Unknown', categoryId: 'bills', destination: { kind: 'pot', potId: 'bills-pot' }, frequency: 'monthly', entryAmountPence: 201, amountPence: 201, funding: 'proportional' })
    showMatrix(document)
    expect(screen.getByRole('status')).toHaveTextContent('£104.52 planned; £2.01 still unallocated')
    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: 'Joint · Household Incomplete' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /Bills pot.*Incomplete/ })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: /Allocated total.*Incomplete/ }).closest('tr')).toHaveTextContent('£103')
    expect(within(table).getByRole('rowheader', { name: 'Ada · Savings' })).not.toHaveTextContent('Incomplete')
  })

  it('explains independent rounding when contributor cells do not add to the shown total', () => {
    const document = fixture()
    document.budget.snapshots['2026-11']!.items = [document.budget.snapshots['2026-11']!.items[1]!]
    showMatrix(document)
    const total = screen.getByRole('rowheader', { name: 'Allocated total' }).closest('tr')!
    expect(within(total).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£1', '£1', '£1'])
    expect(screen.getByText(/Rounded to whole pounds/)).toHaveTextContent('may not add up exactly')
    expect(buildTransferMatrixModel(document, '2026-11').totals).toMatchObject({ allocatedPence: 101, byPerson: [{ amountPence: 51 }, { amountPence: 50 }] })
  })

  it('shows the scroll cue only when the table overflows', () => {
    showMatrix(fixture())
    const region = screen.getByRole('region', { name: 'Transfer matrix' })
    expect(screen.queryByText(/Scroll sideways/)).not.toBeInTheDocument()
    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 300 })
    Object.defineProperty(region, 'scrollWidth', { configurable: true, value: 500 })
    act(() => window.dispatchEvent(new Event('resize')))
    expect(screen.getByText(/Scroll sideways/)).toBeVisible()
    expect(region).toHaveAccessibleDescription(/Scroll sideways/)
    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 500 })
    act(() => window.dispatchEvent(new Event('resize')))
    expect(screen.queryByText(/Scroll sideways/)).not.toBeInTheDocument()
  })

  it('shows a distinct empty state', () => {
    const document = fixture()
    document.budget.snapshots['2026-11'] = { items: [] }
    showMatrix(document)
    expect(screen.getByText(/No transfers planned/)).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it.each([1, 3])('keeps the full contributor set for a household of %i', count => {
    const document = fixture()
    document.household.adults = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Person ${index}` }))
    document.budget.accounts = [{ id: 'joint', name: 'Household', ownerPersonIds: [] }]
    document.budget.snapshots['2026-11']!.items = [document.budget.snapshots['2026-11']!.items[0]!]
    showMatrix(document)
    const headers = screen.getAllByRole('columnheader').map(header => header.textContent)
    expect(headers).toEqual(['Destination', ...document.household.adults.map(person => person.name), 'Total'])
    expect(within(screen.getByRole('rowheader', { name: 'Allocated total' }).closest('tr')!).getAllByRole('cell')).toHaveLength(count + 1)
  })
})

describe('preview integration', () => {
  it('defaults to the account view, switches back without changing budget or URL, and retains account details', () => {
    const document = fixture(), original = structuredClone(document), setDocument = vi.fn()
    window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-11')
    const url = window.location.href, historyLength = window.history.length
    render(<MonthlyBudget document={document} setDocument={setDocument} month="2026-11" mobileBudgetView="transfers"/>)
    expect(screen.getByRole('region', { name: 'Transfers by account owner' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Transfer matrix' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Preview matrix' }))
    expect(screen.getByRole('region', { name: 'Transfer matrix' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Transfers by account owner' })).not.toBeInTheDocument()
    expect(window.location.href).toBe(url)
    expect(window.history.length).toBe(historyLength)
    expect(setDocument).not.toHaveBeenCalled()
    expect(document).toEqual(original)
    fireEvent.click(screen.getByRole('button', { name: 'Return to account view' }))
    const overview = screen.getByRole('region', { name: 'Transfers by account owner' })
    fireEvent.click(within(overview).getByRole('button', { name: /Joint · Monzo · Household/ }))
    expect(screen.getByRole('dialog', { name: 'Monzo · Household' })).toBeInTheDocument()
  })

  it('updates for the selected month and shows incomplete gaps not flagged by the old proportional warning', () => {
    const document = fixture()
    document.budget.snapshots['2026-12'] = { items: [{ id: 'missing', name: 'Needs funder', categoryId: 'bills', destination: { kind: 'account', accountId: 'joint' }, frequency: 'monthly', entryAmountPence: 125, amountPence: 125, funding: 'single' }] }
    const { rerender } = render(<MonthlyBudget document={document} setDocument={vi.fn()} month="2026-11" mobileBudgetView="transfers"/>)
    fireEvent.click(screen.getByRole('button', { name: 'Preview matrix' }))
    expect(screen.getByRole('region', { name: 'Transfer matrix' })).toHaveTextContent('£103')
    rerender(<MonthlyBudget document={document} setDocument={vi.fn()} month="2026-12" mobileBudgetView="transfers"/>)
    expect(screen.getByRole('region', { name: 'Transfer matrix' })).toHaveTextContent('Needs funder')
    expect(screen.getByRole('status')).toHaveTextContent('£1.25 planned; £1.25 still unallocated')
    expect(screen.getByRole('region', { name: 'Transfers summary' })).toHaveTextContent('Allocation needs attention')
    fireEvent.click(screen.getByRole('button', { name: 'Transfers summary details' }))
    const details = screen.getByRole('dialog', { name: 'Transfers summary details' })
    expect(details).toHaveTextContent('Amounts are rounded to whole pounds')
    expect(details).toHaveTextContent('Incomplete totals include only calculated contributions')
  })

  it('leaves the account view available when the mapping rejects unsupported input', () => {
    const document = fixture()
    document.budget.snapshots['2026-11']!.items[0]!.categoryId = 'missing'
    render(<MonthlyBudget document={document} setDocument={vi.fn()} month="2026-11" mobileBudgetView="transfers"/>)
    fireEvent.click(screen.getByRole('button', { name: 'Preview matrix' }))
    expect(screen.getByRole('status')).toHaveTextContent('matrix preview is unavailable')
    expect(screen.getByRole('region', { name: 'Transfers by account owner' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Return to account view' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
