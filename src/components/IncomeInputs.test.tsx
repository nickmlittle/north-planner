// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
afterEach(cleanup)
it('adds and edits an income period with immediate gross income output', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Nick income period' }))
  fireEvent.change(screen.getByLabelText('Nick Annual salary (GBP)'), { target: { value: '110000' } })
  expect(screen.getByText('Base-year gross income: £110,000.00')).toBeVisible()
})
