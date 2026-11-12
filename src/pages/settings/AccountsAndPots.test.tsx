// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { decodeBudgetDocument, newBudgetDocument } from '../../domain/budgetDocument'
import { budgetTransfers } from '../../domain/budgetTransfers'
import { potSettings } from '../../domain/cardSpending'
import { accountOptionLabels, accountOwnerGroups } from '../budgetLabels'
import { useBudgetDocument, budgetStorageKey } from '../../state/useBudgetDocument'
import { AccountsAndPots } from './AccountsAndPots'
import { Categories } from './Categories'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

function seed() {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  document.budget.accounts = [
    { id: 'mortgage', name: 'Mortgage', provider: 'Nationwide', accountTypeId: 'mortgage', ownerPersonIds: ['nick', 'immy'] },
    { id: 'current', name: 'Current account', provider: 'Monzo', accountTypeId: 'current-account', ownerPersonIds: ['nick'] },
    { id: 'isa', name: 'S&S ISA', provider: 'HL', accountTypeId: 'stocks-shares-isa', ownerPersonIds: ['immy'] },
  ]
  document.budget.pots = [{ id: 'bills', name: 'Bills', accountId: 'current' }]
  document.budget.categories = [{ id: 'financing', name: 'Financing' }]
  return document
}

function setup(initial = seed()) {
  let current = initial
  const status = { text: '' }
  function Harness() {
    const [document, setDocument] = useState(initial)
    const [message, setMessage] = useState('')
    status.text = message
    return <><p role="status">{message}</p><AccountsAndPots document={document} notify={setMessage} setDocument={update => setDocument(old => { current = typeof update === 'function' ? update(old) : update; return current })}/></>
  }
  render(<Harness/>)
  return { current: () => current }
}
const rows = () => within(screen.getByRole('list', { name: 'Accounts and pots' })).getAllByRole('listitem').map(item => item.querySelector('.list-row-text')?.textContent)
const menu = (name: string) => { fireEvent.click(screen.getByRole('button', { name: `More actions for ${name}` })); fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' })) }
const change = (form: HTMLElement, label: string, value: string) => fireEvent.change(within(form).getByLabelText(label), { target: { value } })
const submit = (name: RegExp | string) => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))

it('lists accounts by owner (Joint, then each adult), with their pots under them', () => {
  setup()
  expect(screen.getByText('Shared by every month.')).toBeInTheDocument()
  expect(rows()).toEqual([
    'Nationwide JointNationwide · Mortgage · Joint', 'Monzo NickMonzo · Current account · Nick', 'BillsMonthly · shows pace · flags over 2 months’ worth', 'HL ImmyHL · S&S ISA · Immy',
  ])
  expect(within(screen.getByRole('list')).getAllByText(/^\d+ pots?$/).map(node => node.textContent)).toEqual(['0 pots', '1 pot', '0 pots'])
})

it('requires account details, flags a missing owner, and adds a typed account with no nickname', () => {
  const initial = seed()
  initial.budget.accounts.push({ id: 'legacy', name: 'Old bank', ownerPersonIds: [] })
  const result = setup(initial)
  expect(screen.getByText('Needs owner')).toHaveClass('status-chip', 'is-warning')
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
  const form = screen.getByRole('form', { name: 'Add account' })
  submit('Add account')
  expect(within(form).getByRole('alert')).toHaveTextContent('account type')
  expect(result.current().budget.accounts).toHaveLength(4)
  change(form, 'Bank / provider', 'Barclays'); change(form, 'Account type', 'cash-isa')
  fireEvent.click(within(form).getByLabelText('Nick'))
  submit('Add account')
  expect(result.current().budget.accounts[4]).toMatchObject({ name: 'Cash ISA', provider: 'Barclays', accountTypeId: 'cash-isa', ownerPersonIds: ['nick'] })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Account added.')
})

it('edits an account in a sheet, and the list follows the new owner', () => {
  const result = setup()
  menu('Nationwide Joint')
  const form = screen.getByRole('form', { name: 'Edit account' })
  expect(within(form).getByLabelText('Nickname (optional)')).toHaveValue('')
  change(form, 'Nickname (optional)', 'Home loan')
  fireEvent.click(within(form).getByLabelText('Immy'))
  submit('Save account')
  expect(result.current().budget.accounts[0]).toMatchObject({ name: 'Home loan', ownerPersonIds: ['nick'] })
  // Nick's accounts sort by provider: Monzo, then Nationwide.
  expect(rows().slice(0, 3)).toEqual(['Monzo NickMonzo · Current account · Nick', 'BillsMonthly · shows pace · flags over 2 months’ worth', 'Home loanNationwide · Mortgage · Nick'])
})

it('closes the editor with Escape without saving', () => {
  const result = setup()
  menu('Nationwide Joint')
  change(screen.getByRole('form', { name: 'Edit account' }), 'Nickname (optional)', 'Home loan')
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(result.current().budget.accounts[0]!.name).toBe('Mortgage')
})

it('uses person IDs for owner groups even when people have the same name', () => {
  const initial = seed()
  initial.household.adults[1]!.name = 'Nick'
  initial.budget.accounts.push({ id: 'old', name: 'Old', ownerPersonIds: [] })
  expect(accountOwnerGroups(initial.budget.accounts, initial.household.adults).map(group => group.key)).toEqual(['joint', 'person:nick', 'person:immy', 'unassigned'])
  setup(initial)
  fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  expect(within(screen.getByRole('form', { name: 'Add pot' })).getAllByRole('button', { name: 'Select all Nick accounts' })).toHaveLength(2)
})

it('creates pots on several accounts in one update and skips existing case-insensitive names', () => {
  const initial = seed()
  initial.budget.pots.push({ id: 'existing', name: ' spending ', accountId: 'isa' })
  const result = setup(initial)
  fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  const form = screen.getByRole('form', { name: 'Add pot' })
  expect(within(form).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true)
  change(form, 'Pot name', ' Spending ')
  fireEvent.click(within(form).getByRole('button', { name: 'Select all accounts' }))
  expect(within(form).getByText(/Already exists — will be skipped/)).toBeVisible()
  submit('Create 2 pots')
  const pots = result.current().budget.pots
  expect(pots).toHaveLength(4)
  expect(new Set(pots.map(pot => pot.id)).size).toBe(4)
  expect(pots.find(pot => pot.id === 'existing')?.name).toBe(' spending ')
  expect(screen.getByRole('status')).toHaveTextContent('Created 2 pots. Skipped 1 existing pot.')
})

it('disables Create when every selected account already has the pot', () => {
  const result = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  const form = screen.getByRole('form', { name: 'Add pot' })
  change(form, 'Pot name', ' bills ')
  fireEvent.click(within(form).getByRole('button', { name: 'Select all Nick accounts' }))
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create 0 pots' })).toBeDisabled()
  expect(within(form).getByText('All selected accounts already have this pot.')).toBeVisible()
  fireEvent.submit(form)
  expect(result.current().budget.pots).toHaveLength(1)
  fireEvent.click(within(form).getByRole('button', { name: 'Clear all Nick accounts' }))
  expect(within(form).getByText('Select at least one account.')).toBeVisible()
})

it('reassigns a pot without changing its ID or budget-item destinations across months', () => {
  const initial = seed()
  const item = { id: 'bill', name: 'Bill', categoryId: 'financing', entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly' as const, destination: { kind: 'pot' as const, potId: 'bills' }, funding: 'fixed' as const, contributions: [{ personId: 'nick', amountPence: 10000 }] }
  initial.budget.snapshots = { '2026-11': { items: [item] }, '2026-12': { items: [item] } }
  const result = setup(initial)
  menu('Bills · Monzo Nick')
  const form = screen.getByRole('form', { name: 'Edit pot' })
  change(form, 'Parent account', 'mortgage')
  expect(within(form).getByText(/every month/)).toBeVisible()
  submit('Save pot')
  expect(rows().slice(0, 2)).toEqual(['Nationwide JointNationwide · Mortgage · Joint', 'BillsMonthly · shows pace · flags over 2 months’ worth'])
  for (const month of ['2026-11', '2026-12']) {
    const budget = result.current().budget
    expect(budget.snapshots[month]?.items[0]?.destination).toEqual({ kind: 'pot', potId: 'bills' })
    expect(budgetTransfers(budget, ['nick', 'immy'], month, budget.snapshots[month]!.items).accounts[0]?.accountId).toBe('mortgage')
  }
})

it('edits a pot’s spending settings: carries over, pace and the build-up limit', () => {
  const result = setup()
  menu('Bills · Monzo Nick')
  const form = screen.getByRole('form', { name: 'Edit pot' })
  expect(within(form).getByLabelText('Show pace (for steady spending like groceries)')).toBeChecked()
  change(form, 'Flag a build-up over (months’ worth)', '0')
  submit('Save pot')
  expect(within(form).getByRole('alert')).toHaveTextContent('Enter how many months’ worth can build up, like 2.')
  fireEvent.click(within(form).getByLabelText('Carries over from month to month'))
  expect(within(form).getByLabelText('Show pace (for steady spending like groceries)')).toBeDisabled()
  submit('Save pot')
  expect(potSettings(result.current(), 'bills')).toEqual({ carriesOver: true, pace: 'none', buildUpLimit: 2 })
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(result.current())))).toEqual(result.current())
  expect(rows()).toContain('BillsCarries over')
})

it('persists typed accounts and nicknames after reopening', () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(seed()))
  function PersistentHarness() {
    const { document, setDocument } = useBudgetDocument()
    return <AccountsAndPots document={document} setDocument={setDocument} notify={() => {}}/>
  }
  const view = render(<PersistentHarness/>)
  menu('Nationwide Joint')
  change(screen.getByRole('form', { name: 'Edit account' }), 'Nickname (optional)', 'Home loan')
  submit('Save account')
  view.unmount(); render(<PersistentHarness/>)
  expect(screen.getByText('Home loan')).toBeVisible()
})

it('shows an empty state with no accounts', () => {
  const initial = seed()
  initial.budget.accounts = []; initial.budget.pots = []
  setup(initial)
  expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add pot' })).toBeDisabled()
})

it('renames and adds categories, rejecting duplicates; labels keep stable suffixes', () => {
  const initial = seed()
  initial.budget.snapshots = { '2026-11': { items: [{ id: 'bill', name: 'Bill', categoryId: 'financing', entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly', destination: { kind: 'pot', potId: 'bills' }, funding: 'equal' }] } }
  let current = initial
  function Harness() {
    const [document, setDocument] = useState(initial)
    return <Categories document={document} month="2026-11" notify={() => {}} setDocument={update => setDocument(old => { current = typeof update === 'function' ? update(old) : update; return current })}/>
  }
  render(<Harness/>)
  expect(within(screen.getByRole('list', { name: 'Categories' })).getByText('1 item in November')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  change(screen.getByRole('form', { name: 'Add category' }), 'Category name', ' financing ')
  submit('Add category')
  expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  change(screen.getByRole('form', { name: 'Add category' }), 'Category name', 'Food')
  submit('Add category')
  expect(current.budget.categories.map(row => row.name)).toEqual(['Financing', 'Food'])
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Financing' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
  change(screen.getByRole('form', { name: 'Rename category' }), 'Category name', 'Bills')
  submit('Save category')
  expect(current.budget.categories[0]).toEqual({ id: 'financing', name: 'Bills' })

  const labels = seed()
  labels.budget.accounts.push({ ...labels.budget.accounts[1]!, id: 'duplicate' })
  const names = accountOptionLabels(labels.budget.accounts, labels.household.adults)
  expect(names.get('current')).toBe('Nick · Monzo · Current account (Account 1)')
  expect(names.get('duplicate')).toBe('Nick · Monzo · Current account (Account 2)')
})
