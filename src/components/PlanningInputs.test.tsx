// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderPlanner } from '../test/renderPlanner'
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
afterEach(cleanup)
it('edits assumptions and preserves them when household inputs change', () => {
  renderPlanner()
  const rate = screen.getByLabelText('Equity expected real return (%)')
  fireEvent.change(rate, { target: { value: '5' } }); fireEvent.blur(rate)
  fireEvent.change(screen.getByLabelText('FIRE age'), { target: { value: '55' } })
  expect(rate).toHaveValue('5')
  fireEvent.change(rate, { target: { value: '-100' } })
  expect(rate).toHaveAttribute('aria-invalid', 'true')
})

it('displays the default withdrawal percentage without floating-point artefacts', () => {
  renderPlanner()
  expect(screen.getByLabelText('Sustainable withdrawal rate (%)')).toHaveValue('3.5')
})
