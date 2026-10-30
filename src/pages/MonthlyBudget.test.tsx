// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { newDocument } from '../domain/setup'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.unstubAllGlobals() })

function selectAmexView() {
  fireEvent.focus(screen.getByRole('button', { name: /Budget/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Amex' }))
}

function Harness({ grouped = false }: { grouped?: boolean } = {}) {
  const [document, setDocument] = useState<AppDocument>(() => {
    const doc = newDocument()
    doc.snapshot.people = [{ ...doc.snapshot.people[0]!, id: 'alex', name: 'Alex', role: 'you' }]
    doc.budget.pots[0] = { ...doc.budget.pots[0]!, ownerName: 'Joint', provider: grouped ? 'Monzo' : 'Nationwide' }
    doc.budget.incomes = [{ personId: 'alex', monthlyNetPence: 400000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'nick-isa' }]
    doc.budget.lines = [{ id: 'rent', category: 'Other Living Expenses', ownerName: 'Joint', name: 'Rent', entryAmountPence: 100000, frequency: 'monthly', amountPence: 100000, potId: 'bills', funding: 'proportional' }]
    doc.budget.statements = [{ id: 'statement', fileName: 'amex.csv', period: new Date().toISOString().slice(0, 7), statementBalancePence: 2500, transactions: [{ id: 'tx', date: '2026-10-01', description: 'Cafe', amountPence: 2500, potId: 'bills' }] }]
    if (grouped) {
      doc.budget.pots.push({ id: 'monzo-piggy', name: 'Joint Monzo Piggy Bank', kind: 'savings', ownerName: 'Joint', provider: 'Monzo' })
      doc.budget.lines.push({ id: 'piggy', category: 'Savings', ownerName: 'Joint', name: 'Emergency fund', entryAmountPence: 10000, frequency: 'monthly', amountPence: 10000, potId: 'monzo-piggy', funding: 'proportional' })
    }
    return doc
  })
  return <MonthlyBudget document={document} setDocument={setDocument} onSelectSettings={() => {}} onSelectView={() => {}} />
}

it('adds a monthly item to an existing destination and updates transfer summaries', () => {
  render(<Harness />)
  expect(screen.getAllByText('£1,000').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }))
  const dialog = screen.getByRole('dialog', { name: 'Add budget item' })
  fireEvent.change(within(dialog).getByLabelText('Bill category'), { target: { value: 'Subscriptions' } })
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Music' } })
  fireEvent.change(within(dialog).getByLabelText('Bill amount'), { target: { value: '12' } })
  fireEvent.change(within(dialog).getByLabelText('Bill destination'), { target: { value: 'bills' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add budget item' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Expand Joint' }).at(-1)!)
  expect(screen.getByRole('button', { name: 'Edit Music' })).toBeVisible()
  expect(screen.getAllByText('£12').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Bills').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Joint').length).toBeGreaterThan(0)
  expect(screen.getByText('Income ratio')).toBeVisible()
})

it('collapses and expands category and owner levels in the budget table', () => {
  render(<Harness />)
  expect(screen.getByRole('button', { name: 'Collapse Other Living Expenses' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Expand Joint' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Rent')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Other Living Expenses' }))
  expect(screen.queryByText('Rent')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Other Living Expenses' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Expand Joint' }).at(-1)!)
  expect(screen.getByText('Rent')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Joint' }))
  expect(screen.queryByText('Rent')).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Expand Joint' }).at(-1)!)
  expect(screen.getByText('Rent')).toBeVisible()
})

it('saves an annual item at one twelfth per month and creates its destination in the same dialog', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }))
  const dialog = screen.getByRole('dialog', { name: 'Add budget item' })
  fireEvent.change(within(dialog).getByLabelText('Bill category'), { target: { value: 'Savings' } })
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Car insurance' } })
  fireEvent.change(within(dialog).getByLabelText('Bill amount'), { target: { value: '720' } })
  fireEvent.change(within(dialog).getByLabelText('Bill frequency'), { target: { value: 'annually' } })
  expect(within(dialog).getByText(/Monthly saving:/)).toHaveTextContent('£60')
  fireEvent.change(within(dialog).getByLabelText('Bill destination'), { target: { value: '__create__' } })
  fireEvent.change(within(dialog).getByLabelText('New destination name'), { target: { value: 'Car Fund' } })
  fireEvent.change(within(dialog).getByLabelText('New destination type'), { target: { value: 'savings' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add budget item' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Expand Joint' }).at(-1)!)
  expect(screen.getByRole('button', { name: 'Edit Car insurance' })).toBeVisible()
  expect(screen.getByText('£720/yr')).toBeVisible()
  expect(screen.getAllByText('£60').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Car Fund').length).toBeGreaterThan(0)
  expect(screen.getByText('2%')).toBeVisible()
})

it('edits an existing item and manages destination owner and provider separately', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Rent' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit budget item' })
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Home rent' } })
  fireEvent.change(within(dialog).getByLabelText('Bill destination'), { target: { value: 'nick-isa' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  expect(screen.getByText('Home rent')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Show destinations' }))
  expect(screen.getByText(/Nick ISA/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Manage destinations' }))
  const destinations = screen.getByRole('dialog', { name: 'Manage destinations' })
  fireEvent.change(within(destinations).getByLabelText('Owner for Bills'), { target: { value: 'Joint' } })
  fireEvent.change(within(destinations).getByLabelText('Provider for Bills'), { target: { value: 'Monzo' } })
  fireEvent.click(within(destinations).getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Manage destinations' }))
  const reopened = screen.getByRole('dialog', { name: 'Manage destinations' })
  expect(within(reopened).getByLabelText('Owner for Bills')).toHaveValue('Joint')
  expect(within(reopened).getByLabelText('Provider for Bills')).toHaveValue('Monzo')
})

it('renames a category across its rows and closes the item form with Escape', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Manage categories' }))
  const categories = screen.getByRole('dialog', { name: 'Manage categories' })
  fireEvent.change(within(categories).getByLabelText('Category 2'), { target: { value: 'Household bills' } })
  fireEvent.click(within(categories).getByRole('button', { name: 'Done' }))
  expect(screen.getByText('Household bills')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }))
  const itemDialog = screen.getByRole('dialog', { name: 'Add budget item' })
  fireEvent.keyDown(itemDialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Add budget item' })).not.toBeInTheDocument()
})

it('keeps the income rail and shows statement settlement in the Amex tab', () => {
  render(<Harness />)
  selectAmexView()
  expect(screen.getByLabelText('Alex net income per month')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Card settlement by pot' })).toBeVisible()
  expect(screen.getByText('amex.csv')).toBeVisible()
  expect(screen.getAllByText('£25').length).toBeGreaterThan(0)
  expect(screen.getByLabelText('Pot for Cafe')).toHaveValue('bills')
})

it('shows payday transfers as an owner and bank matrix with person and total columns', () => {
  render(<Harness grouped />)
  const matrix = screen.getByRole('table', { name: 'Payday transfers by account and pot' })
  expect(within(matrix).getByRole('columnheader', { name: 'Alex' })).toBeVisible()
  expect(within(matrix).getByRole('columnheader', { name: 'Total' })).toBeVisible()
  const bankRow = within(matrix).getByRole('row', { name: /Joint · Monzo £1,100 £1,100/ })
  expect(bankRow).toBeVisible()
  expect(within(matrix).queryByRole('row', { name: /Piggy Bank/ })).not.toBeInTheDocument()
  fireEvent.click(within(bankRow).getByRole('button', { name: 'Expand Joint · Monzo pots' }))
  expect(within(matrix).getByRole('row', { name: /Piggy Bank £100 £100/ })).toBeVisible()
  expect(within(matrix).getByRole('row', { name: /Bills £1,000 £1,000/ })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Pot funding' })).not.toBeInTheDocument()
})

it('collapses the configuration rail on compact screens and lets the user reopen it', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
  render(<Harness />)
  const summary = screen.getByText('Income and month setup')
  expect(screen.getByLabelText('Alex net income per month')).not.toBeVisible()
  fireEvent.click(summary)
  expect(screen.getByLabelText('Alex net income per month')).toBeVisible()
})

it('uses a readable month and year to select the budget and statement period', () => {
  render(<Harness />)
  expect(screen.getByLabelText('Month')).toBeVisible()
  expect(screen.getByLabelText('Year')).toBeVisible()
  const nextDate = new Date(); nextDate.setMonth(nextDate.getMonth() + 1)
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: String(nextDate.getMonth() + 1) } })
  if (nextDate.getFullYear() !== new Date().getFullYear()) fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(nextDate.getFullYear()) } })
  const nextPeriod = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
  expect(screen.getByLabelText('Budget month')).toHaveValue(String(nextDate.getMonth() + 1))
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint' }))
  expect(screen.getByText('Rent')).toBeVisible()
  selectAmexView()
  expect(screen.getByText(`No statement uploaded for ${nextPeriod}.`)).toBeVisible()
})
