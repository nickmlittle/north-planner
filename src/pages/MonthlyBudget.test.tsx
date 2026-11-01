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
  fireEvent.click(screen.getByText('Income and month setup'))
  fireEvent.change(screen.getByLabelText('Alex net income per month'), { target: { value: '4000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Make transfers' }))
  fireEvent.click(screen.getByRole('button', { name: 'Alex' }))
  expect(screen.getByText('Bills')).toBeVisible()
})

it('allows income editing and shows an annual item as a monthly contribution', () => {
  render(<Harness />)
  fireEvent.click(screen.getByText('Income and month setup'))
  fireEvent.change(screen.getByLabelText('Alex net income per month'), { target: { value: '4000' } })
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
