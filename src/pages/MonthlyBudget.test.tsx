// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { newDocument } from '../domain/setup'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Harness() {
  const [document, setDocument] = useState<AppDocument>(() => {
    const doc = newDocument()
    doc.snapshot.people = [{ ...doc.snapshot.people[0]!, id: 'alex', name: 'Alex', role: 'you' }]
    doc.budget.incomes = [{ personId: 'alex', monthlyNetPence: 400000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'nick-isa' }]
    doc.budget.lines = [{ id: 'rent', category: 'Other Living Expenses', name: 'Rent', entryAmountPence: 100000, frequency: 'monthly', amountPence: 100000, potId: 'bills', funding: 'proportional' }]
    doc.budget.statements = [{ id: 'statement', fileName: 'amex.csv', period: new Date().toISOString().slice(0, 7), statementBalancePence: 2500, transactions: [{ id: 'tx', date: '2026-10-01', description: 'Cafe', amountPence: 2500, potId: 'bills' }] }]
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
  expect(screen.getByRole('button', { name: 'Edit Music' })).toBeVisible()
  expect(screen.getAllByText('£12').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Bills').length).toBeGreaterThan(0)
  fireEvent.change(screen.getByLabelText('Funding split for Music'), { target: { value: 'equal' } })
  expect(screen.getByLabelText('Funding split for Music')).toHaveValue('equal')
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
  expect(screen.getByRole('button', { name: 'Edit Car insurance' })).toBeVisible()
  expect(screen.getByText('£720/yr')).toBeVisible()
  expect(screen.getAllByText('£60').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Car Fund').length).toBeGreaterThan(0)
  expect(screen.getByText('2%')).toBeVisible()
})

it('edits an existing item and manages destination owner and provider separately', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Rent' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit budget item' })
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Home rent' } })
  fireEvent.change(within(dialog).getByLabelText('Bill destination'), { target: { value: 'nick-isa' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  expect(screen.getByText('Home rent')).toBeVisible()
  expect(screen.getAllByText('Nick ISA').length).toBeGreaterThan(0)
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
  fireEvent.click(screen.getByRole('tab', { name: 'Amex' }))
  expect(screen.getByLabelText('Alex net income per month')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Card settlement by pot' })).toBeVisible()
  expect(screen.getByText('amex.csv')).toBeVisible()
  expect(screen.getAllByText('£25').length).toBeGreaterThan(0)
  expect(screen.getByLabelText('Pot for Cafe')).toHaveValue('bills')
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
  expect(screen.getByText(/Choose the month for income and item overrides/)).toBeVisible()
  const nextDate = new Date(); nextDate.setMonth(nextDate.getMonth() + 1)
  fireEvent.change(screen.getByLabelText('Month'), { target: { value: String(nextDate.getMonth() + 1) } })
  if (nextDate.getFullYear() !== new Date().getFullYear()) fireEvent.change(screen.getByLabelText('Year'), { target: { value: String(nextDate.getFullYear()) } })
  const nextPeriod = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
  expect(screen.getByLabelText('Budget month')).toHaveValue(String(nextDate.getMonth() + 1))
  expect(screen.getByText('Rent')).toBeVisible()
  fireEvent.click(screen.getByRole('tab', { name: 'Amex' }))
  expect(screen.getByText(`No Amex statement uploaded for ${nextPeriod}. Upload a CSV to assign transactions to pots.`)).toBeVisible()
})
