// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderPlanner } from '../test/renderPlanner'
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
afterEach(cleanup)
it('updates lifestyle spending on its own settings page', () => {
  renderPlanner('spending')
  fireEvent.change(screen.getByLabelText('Annual baseline lifestyle spending (GBP)'), { target: { value: '30000' } })
  expect(screen.getByText(/Base-year lifestyle: £30,000.00; surplus/)).toBeVisible()
  const saved = JSON.parse(localStorage.getItem('north.household.v1')!)
  expect(saved.snapshot.spending).toBe('30000')
})
