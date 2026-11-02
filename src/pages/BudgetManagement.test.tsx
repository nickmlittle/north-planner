// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { BudgetManagement } from './BudgetManagement'
import { accountOptionLabels } from './budgetLabels'
import { useBudgetDocument, budgetStorageKey } from '../state/useBudgetDocument'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

function seed() {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  document.budget.accounts = [
    { id: 'mortgage', name: 'Mortgage', provider: 'Nationwide', ownerPersonIds: ['nick', 'immy'] },
    { id: 'current', name: 'Current', provider: 'Monzo', ownerPersonIds: ['nick'] },
  ]
  document.budget.pots = [{ id: 'bills', name: 'Bills', accountId: 'current' }]
  document.budget.categories = [{ id: 'financing', name: 'Financing' }]
  return document
}

function Harness({ initial = seed(), onChange, onClose = () => {} }: { initial?: BudgetDocument; onChange?: (document: BudgetDocument) => void; onClose?: () => void }) {
  const [document, setDocument] = useState(initial)
  onChange?.(document)
  return <BudgetManagement document={document} setDocument={setDocument} onClose={onClose} />
}

it('opens accounts first, shows zero-pot accounts, and groups pots by parent', () => {
  render(<Harness />)
  expect(screen.getByRole('button', { name: 'Accounts 2' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Pots 1' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByText('0 pots')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Pots 1' }))
  expect(screen.getByRole('heading', { name: 'Nick · Monzo · Current' })).toBeVisible()
  expect(screen.getByRole('button', { name: /Bills/ })).toHaveTextContent('Nick · Monzo · Current')
})

it('keeps row edits local until Save and protects dirty drafts from closing', () => {
  let current = seed()
  const onClose = vi.fn()
  render(<Harness initial={current} onChange={document => { current = document }} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: /Joint · Nationwide · Mortgage/ }))
  const form = screen.getByRole('form', { name: 'Edit account' })
  fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Home loan' } })
  expect(current.budget.accounts[0]?.name).toBe('Mortgage')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('Save or Cancel')
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(current.budget.accounts[0]?.name).toBe('Mortgage')
  fireEvent.click(screen.getByRole('button', { name: /Joint · Nationwide · Mortgage/ }))
  fireEvent.change(within(screen.getByRole('form', { name: 'Edit account' })).getByLabelText('Account name'), { target: { value: 'Home loan' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }))
  expect(current.budget.accounts[0]?.name).toBe('Home loan')
})

it('requires complete account details but leaves incomplete legacy records readable', () => {
  const initial = seed()
  initial.budget.accounts.push({ id: 'old', name: 'Legacy', ownerPersonIds: [] })
  let current = initial
  render(<Harness initial={initial} onChange={document => { current = document }} />)
  expect(screen.getByRole('button', { name: /Legacy/ })).toHaveTextContent('Needs details')
  fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
  const form = screen.getByRole('form', { name: 'Add account' })
  fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Savings' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save account' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Choose an owner')
  expect(current.budget.accounts).toHaveLength(3)
  fireEvent.change(within(form).getByLabelText('Bank / provider'), { target: { value: 'Barclays' } })
  fireEvent.click(within(form).getByLabelText('Nick'))
  fireEvent.click(within(form).getByRole('button', { name: 'Save account' }))
  expect(current.budget.accounts[3]).toMatchObject({ name: 'Savings', provider: 'Barclays', ownerPersonIds: ['nick'] })
})

it('reassigns a pot without changing its ID or budget item destinations', () => {
  const initial = seed()
  const item = { id: 'bill', name: 'Bill', categoryId: 'financing', entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly' as const, destination: { kind: 'pot' as const, potId: 'bills' }, funding: 'fixed' as const, contributions: [{ personId: 'nick', amountPence: 10000 }] }
  initial.budget.snapshots = { '2026-11': { items: [item] }, '2026-12': { items: [item] } }
  let current = initial
  render(<Harness initial={initial} onChange={document => { current = document }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Pots 1' }))
  fireEvent.click(screen.getByRole('button', { name: /Bills/ }))
  const form = screen.getByRole('form', { name: 'Edit pot' })
  fireEvent.change(within(form).getByLabelText('Parent account'), { target: { value: 'mortgage' } })
  expect(within(form).getByText(/every month/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save pot' }))
  expect(current.budget.pots[0]).toMatchObject({ id: 'bills', accountId: 'mortgage' })
  for (const month of ['2026-11', '2026-12']) {
    expect(current.budget.snapshots[month]?.items[0]?.destination).toEqual({ kind: 'pot', potId: 'bills' })
    expect(budgetTransfers(current.budget, ['nick', 'immy'], month, current.budget.snapshots[month]!.items).accounts[0]?.accountId).toBe('mortgage')
  }
})

it('rejects duplicate category names regardless of case', () => {
  let current = seed()
  render(<Harness onChange={document => { current = document }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Categories 1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
  const form = screen.getByRole('form', { name: 'Add category' })
  fireEvent.change(within(form).getByLabelText('Category name'), { target: { value: ' financing ' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save category' }))
  expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  expect(current.budget.categories).toHaveLength(1)
})

it('adds stable suffixes only when full legacy account labels collide', () => {
  const initial = seed()
  initial.budget.accounts.push({ id: 'a', name: 'Monzo', ownerPersonIds: ['nick'] }, { id: 'b', name: 'Monzo', ownerPersonIds: ['nick'] })
  const labels = accountOptionLabels(initial.budget.accounts, initial.household.adults)
  expect(labels.get('a')).toBe('Nick · Needs bank / provider · Monzo (Account 1)')
  expect(labels.get('b')).toBe('Nick · Needs bank / provider · Monzo (Account 2)')
  expect(labels.get('current')).toBe('Nick · Monzo · Current')
})

it('persists a saved row after the manager is reopened', () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(seed()))
  function PersistentHarness() {
    const { document, setDocument } = useBudgetDocument()
    return <BudgetManagement document={document} setDocument={setDocument} onClose={() => {}} />
  }
  const view = render(<PersistentHarness />)
  fireEvent.click(screen.getByRole('button', { name: /Joint · Nationwide · Mortgage/ }))
  fireEvent.change(within(screen.getByRole('form', { name: 'Edit account' })).getByLabelText('Account name'), { target: { value: 'Home loan' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save account' }))
  view.unmount()
  render(<PersistentHarness />)
  expect(screen.getByRole('button', { name: /Joint · Nationwide · Home loan/ })).toBeVisible()
})
