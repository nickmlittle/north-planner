// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { buildTransferMatrixModel } from '../domain/transferMatrix'
import type { PlanDestination } from '../state/navigation'
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

function showMatrix(document: BudgetDocument, onPlanDestination?: (destination: PlanDestination, accountId: string) => void) {
  return render(<MobileTransferMatrix model={buildTransferMatrixModel(document, '2026-11')} labels={matrixAccountLabels(document.budget.accounts, document.household.adults)} onPlanDestination={onPlanDestination}/>)
}

describe('mobile transfer matrix', () => {
  it('shows owner, provider and destination rows fully expanded with a total at the end', () => {
    showMatrix(fixture())
    const table = screen.getByRole('table', { name: /Planned contributions by owner, provider/ })
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Destination', 'Ada', 'Ben', 'Total'])
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /Expand details|Collapse details/ })).not.toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Joint: Monzo: Bills pot' })).toBeInTheDocument()
    expect(within(table).queryByRole('rowheader', { name: /^(Rent|Power|Saving)$/ })).not.toBeInTheDocument()
    expect(within(within(table).getByRole('rowheader', { name: 'Joint · Monzo' }).closest('tr')!).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£50.77', '£50.75', '£101.52'])
    expect(within(within(table).getByRole('rowheader', { name: 'Ada: Monzo: Direct to account' }).closest('tr')!).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£0.00', '£0.99', '£0.99'])
    expect(table.querySelector('tfoot')).toHaveTextContent('Funding total')
    expect(screen.getByText('Funding requirements · exact amounts')).toBeVisible()
    const info = screen.getByRole('button', { name: 'About planned contributions' })
    expect(info).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/not payment records/)).not.toBeVisible()
    fireEvent.click(info)
    expect(info).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/not payment records/)).toBeVisible()
    const region = screen.getByRole('region', { name: 'Transfer matrix' })
    region.focus()
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(region.scrollLeft).toBe(60)
    fireEvent.keyDown(region, { key: 'ArrowLeft' })
    expect(region.scrollLeft).toBe(0)
  })

  it('shows direct and pot rows beneath their provider and reconciles exact pence', () => {
    const document = fixture()
    const model = buildTransferMatrixModel(document, '2026-11')
    showMatrix(document)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    const direct = within(table).getByRole('rowheader', { name: 'Joint: Monzo: Direct to account' }).closest('tr')!
    const pot = within(table).getByRole('rowheader', { name: 'Joint: Monzo: Bills pot' }).closest('tr')!
    expect(within(direct).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£50.01', '£50.00', '£100.01'])
    expect(within(pot).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£0.76', '£0.75', '£1.51'])
    expect(model.accounts[0]!.allocatedPence).toBe(model.accounts[0]!.allocations.reduce((sum, row) => sum + row.allocatedPence, 0))
    for (const person of model.contributors) expect(model.accounts[0]!.byPerson.find(row => row.personId === person.personId)!.amountPence)
      .toBe(model.accounts[0]!.allocations.reduce((sum, row) => sum + row.byPerson.find(value => value.personId === person.personId)!.amountPence, 0))
    expect(within(table).queryByRole('rowheader', { name: /Power|Water|Rent/ })).not.toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Joint · Monzo' })).toBeInTheDocument()
    expect(within(table).queryByRole('rowheader', { name: 'Joint: Monzo' })).not.toBeInTheDocument()
  })

  it('hands off account, direct and pot destinations without exposing item actions', () => {
    const onPlanDestination = vi.fn()
    showMatrix(fixture(), onPlanDestination)
    fireEvent.click(screen.getByRole('button', { name: 'View items for Joint · Household in Plan' }))
    expect(onPlanDestination).toHaveBeenLastCalledWith({ kind: 'account', id: 'joint' }, 'joint', expect.any(Array))
    fireEvent.click(screen.getByRole('button', { name: 'View Direct to account items for Joint · Household in Plan' }))
    expect(onPlanDestination).toHaveBeenLastCalledWith({ kind: 'direct', id: 'joint' }, 'joint', expect.any(Array))
    fireEvent.click(screen.getByRole('button', { name: 'View Bills pot items for Joint · Household in Plan' }))
    expect(onPlanDestination).toHaveBeenLastCalledWith({ kind: 'pot', id: 'bills-pot' }, 'joint', expect.any(Array))
    expect(screen.queryByRole('button', { name: /details for Joint/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Find .* in Plan/ })).not.toBeInTheDocument()
  })

  it('collapses each parent independently while keeping provider navigation separate', () => {
    const onPlanDestination = vi.fn()
    const document = fixture()
    document.budget.accounts.push({ id: 'joint-starling', name: 'Bills', provider: 'Starling', ownerPersonIds: ['ada', 'ben'] })
    document.budget.snapshots['2026-11']!.items.push({ id: 'starling-item', name: 'Insurance', categoryId: 'bills', destination: { kind: 'account', accountId: 'joint-starling' }, frequency: 'monthly', entryAmountPence: 300, amountPence: 300, funding: 'equal' })
    showMatrix(document, onPlanDestination)
    const joint = screen.getByRole('rowheader', { name: 'Joint' })
    const provider = screen.getByRole('rowheader', { name: 'Joint: Monzo' })
    fireEvent.click(within(provider).getByRole('button', { name: 'Collapse Monzo' }))
    expect(screen.queryByRole('rowheader', { name: 'Joint: Monzo: Bills pot' })).not.toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Ada: Monzo: Direct to account' })).toBeInTheDocument()
    fireEvent.click(within(provider).getByRole('button', { name: 'View items for Joint · Household in Plan' }))
    expect(onPlanDestination).toHaveBeenCalledWith({ kind: 'account', id: 'joint' }, 'joint', expect.any(Array))
    fireEvent.click(within(provider).getByRole('button', { name: 'Expand Monzo' }))
    expect(screen.getByRole('button', { name: 'View Bills pot items for Joint · Household in Plan' })).toBeVisible()
    fireEvent.click(within(joint).getByRole('button', { name: 'Collapse Joint' }))
    expect(screen.queryByRole('rowheader', { name: 'Joint: Monzo' })).not.toBeInTheDocument()
    fireEvent.click(within(joint).getByRole('button', { name: 'Expand Joint' }))
    expect(screen.getByRole('rowheader', { name: 'Joint: Monzo: Bills pot' })).toBeVisible()
  })

  it('qualifies destination names only when accounts share an owner and provider', () => {
    const document = fixture()
    document.budget.accounts.push({ id: 'reserve', name: 'Reserve', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] })
    document.budget.pots.push({ id: 'reserve-pot', name: 'Bills pot', accountId: 'reserve' })
    document.budget.snapshots['2026-11']!.items.push({ id: 'reserve-item', name: 'Reserve bill', categoryId: 'bills', destination: { kind: 'pot', potId: 'reserve-pot' }, frequency: 'monthly', entryAmountPence: 200, amountPence: 200, funding: 'equal' })
    const onPlanDestination = vi.fn()
    showMatrix(document, onPlanDestination)
    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: 'Joint: Monzo: Household · Bills pot' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Joint: Monzo: Reserve · Bills pot' })).toBeInTheDocument()
    expect(within(table).getAllByRole('rowheader', { name: 'Joint · Monzo' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'View items for Joint · Household in Plan' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Bills pot items for Joint · Reserve in Plan' }))
    expect(onPlanDestination).toHaveBeenLastCalledWith({ kind: 'pot', id: 'reserve-pot' }, 'reserve', expect.any(Array))
    expect(within(screen.getByRole('rowheader', { name: 'Joint · Monzo' }).closest('tr')!).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£51.77', '£51.75', '£103.52'])
    expect([...table.querySelectorAll('[data-group-level]')].map(row => row.getAttribute('data-group-level'))).toEqual(['0', '1', '1', '1', '0', '1'])
  })

  it('marks incomplete allocations and keeps allocated totals distinct from planned amounts', () => {
    const document = fixture()
    document.budget.snapshots['2026-11']!.items.push({ id: 'unknown', name: 'Unknown', categoryId: 'bills', destination: { kind: 'pot', potId: 'bills-pot' }, frequency: 'monthly', entryAmountPence: 201, amountPence: 201, funding: 'proportional' })
    showMatrix(document)
    expect(screen.getByRole('status')).toHaveTextContent('£104.52 planned; £2.01 still unallocated')
    expect(screen.getByRole('rowheader', { name: 'Joint · Monzo Incomplete' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Joint: Monzo: Bills pot Incomplete' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Funding total.*Incomplete/ }).closest('tr')).toHaveTextContent('£102.51')
  })

  it('shows exact penny shares that sum to the total and a distinct empty state', () => {
    const document = fixture()
    document.budget.snapshots['2026-11']!.items = [document.budget.snapshots['2026-11']!.items[1]!]
    showMatrix(document)
    expect(within(screen.getByRole('rowheader', { name: 'Funding total' }).closest('tr')!).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['£0.51', '£0.50', '£1.01'])
    expect(buildTransferMatrixModel(document, '2026-11').totals.allocatedPence).toBe(101)
    cleanup()
    document.budget.snapshots['2026-11'] = { items: [] }
    showMatrix(document)
    expect(screen.getByText(/No transfers planned/)).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it.each([1, 3])('retains all %i contributor columns', count => {
    const document = fixture()
    document.household.adults = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `Person ${index}` }))
    document.budget.accounts = [{ id: 'joint', name: 'Household', ownerPersonIds: [] }]
    document.budget.snapshots['2026-11']!.items = [document.budget.snapshots['2026-11']!.items[0]!]
    showMatrix(document)
    expect(screen.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Destination', ...document.household.adults.map(person => person.name), 'Total'])
    expect(within(screen.getByRole('rowheader', { name: 'Funding total' }).closest('tr')!).getAllByRole('cell')).toHaveLength(count + 1)
  })

  it('announces horizontal overflow when the shared scroll region needs it', async () => {
    showMatrix(fixture())
    const region = screen.getByRole('region', { name: 'Transfer matrix' })
    expect(screen.queryByText(/Scroll sideways/)).not.toBeInTheDocument()
    Object.defineProperty(region, 'clientWidth', { configurable: true, value: 300 })
    Object.defineProperty(region, 'scrollWidth', { configurable: true, value: 500 })
    act(() => window.dispatchEvent(new Event('resize')))
    await waitFor(() => expect(region).toHaveAccessibleDescription(/Scroll sideways/))
  })
})

describe('preview integration', () => {
  it('keeps the original account view as default and fallback without changing budget or URL', () => {
    const document = fixture(), original = structuredClone(document), setDocument = vi.fn()
    window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-11')
    const url = window.location.href, length = window.history.length
    render(<MonthlyBudget document={document} setDocument={setDocument} month="2026-11" mobileBudgetView="transfers"/>)
    expect(screen.getByRole('region', { name: 'Transfers by account owner' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(screen.getByRole('region', { name: 'Transfer matrix' })).toBeInTheDocument()
    expect(window.location.href).toBe(url)
    expect(window.history.length).toBe(length)
    expect(setDocument).not.toHaveBeenCalled()
    expect(document).toEqual(original)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const overview = screen.getByRole('region', { name: 'Transfers by account owner' })
    fireEvent.click(within(overview).getByRole('button', { name: /Joint · Monzo · Household/ }))
    expect(screen.getByRole('dialog', { name: 'Monzo · Household' })).toBeInTheDocument()
  })

  it('updates for the selected month and surfaces incomplete gaps', () => {
    const document = fixture()
    document.budget.snapshots['2026-12'] = { items: [{ id: 'missing', name: 'Needs funder', categoryId: 'bills', destination: { kind: 'account', accountId: 'joint' }, frequency: 'monthly', entryAmountPence: 125, amountPence: 125, funding: 'single' }] }
    const { rerender } = render(<MonthlyBudget document={document} setDocument={vi.fn()} month="2026-11" mobileBudgetView="transfers"/>)
    fireEvent.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(screen.getByRole('region', { name: 'Transfer matrix' })).toHaveTextContent('£102.51')
    rerender(<MonthlyBudget document={document} setDocument={vi.fn()} month="2026-12" mobileBudgetView="transfers"/>)
    expect(screen.getByRole('status')).toHaveTextContent('£1.25 planned; £1.25 still unallocated')
    expect(screen.getByRole('rowheader', { name: 'Joint · Monzo Incomplete' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Transfer matrix' })).queryByText('Needs funder')).not.toBeInTheDocument()
  })

  it('keeps the account view available when the mapping rejects unsupported input', () => {
    const document = fixture()
    document.budget.snapshots['2026-11']!.items[0]!.categoryId = 'missing'
    render(<MonthlyBudget document={document} setDocument={vi.fn()} month="2026-11" mobileBudgetView="transfers"/>)
    fireEvent.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(screen.getByRole('status')).toHaveTextContent('matrix is unavailable')
    expect(screen.getByRole('region', { name: 'Transfers by account owner' })).toBeInTheDocument()
  })
})
