// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderPlanner } from '../test/renderPlanner'
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
afterEach(cleanup)
it('shows the deterministic table after terms are entered and recalculates outputs on input edits', () => {
  renderPlanner()
  fireEvent.change(screen.getByLabelText('Mortgage interest rate (%)'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Remaining mortgage term (years)'), { target: { value: '25' } })
  expect(screen.getByRole('table', { name: 'Deterministic year-by-year results' })).toBeVisible()
  const row = screen.getByTestId('forecast-2026')
  const before = row.textContent
  fireEvent.change(screen.getByLabelText('Equity expected real return (%)'), { target: { value: '6' } })
  expect(row.textContent).not.toBe(before)
  fireEvent.change(screen.getByLabelText('Alex Annual salary (GBP)'), { target: { value: '110000' } })
  expect(within(row).getByText('£110,000')).toBeVisible()
  const updated = row.textContent
  fireEvent.change(screen.getByLabelText('Annual baseline lifestyle spending (GBP)'), { target: { value: '30000' } })
  expect(row.textContent).not.toBe(updated)
  expect(screen.getByText(/not a FIRE probability/)).toBeVisible()
})
