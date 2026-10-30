// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { newDocument } from '../domain/setup'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); vi.unstubAllGlobals() })

function selectAmexView() {
  window.history.pushState(null, '', '/?view=budget&budgetView=amex')
  fireEvent(window, new PopStateEvent('popstate'))
}
function selectPlanMode() { fireEvent.click(screen.getByRole('button', { name: 'Plan budget' })) }
function openBudgetSetup() { fireEvent.click(screen.getByText('Income and month setup')) }

function Harness({ grouped = false, multiple = false, splitAccounts = false, noSamTransfers = false, needsReview = false }: { grouped?: boolean; multiple?: boolean; splitAccounts?: boolean; noSamTransfers?: boolean; needsReview?: boolean } = {}) {
  const [document, setDocument] = useState<AppDocument>(() => {
    const doc = newDocument()
    doc.snapshot.people = [{ ...doc.snapshot.people[0]!, id: 'alex', name: 'Alex', role: 'you' }]
    if (multiple) doc.snapshot.people.push({ ...doc.snapshot.people[0]!, id: 'sam', name: 'Sam', role: 'adult' }, { ...doc.snapshot.people[0]!, id: 'child', name: 'Child', role: 'child' })
    doc.budget.pots[0] = { ...doc.budget.pots[0]!, ownerName: 'Joint', provider: grouped ? 'Monzo' : 'Nationwide' }
    doc.budget.accounts = (doc.budget.accounts ?? []).map(account => account.id === 'account-bills' ? { ...account, name: grouped ? 'Joint Monzo' : 'Joint Nationwide', ownerName: 'Joint', provider: grouped ? 'Monzo' : 'Nationwide' } : account)
    doc.budget.incomes = [{ personId: 'alex', monthlyNetPence: 400000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'nick-isa' }, ...(multiple ? [{ personId: 'sam', monthlyNetPence: 200000, mode: 'all-income' as const, liveOnPence: 0, surplusPotId: 'nick-isa' }] : [])]
    doc.budget.lines = [{ id: 'rent', category: 'Other Living Expenses', ownerName: 'Joint', name: 'Rent', entryAmountPence: 100000, frequency: 'monthly', amountPence: 100000, potId: 'bills', funding: 'proportional' }]
    doc.budget.statements = [{ id: 'statement', fileName: 'amex.csv', period: new Date().toISOString().slice(0, 7), statementBalancePence: 2500, transactions: [{ id: 'tx', date: '2026-10-01', description: 'Cafe', amountPence: 2500, potId: 'bills' }] }]
    if (grouped) {
      doc.budget.pots.push({ id: 'monzo-piggy', name: 'Joint Monzo Piggy Bank', kind: 'savings', ownerName: 'Joint', provider: 'Monzo', accountId: 'account-bills' })
      doc.budget.lines.push({ id: 'piggy', category: 'Savings', ownerName: 'Joint', name: 'Emergency fund', entryAmountPence: 10000, frequency: 'monthly', amountPence: 10000, potId: 'monzo-piggy', funding: 'proportional' })
    }
    if (splitAccounts) {
      doc.budget.accounts?.push({ id: 'account-joint-monzo-2', name: 'Joint Monzo savings', ownerName: 'Joint', provider: 'Monzo' })
      doc.budget.pots.push({ id: 'second-monzo-pot', name: 'Joint Monzo Holiday', kind: 'savings', ownerName: 'Joint', provider: 'Monzo', accountId: 'account-joint-monzo-2' })
      doc.budget.lines.push({ id: 'second-monzo-line', category: 'Savings', ownerName: 'Joint', name: 'Holiday', entryAmountPence: 20000, frequency: 'monthly', amountPence: 20000, potId: 'second-monzo-pot', funding: 'single', singleFunderId: 'alex' })
    }
    if (noSamTransfers) doc.budget.lines = doc.budget.lines.map(line => ({ ...line, funding: 'single', singleFunderId: 'alex' }))
    if (needsReview) doc.budget.accountsReviewed = false
    return doc
  })
  return <MonthlyBudget document={document} setDocument={setDocument} onSelectSettings={() => {}} onSelectView={() => {}} />
}

it('adds a monthly item to an existing destination and updates transfer summaries', () => {
  render(<Harness />)
  selectPlanMode()
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
  selectPlanMode()
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

it('uses the category overview to focus the table on one category at a time', () => {
  render(<Harness grouped />)
  selectPlanMode()
  const savings = screen.getByRole('button', { name: /^Savings/ })
  fireEvent.click(savings)
  expect(savings).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Collapse Savings' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Collapse Other Living Expenses' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint' }))
  expect(screen.getByText('Emergency fund')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /^Other Living Expenses/ }))
  expect(screen.getByRole('button', { name: 'Collapse Other Living Expenses' })).toBeVisible()
  expect(screen.queryByText('Emergency fund')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint' }))
  expect(screen.getByText('Rent')).toBeVisible()
})

it('saves an annual item at one twelfth per month and creates its destination in the same dialog', () => {
  render(<Harness />)
  selectPlanMode()
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
  expect(screen.getByRole('button', { name: /^Savings/ })).toHaveAttribute('aria-pressed', 'true')
})

it('edits an existing item and manages destination owner and provider separately', () => {
  render(<Harness />)
  selectPlanMode()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Rent' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit budget item' })
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Home rent' } })
  fireEvent.change(within(dialog).getByLabelText('Bill destination'), { target: { value: 'nick-isa' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  expect(screen.getByText('Home rent')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Show destinations' }))
  expect(screen.getAllByText(/Nick ISA/).length).toBeGreaterThan(0)
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
  selectPlanMode()
  fireEvent.click(screen.getByRole('button', { name: 'Manage categories' }))
  const categories = screen.getByRole('dialog', { name: 'Manage categories' })
  fireEvent.change(within(categories).getByLabelText('Category 2'), { target: { value: 'Household bills' } })
  fireEvent.click(within(categories).getByRole('button', { name: 'Done' }))
  expect(screen.getAllByText('Household bills').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }))
  const itemDialog = screen.getByRole('dialog', { name: 'Add budget item' })
  fireEvent.keyDown(itemDialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Add budget item' })).not.toBeInTheDocument()
})

it('keeps the income rail and shows statement settlement in the Amex tab', () => {
  render(<Harness />)
  selectAmexView()
  openBudgetSetup()
  expect(screen.getByLabelText('Alex net income per month')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Card settlement by pot' })).toBeVisible()
  expect(screen.getByText('amex.csv')).toBeVisible()
  expect(screen.getAllByText('£25').length).toBeGreaterThan(0)
  expect(screen.getByLabelText('Pot for Cafe')).toHaveValue('bills')
})

it('shows payday transfers as an owner and bank matrix with person and total columns', () => {
  render(<Harness grouped />)
  selectPlanMode()
  fireEvent.click(screen.getByText('Payday transfer breakdown'))
  const matrix = screen.getByRole('table', { name: 'Payday transfers by account and pot' })
  expect(within(matrix).getByRole('columnheader', { name: 'Alex' })).toBeVisible()
  expect(within(matrix).getByRole('columnheader', { name: 'Total' })).toBeVisible()
  const bankRow = within(matrix).getByRole('row', { name: /Joint Monzo £1,100 £1,100/ })
  expect(bankRow).toBeVisible()
  expect(within(matrix).queryByRole('row', { name: /Piggy Bank/ })).not.toBeInTheDocument()
  fireEvent.click(within(bankRow).getByRole('button', { name: 'Expand Joint Monzo pots' }))
  expect(within(matrix).getByRole('row', { name: /Piggy Bank £100 £100/ })).toBeVisible()
  expect(within(matrix).getByRole('row', { name: /Bills £1,000 £1,000/ })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Pot funding' })).not.toBeInTheDocument()
})

it('starts with a chooser for all adults and reveals one person’s transfers only after selection', () => {
  render(<Harness grouped multiple />)
  expect(screen.getByLabelText('Budget month')).toBeVisible()
  expect(screen.getByLabelText('Budget year')).toBeVisible()
  expect(screen.queryByLabelText('Alex net income per month')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Alex budgeting method')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Who’s transferring?' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Alex' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Sam' })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Child' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument()
  expect(screen.getByText('Planned allocations')).toBeVisible()
  expect(screen.getByText('Monthly surplus')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Alex' }))
  expect(screen.getByLabelText('Who’s transferring?')).toHaveValue('alex')
  expect(screen.getByText('Joint Monzo')).toBeVisible()
  expect(screen.getByText('Total to transfer')).toBeVisible()
  expect(screen.getByText('Planned allocations')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Plan budget' }))
  expect(screen.getByText('Planned allocations')).toBeVisible()
  openBudgetSetup()
  expect(screen.getByLabelText('Alex net income per month')).toBeVisible()
  expect(screen.getByLabelText('Alex budgeting method')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Make transfers' }))
  expect(screen.getByRole('heading', { name: 'Who’s transferring?' })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sam' }))
  expect(screen.getByLabelText('Who’s transferring?')).toHaveValue('sam')
})

it('requires review of migrated account groups before showing transfer figures', () => {
  render(<Harness needsReview />)
  expect(screen.getByRole('heading', { name: 'Review master accounts' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Plan budget' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Review accounts' }))
  expect(screen.getByRole('dialog', { name: 'Manage destinations' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(screen.getByRole('heading', { name: 'Who’s transferring?' })).toBeVisible()
})

it('opens one destination at a time and copies its amount without opening detail', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<Harness grouped />)
  fireEvent.click(screen.getByRole('button', { name: 'Alex' }))
  const copyDestination = screen.getByRole('button', { name: 'Copy £1,100 for Joint Monzo' })
  fireEvent.click(copyDestination)
  expect(writeText).toHaveBeenCalledWith('1100.00')
  const toast = await screen.findByRole('status')
  expect(toast).toHaveTextContent('Amount copied')
  expect(toast).toHaveClass('budget-copy-toast')
  expect(toast.closest('li')).toBeNull()
  writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'))
  fireEvent.click(copyDestination)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not copy'))
  expect(screen.getByRole('heading', { name: 'Transfers to make' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint Monzo account details' }))
  expect(screen.getByRole('button', { name: 'Collapse Joint Monzo account details' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('list', { name: 'Joint Monzo pot breakdown' })).toBeVisible()
  expect(screen.getByText('Total to transfer')).toBeVisible()
  expect(screen.getAllByText('£1,100').length).toBeGreaterThan(0)
  const copyPot = screen.getByRole('button', { name: 'Copy £1,000 for Bills' })
  expect(copyPot).toBeVisible()
  fireEvent.click(copyPot)
  expect(writeText).toHaveBeenLastCalledWith('1000.00')
  expect(await screen.findByRole('status')).toHaveTextContent('Amount copied')
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Joint Monzo account details' }))
  expect(screen.queryByRole('list', { name: 'Joint Monzo pot breakdown' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Transfers to make' })).toBeVisible()
})

it('keeps the open destination context when switching the selected person', () => {
  render(<Harness grouped multiple />)
  fireEvent.click(screen.getByRole('button', { name: 'Alex' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint Monzo account details' }))
  expect(screen.getByText('Total to transfer')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Who’s transferring?'), { target: { value: 'sam' } })
  expect(screen.getByLabelText('Who’s transferring?')).toHaveValue('sam')
  expect(screen.getByRole('button', { name: 'Collapse Joint Monzo account details' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Total to transfer')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Copy £333 for Bills' })).toBeVisible()
})

it('keeps same-owner same-provider accounts distinct and supports a no-transfer state', () => {
  render(<Harness grouped multiple splitAccounts noSamTransfers />)
  fireEvent.click(screen.getByRole('button', { name: 'Alex' }))
  expect(screen.getByText('Joint Monzo')).toBeVisible()
  expect(screen.getByText('Joint Monzo savings')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Copy £200 for Joint Monzo savings' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('Who’s transferring?'), { target: { value: 'sam' } })
  expect(screen.getByText('Sam has no transfers to make this month.')).toBeVisible()
})

it('collapses the configuration rail on compact screens and lets the user reopen it', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
  render(<Harness />)
  selectPlanMode()
  const summary = screen.getByText('Income and month setup')
  expect(screen.getByLabelText('Alex net income per month')).not.toBeVisible()
  fireEvent.click(summary)
  expect(screen.getByLabelText('Alex net income per month')).toBeVisible()
})

it('uses a readable month and year to select the budget and statement period', () => {
  render(<Harness />)
  selectPlanMode()
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
