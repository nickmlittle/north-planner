// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'

afterEach(cleanup)

it('renders the application shell with the loaded default household', () => {
  render(<App />)
  expect(screen.getByRole('banner')).toHaveTextContent('North Planner')
  expect(screen.getByRole('main')).toHaveTextContent('financial independence')
  expect(screen.getByRole('status')).toHaveTextContent('Default household loaded successfully: Nick + Immy.')
  expect(screen.getByText('Planning basis: real 2026 GBP.')).toBeVisible()
  expect(screen.getByText(/Edit your starting position below/)).toBeVisible()
})
