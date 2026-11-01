// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/') })
function Harness() {
  const [document, setDocument] = useState<BudgetDocument>(() => {
    const value = newBudgetDocument()
    value.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
    return value
  })
  return <MonthlyBudget document={document} setDocument={setDocument} />
}

it('starts in planning for a fresh budget and creates its first destination with an item', () => {
  render(<Harness />)
  expect(screen.getByRole('button', { name: 'Plan budget' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }))
  const dialog = screen.getByRole('dialog', { name: 'Add budget item' })
  expect(within(dialog).getByLabelText('Bill destination')).toHaveValue('__create__')
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Rent' } })
  fireEvent.change(within(dialog).getByLabelText('Bill amount'), { target: { value: '1000' } })
  fireEvent.change(within(dialog).getByLabelText('New destination name'), { target: { value: 'Bills' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add budget item' }))
  expect(screen.getByRole('button', { name: 'Expand Joint' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Expand Joint' }))
  expect(screen.getByText('Rent')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  const incomeDialog = screen.getByRole('dialog', { name: 'Expected monthly income' })
  fireEvent.change(within(incomeDialog).getByLabelText('Alex net income'), { target: { value: '4000' } })
  fireEvent.click(within(incomeDialog).getByRole('button', { name: 'Save income' }))
  fireEvent.click(screen.getByRole('button', { name: 'Make transfers' }))
  fireEvent.click(screen.getByRole('button', { name: 'Alex' }))
  expect(screen.getByText('Bills')).toBeVisible()
})

it('allows income editing and shows an annual item as a monthly contribution', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  const incomeDialog = screen.getByRole('dialog', { name: 'Expected monthly income' })
  fireEvent.change(within(incomeDialog).getByLabelText('Alex net income'), { target: { value: '4000' } })
  fireEvent.click(within(incomeDialog).getByRole('button', { name: 'Save income' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }))
  const dialog = screen.getByRole('dialog', { name: 'Add budget item' })
  fireEvent.change(within(dialog).getByLabelText('Bill name'), { target: { value: 'Insurance' } })
  fireEvent.change(within(dialog).getByLabelText('Bill amount'), { target: { value: '720' } })
  fireEvent.change(within(dialog).getByLabelText('Bill frequency'), { target: { value: 'annually' } })
  expect(within(dialog).getByText(/Monthly saving:/)).toHaveTextContent('£60')
  fireEvent.change(within(dialog).getByLabelText('New destination name'), { target: { value: 'Insurance pot' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add budget item' }))
  expect(screen.getAllByText('£60').length).toBeGreaterThan(0)
})


it('browses months and applies a future income change only from its effective month', () => {
  render(<Harness />)
  const current = new Date()
  const future = new Date(current.getFullYear(), current.getMonth() + 1, 1)
  const futureMonth = future.toLocaleString('en-GB', { month: 'short' })

  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  const dialog = screen.getByRole('dialog', { name: 'Expected monthly income' })
  fireEvent.click(within(dialog).getByRole('button', { name: /Income effective month:/ }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${futureMonth}$`) }))
  fireEvent.change(within(dialog).getByLabelText('Alex net income'), { target: { value: '4000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save income' }))

  expect(screen.getByText('£0', { selector: '.budget-income-summary-person strong' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByText('£4,000', { selector: '.budget-income-summary-person strong' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
  expect(screen.getByText('£0', { selector: '.budget-income-summary-person strong' })).toBeVisible()
})

it('discards staged income edits when the drawer is cancelled', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  const dialog = screen.getByRole('dialog', { name: 'Expected monthly income' })
  fireEvent.change(within(dialog).getByLabelText('Alex net income'), { target: { value: '4000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText('£0', { selector: '.budget-income-summary-person strong' })).toBeVisible()
})

it('jumps directly to a month in another year from the month grid', () => {
  render(<Harness />)
  const nextYear = String(new Date().getFullYear() + 1)
  fireEvent.click(screen.getByRole('button', { name: /Budget month:/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
  expect(screen.getByText(nextYear)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /^Jan$/ }))
  expect(screen.getByRole('button', { name: `Budget month: January ${nextYear}` })).toBeVisible()
})
