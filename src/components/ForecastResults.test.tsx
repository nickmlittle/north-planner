// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { renderPlanner } from '../test/renderPlanner'
import { remainingYearFraction } from '../domain/dates'
import { formatGBPWhole } from '../formatting/money'
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
afterEach(cleanup)
const click = (name: string | RegExp) => fireEvent.click(screen.queryByRole('button', { name }) ?? screen.getByRole('menuitem', { name }))

it('shows detailed results and recalculates them from settings on their separate pages', () => {
  renderPlanner('forecast')
  expect(screen.getByRole('table', { name: 'Deterministic year-by-year results' })).toBeVisible()
  const before = screen.getByTestId('forecast-2026').textContent

  click('Plan settings'); click('Planning assumptions')
  fireEvent.change(screen.getByLabelText('Equity expected real return (%)'), { target: { value: '6' } })
  click('Plan settings'); click('Income timeline')
  fireEvent.change(screen.getByLabelText('Alex Annual salary (GBP)'), { target: { value: '110000' } })
  click('Plan settings'); click('Lifestyle spending')
  fireEvent.change(screen.getByLabelText('Annual baseline lifestyle spending (GBP)'), { target: { value: '30000' } })
  click('Plan settings'); click('Forecast details')

  const row = screen.getByTestId('forecast-2026')
  expect(row.textContent).not.toBe(before)
  const document = JSON.parse(localStorage.getItem('north.household.v1')!)
  expect(within(row).getByText(formatGBPWhole(110000 * remainingYearFraction(document.snapshot.planningStartDate)))).toBeVisible()
  expect(screen.getByText(/not a FIRE probability/)).toBeVisible()
})
