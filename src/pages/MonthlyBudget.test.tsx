// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    doc.budget.lines = [{ id: 'rent', name: 'Rent', amountPence: 100000, potId: 'bills', funding: 'proportional' }]
    doc.budget.statements = [{ id: 'statement', fileName: 'amex.csv', period: new Date().toISOString().slice(0, 7), statementBalancePence: 2500, transactions: [{ id: 'tx', date: '2026-10-01', description: 'Cafe', amountPence: 2500, potId: 'bills' }] }]
    return doc
  })
  return <MonthlyBudget document={document} setDocument={setDocument} onSelectSettings={() => {}} onSelectView={() => {}} />
}

it('creates a pot and updates the visible monthly allocation and transfer summary', () => {
  render(<Harness />)
  expect(screen.getAllByText('£1,000').length).toBeGreaterThan(0)
  fireEvent.change(screen.getByLabelText('New pot name'), { target: { value: 'Travel' } })
  fireEvent.change(screen.getByLabelText('Pot type'), { target: { value: 'savings' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add pot' }))
  expect(screen.getByLabelText('Travel pot name')).toHaveValue('Travel')
  fireEvent.change(screen.getByLabelText('Budget item name'), { target: { value: 'Holiday fund' } })
  fireEvent.change(screen.getByLabelText('Budget item amount'), { target: { value: '250' } })
  fireEvent.change(screen.getByLabelText('Budget item destination pot'), { target: { value: screen.getByRole('option', { name: 'Travel' }).getAttribute('value')! } })
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
  expect(screen.getByText('Holiday fund')).toBeVisible()
  expect(screen.getAllByText('£250').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Travel', { selector: 'span' }).length).toBeGreaterThan(0)
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
