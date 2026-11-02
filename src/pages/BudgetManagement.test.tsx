// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { BudgetManagement } from './BudgetManagement'
import { accountOptionLabels, accountOwnerGroups } from './budgetLabels'
import { useBudgetDocument, budgetStorageKey } from '../state/useBudgetDocument'

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
function Harness({ initial = seed(), onChange, onClose = () => {} }: { initial?: BudgetDocument; onChange?: (document: BudgetDocument) => void; onClose?: () => void }) {
  const [document, setDocument] = useState(initial)
  useEffect(() => { onChange?.(document) }, [document, onChange])
  return <BudgetManagement document={document} setDocument={setDocument} onClose={onClose}/>
}
function setup(initial = seed(), onClose = vi.fn()) {
  let current = initial
  const onChange = vi.fn((document: BudgetDocument) => { current = document })
  const view = render(<Harness initial={initial} onChange={onChange} onClose={onClose}/>)
  return { view, current: () => current, onChange, onClose }
}
const open = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} \\d+$`) }))
const change = (form: HTMLElement, label: string, value: string) => fireEvent.change(within(form).getByLabelText(label), { target: { value } })

it('starts and reopens with every section and owner group collapsed', () => {
  const { view } = setup()
  for (const label of ['Accounts 3', 'Pots 1', 'Categories 1']) expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-expanded', 'false')
  open('Accounts')
  expect(screen.getByRole('button', { name: 'Joint 1' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Nationwide · Mortgage')).not.toBeInTheDocument()
  open('Joint')
  expect(screen.getByRole('button', { name: /Nationwide · Mortgage/ })).toHaveTextContent('0 pots')
  view.unmount()
  render(<Harness/>)
  expect(screen.getByRole('button', { name: 'Accounts 3' })).toHaveAttribute('aria-expanded', 'false')
})

it('keeps edits local, protects dirty groups and sections, and reveals the saved owner group', () => {
  const result = setup()
  open('Accounts'); open('Joint')
  fireEvent.click(screen.getByRole('button', { name: /Nationwide · Mortgage/ }))
  const form = screen.getByRole('form', { name: 'Edit account' })
  expect(within(form).getByLabelText('Nickname (optional)')).toHaveValue('')
  change(form, 'Nickname (optional)', 'Home loan')
  open('Joint'); open('Pots')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(result.onClose).not.toHaveBeenCalled()
  expect(result.current().budget.accounts[0]?.name).toBe('Mortgage')
  expect(screen.getByRole('alert')).toHaveTextContent('Save or Cancel')
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: /Nationwide · Mortgage/ }))
  const edit = screen.getByRole('form', { name: 'Edit account' })
  change(edit, 'Nickname (optional)', 'Home loan')
  fireEvent.click(within(edit).getByLabelText('Immy'))
  fireEvent.click(within(edit).getByRole('button', { name: 'Save account' }))
  expect(result.current().budget.accounts[0]).toMatchObject({ name: 'Home loan', ownerPersonIds: ['nick'] })
  expect(screen.getByRole('button', { name: 'Nick 2' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /Nationwide · Mortgage · Home loan/ })).toBeVisible()
})

it('requires account details and supports a type with no nickname', () => {
  const initial = seed()
  initial.budget.accounts.push({ id: 'legacy', name: 'Old bank', ownerPersonIds: [] })
  const result = setup(initial)
  open('Accounts'); open('Needs owner')
  expect(screen.getByRole('button', { name: /Old bank/ })).toHaveTextContent('Needs account type')
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
  const form = screen.getByRole('form', { name: 'Add account' })
  fireEvent.click(within(form).getByRole('button', { name: 'Save account' }))
  expect(screen.getByRole('alert')).toHaveTextContent('account type')
  expect(result.current().budget.accounts).toHaveLength(4)
  change(form, 'Bank / provider', 'Barclays'); change(form, 'Account type', 'cash-isa')
  fireEvent.click(within(form).getByLabelText('Nick'))
  fireEvent.click(within(form).getByRole('button', { name: 'Save account' }))
  expect(result.current().budget.accounts[4]).toMatchObject({ name: 'Cash ISA', provider: 'Barclays', accountTypeId: 'cash-isa', ownerPersonIds: ['nick'] })
})

it('uses person IDs for owner groups even when people have the same name', () => {
  const initial = seed()
  initial.household.adults[1]!.name = 'Nick'
  initial.budget.accounts.push({ id: 'old', name: 'Old', ownerPersonIds: [] })
  const groups = accountOwnerGroups(initial.budget.accounts, initial.household.adults)
  expect(groups.map(group => group.key)).toEqual(['joint', 'person:nick', 'person:immy', 'unassigned'])
  setup(initial); open('Accounts')
  const people = screen.getAllByRole('button', { name: 'Nick 1' })
  expect(people).toHaveLength(2)
  expect(people[0]?.getAttribute('aria-controls')).not.toBe(people[1]?.getAttribute('aria-controls'))
})

it('sorts pots across accounts within an owner without changing stored order', () => {
  const initial = seed()
  initial.budget.accounts[2]!.ownerPersonIds = ['nick']
  initial.budget.pots = [
    { id: 'z', name: 'Zoo', accountId: 'current' }, { id: 'b', name: 'spending', accountId: 'current' },
    { id: 'a', name: 'Spending', accountId: 'isa' }, { id: 'c', name: 'apple', accountId: 'isa' }, { id: 'a-current', name: 'spending', accountId: 'current' },
  ]
  const result = setup(initial)
  open('Pots'); open('Nick')
  const list = document.getElementById(screen.getByRole('button', { name: 'Nick 5' }).getAttribute('aria-controls')!)!
  expect(within(list).getAllByRole('button').map(button => button.textContent?.replace('▸ ', ''))).toEqual([
    'apple Nick · HL · S&S ISA', 'Spending Nick · HL · S&S ISA', 'spending Nick · Monzo · Current account', 'spending Nick · Monzo · Current account', 'Zoo Nick · Monzo · Current account',
  ])
  expect(within(list).getAllByRole('button').slice(2,4).map(button => button.getAttribute('aria-controls')?.split('-pot-')[1])).toEqual(['a-current', 'b'])
  expect(result.current().budget.pots.map(pot => pot.id)).toEqual(['z', 'b', 'a', 'c', 'a-current'])
})

it('creates independent pots in one update and skips existing case-insensitive names', () => {
  const initial = seed()
  initial.budget.pots.push({ id: 'existing', name: ' spending ', accountId: 'isa' })
  const result = setup(initial)
  open('Pots'); fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  const form = screen.getByRole('form', { name: 'Add pot' })
  expect(within(form).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true)
  change(form, 'Pot name', ' Spending ')
  fireEvent.click(within(form).getByRole('button', { name: 'Select all accounts' }))
  expect(within(form).getByText('Already exists — will be skipped')).toBeVisible()
  expect(within(form).getByRole('status')).toHaveTextContent('Create 2 pots; skip 1 existing.')
  result.onChange.mockClear()
  fireEvent.click(within(form).getByRole('button', { name: 'Create 2 pots' }))
  expect(result.onChange).toHaveBeenCalledTimes(1)
  const pots = result.current().budget.pots
  expect(pots).toHaveLength(4)
  expect(new Set(pots.map(pot => pot.id)).size).toBe(4)
  expect(pots.find(pot => pot.id === 'existing')?.name).toBe(' spending ')
  expect(screen.getByRole('status')).toHaveTextContent('Created 2 pots. Skipped 1 existing pot.')
  open('Nick')
  fireEvent.click(screen.getByRole('button', { name: /^Spending · Nick · Monzo/ }))
  const edit = screen.getByRole('form', { name: 'Edit pot' })
  change(edit, 'Pot name', 'Fun')
  fireEvent.click(within(edit).getByRole('button', { name: 'Save pot' }))
  expect(result.current().budget.pots.find(pot => pot.accountId === 'mortgage')?.name).toBe('Spending')
  expect(result.current().budget.pots.find(pot => pot.accountId === 'current' && pot.id !== 'bills')?.name).toBe('Fun')
})

it('supports owner selection, cancellation, and all-matched no-op submissions', () => {
  const result = setup()
  open('Pots'); fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  let form = screen.getByRole('form', { name: 'Add pot' })
  change(form, 'Pot name', ' bills ')
  fireEvent.click(within(form).getByRole('button', { name: 'Select all Nick accounts' }))
  expect(within(form).getByRole('button', { name: 'Create 0 pots' })).toBeDisabled()
  expect(within(form).getByText('All selected accounts already have this pot.')).toBeVisible()
  result.onChange.mockClear()
  fireEvent.submit(form)
  expect(result.onChange).not.toHaveBeenCalled()
  fireEvent.click(within(form).getByRole('button', { name: 'Clear all Nick accounts' }))
  expect(within(form).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true)
  fireEvent.click(within(form).getByRole('button', { name: 'Select all accounts' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Clear all accounts' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(result.current().budget.pots).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  form = screen.getByRole('form', { name: 'Add pot' })
  expect(within(form).getByLabelText('Pot name')).toHaveValue('')
})

it('reassigns a pot without changing its ID or budget-item destinations across months', () => {
  const initial = seed()
  const item = { id: 'bill', name: 'Bill', categoryId: 'financing', entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly' as const, destination: { kind: 'pot' as const, potId: 'bills' }, funding: 'fixed' as const, contributions: [{ personId: 'nick', amountPence: 10000 }] }
  initial.budget.snapshots = { '2026-11': { items: [item] }, '2026-12': { items: [item] } }
  const result = setup(initial)
  open('Pots'); open('Nick'); fireEvent.click(screen.getByRole('button', { name: /Bills · Nick/ }))
  const form = screen.getByRole('form', { name: 'Edit pot' })
  change(form, 'Parent account', 'mortgage')
  expect(within(form).getByText(/every month/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save pot' }))
  expect(screen.getByRole('button', { name: 'Joint 1' })).toHaveAttribute('aria-expanded', 'true')
  for (const month of ['2026-11', '2026-12']) {
    const budget = result.current().budget
    expect(budget.snapshots[month]?.items[0]?.destination).toEqual({ kind: 'pot', potId: 'bills' })
    expect(budgetTransfers(budget, ['nick', 'immy'], month, budget.snapshots[month]!.items).accounts[0]?.accountId).toBe('mortgage')
  }
})

it('rejects duplicate categories and retains stable suffixes for colliding labels', () => {
  setup(); open('Categories'); fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const form = screen.getByRole('form', { name: 'Add category' })
  change(form, 'Category name', ' financing ')
  fireEvent.click(within(form).getByRole('button', { name: 'Save category' }))
  expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  const initial = seed()
  initial.budget.accounts.push({ ...initial.budget.accounts[1]!, id: 'duplicate' })
  const labels = accountOptionLabels(initial.budget.accounts, initial.household.adults)
  expect(labels.get('current')).toBe('Nick · Monzo · Current account (Account 1)')
  expect(labels.get('duplicate')).toBe('Nick · Monzo · Current account (Account 2)')
})

it('persists typed accounts and nicknames after reopening', () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(seed()))
  function PersistentHarness() {
    const { document, setDocument } = useBudgetDocument()
    return <BudgetManagement document={document} setDocument={setDocument} onClose={() => {}}/>
  }
  const view = render(<PersistentHarness/>)
  open('Accounts'); open('Joint'); fireEvent.click(screen.getByRole('button', { name: /Nationwide · Mortgage/ }))
  change(screen.getByRole('form', { name: 'Edit account' }), 'Nickname (optional)', 'Home loan')
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }))
  view.unmount(); render(<PersistentHarness/>)
  open('Accounts'); open('Joint')
  expect(screen.getByRole('button', { name: /Nationwide · Mortgage · Home loan/ })).toBeVisible()
})
