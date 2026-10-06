// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
afterEach(cleanup)
it('edits assumptions and preserves them when household inputs change', () => {
  render(<App />)
  const rate = screen.getByLabelText('Equity expected real return (%)')
  fireEvent.change(rate, { target: { value: '5' } }); fireEvent.blur(rate)
  fireEvent.change(screen.getByLabelText('Nick age'), { target: { value: '33' } })
  expect(rate).toHaveValue('5')
  fireEvent.change(rate, { target: { value: '-100' } })
  expect(rate).toHaveAttribute('aria-invalid', 'true')
})

it('displays the default withdrawal percentage without floating-point artefacts', () => {
  render(<App />)
  expect(screen.getByLabelText('Sustainable withdrawal rate (%)')).toHaveValue('3.5')
})
