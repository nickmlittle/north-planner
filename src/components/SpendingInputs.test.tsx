// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderPlanner } from '../test/renderPlanner'
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
afterEach(cleanup)
it('updates spending/surplus and preserves assumptions while toggling events', () => {
  renderPlanner()
  const equity = screen.getByLabelText('Equity expected real return (%)')
  fireEvent.change(equity, { target: { value: '6' } }); fireEvent.blur(equity)
  fireEvent.change(screen.getByLabelText('Annual baseline lifestyle spending (GBP)'), { target: { value: '30000' } })
  fireEvent.click(screen.getByRole('button', { name: /Add goal or life event/ }))
  fireEvent.click(screen.getByRole('button', { name: /Spending change/ }))
  fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'More travel' } })
  fireEvent.change(screen.getByLabelText('Start year'), { target: { value: '2026' } })
  fireEvent.change(screen.getByLabelText('Final year'), { target: { value: '2028' } })
  fireEvent.change(screen.getByLabelText('Annual spending change (£)'), { target: { value: '5000' } })
  fireEvent.click(screen.getByRole('button', { name: /Preview impact/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
  expect(screen.getByText(/Base-year lifestyle: £35,000.00; surplus/)).toBeVisible()
  fireEvent.click(screen.getByLabelText('Include More travel'))
  expect(screen.getByText(/Base-year lifestyle: £30,000.00; surplus/)).toBeVisible()
  expect(equity).toHaveValue('6')
})
