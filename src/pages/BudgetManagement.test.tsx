// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { BudgetManagement } from './BudgetManagement'
import { accountOptionLabels, accountOwnerGroups, sortPotsForManage } from './budgetLabels'
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
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label} \\d+$`) })
const open = (label: string) => fireEvent.click(tab(label))
const rowFor = (name: RegExp) => screen.getByRole('button', { name })
const change = (form: HTMLElement, label: string, value: string) => fireEvent.change(within(form).getByLabelText(label), { target: { value } })

it('opens on a flat Accounts tab with owner chips, and reopens there', () => {
  const { view } = setup()
  expect(tab('Accounts')).toHaveAttribute('aria-selected', 'true')
  for (const label of ['Pots', 'Categories']) expect(tab(label)).toHaveAttribute('aria-selected', 'false')
  const panel = screen.getByRole('tabpanel', { name: 'Accounts 3' })
  expect(within(panel).getAllByRole('button', { expanded: false }).map(button => button.textContent)).toEqual([
    'Nationwide · Mortgage Joint 0 pots', 'Monzo · Current account Nick 1 pot', 'HL · S&S ISA Immy 0 pots',
  ])
  open('Pots')
  expect(rowFor(/^Bills · Nick · Monzo/)).toHaveTextContent('Bills Nick Monzo · Current account')
  view.unmount()
  render(<Harness/>)
  expect(tab('Accounts')).toHaveAttribute('aria-selected', 'true')
})

it('moves between tabs with arrow keys, Home and End', () => {
  setup()
  const list = screen.getByRole('tablist', { name: 'Manage' })
  tab('Accounts').focus()
  fireEvent.keyDown(list, { key: 'ArrowRight' })
  expect(tab('Pots')).toHaveFocus()
  expect(tab('Pots')).toHaveAttribute('aria-selected', 'true')
  expect(tab('Pots')).toHaveAttribute('tabindex', '0')
  expect(tab('Accounts')).toHaveAttribute('tabindex', '-1')
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('Pots').id)
  fireEvent.keyDown(list, { key: 'End' })
  expect(tab('Categories')).toHaveFocus()
  fireEvent.keyDown(list, { key: 'ArrowRight' })
  expect(tab('Accounts')).toHaveFocus()
  fireEvent.keyDown(list, { key: 'ArrowLeft' })
  expect(tab('Categories')).toHaveFocus()
  fireEvent.keyDown(list, { key: 'Home' })
  expect(tab('Accounts')).toHaveAttribute('aria-selected', 'true')
})

it('keeps the tab while an edit is unsaved', () => {
  setup()
  fireEvent.click(rowFor(/Nationwide · Mortgage/))
  change(screen.getByRole('form', { name: 'Edit account' }), 'Nickname (optional)', 'Home loan')
  open('Pots')
  fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
  expect(tab('Accounts')).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('alert')).toHaveTextContent('Save or Cancel')
  fireEvent.click(within(screen.getByRole('form', { name: 'Edit account' })).getByRole('button', { name: 'Cancel' }))
  open('Pots')
  expect(tab('Pots')).toHaveAttribute('aria-selected', 'true')
})

it('keeps edits local, protects dirty groups and sections, and reveals the saved owner group', () => {
  const result = setup()
  fireEvent.click(rowFor(/Nationwide · Mortgage/))
  const form = screen.getByRole('form', { name: 'Edit account' })
  expect(within(form).getByLabelText('Nickname (optional)')).toHaveValue('')
  change(form, 'Nickname (optional)', 'Home loan')
  open('Pots')
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
  expect(rowFor(/Nationwide · Mortgage · Home loan/)).toHaveTextContent('Nationwide · Mortgage · Home loan Nick 0 pots')
})

it('requires account details and supports a type with no nickname', () => {
  const initial = seed()
  initial.budget.accounts.push({ id: 'legacy', name: 'Old bank', ownerPersonIds: [] })
  const result = setup(initial)
  expect(rowFor(/Old bank/)).toHaveTextContent('Needs owner')
  expect(rowFor(/Old bank/)).toHaveTextContent('Needs account type')
  expect(within(rowFor(/Old bank/)).getByText('Needs owner')).toHaveClass('budget-manage-chip', 'is-review')
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
  setup(initial)
  expect(within(screen.getByRole('tabpanel')).getAllByText('Nick', { selector: '.budget-manage-chip' })).toHaveLength(2)
  open('Pots'); fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  const form = screen.getByRole('form', { name: 'Add pot' })
  expect(within(form).getAllByRole('button', { name: 'Select all Nick accounts' })).toHaveLength(2)
})

it('sorts pots across accounts within an owner without changing stored order', () => {
  const initial = seed()
  initial.budget.accounts[2]!.ownerPersonIds = ['nick']
  initial.budget.pots = [
    { id: 'z', name: 'Zoo', accountId: 'current' }, { id: 'b', name: 'spending', accountId: 'current' },
    { id: 'a', name: 'Spending', accountId: 'isa' }, { id: 'c', name: 'apple', accountId: 'isa' }, { id: 'a-current', name: 'spending', accountId: 'current' },
  ]
  initial.budget.pots.push({ id: 'joint-spending', name: 'Spending', accountId: 'mortgage' })
  const result = setup(initial)
  open('Pots')
  const panel = screen.getByRole('tabpanel')
  expect(within(panel).getAllByRole('button', { expanded: false }).map(button => button.textContent)).toEqual([
    'apple Nick HL · S&S ISA', 'Spending Joint Nationwide · Mortgage', 'Spending Nick HL · S&S ISA', 'spending Nick Monzo · Current account', 'spending Nick Monzo · Current account', 'Zoo Nick Monzo · Current account',
  ])
  expect(within(panel).getAllByRole('button', { expanded: false }).slice(3, 5).map(button => button.getAttribute('aria-controls')?.split('-pot-')[1])).toEqual(['a-current', 'b'])
  expect(sortPotsForManage(initial.budget.pots, initial.budget.accounts, initial.household.adults).map(pot => pot.id)).toEqual(['c', 'joint-spending', 'a', 'a-current', 'b', 'z'])
  expect(result.current().budget.pots.map(pot => pot.id)).toEqual(['z', 'b', 'a', 'c', 'a-current', 'joint-spending'])
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
  fireEvent.click(rowFor(/^Spending · Nick · Monzo/))
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
  open('Pots'); fireEvent.click(rowFor(/Bills · Nick/))
  const form = screen.getByRole('form', { name: 'Edit pot' })
  change(form, 'Parent account', 'mortgage')
  expect(within(form).getByText(/every month/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save pot' }))
  expect(rowFor(/^Bills · Joint · Nationwide/)).toHaveTextContent('Bills Joint Nationwide · Mortgage')
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
  fireEvent.click(rowFor(/Nationwide · Mortgage/))
  change(screen.getByRole('form', { name: 'Edit account' }), 'Nickname (optional)', 'Home loan')
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }))
  view.unmount(); render(<PersistentHarness/>)
  expect(rowFor(/Nationwide · Mortgage · Home loan/)).toBeVisible()
})

it('closes from the × with the same unsaved-edit guard as Done', () => {
  const result = setup()
  expect(tab('Accounts')).toHaveAccessibleName('Accounts 3')
  fireEvent.click(rowFor(/Nationwide · Mortgage/))
  change(screen.getByRole('form', { name: 'Edit account' }), 'Nickname (optional)', 'Home loan')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(result.onClose).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('form', { name: 'Edit account' })).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(result.onClose).toHaveBeenCalledTimes(1)
})
