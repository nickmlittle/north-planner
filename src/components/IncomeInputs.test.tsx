// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderPlanner } from '../test/renderPlanner'
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
afterEach(cleanup)
it('adds and edits an income period with immediate gross income output', () => {
  renderPlanner('income')
  fireEvent.change(screen.getByLabelText('Alex Annual salary (GBP)'), { target: { value: '110000' } })
  expect(screen.getByText('Base-year gross income: £110,000.00')).toBeVisible()
})
