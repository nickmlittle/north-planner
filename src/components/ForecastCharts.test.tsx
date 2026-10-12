// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { annualForecast } from '../engine/forecast'
import { completeForecastFixture } from '../test/forecastFixture'
import { ForecastCharts } from './ForecastCharts'

it('splits cash areas at zero crossings and suppresses tiny signed-zero balances', () => {
  const input = completeForecastFixture()
  const rows = annualForecast(input).slice(0, 4)
  rows[0]!.cash.closing = 100
  rows[1]!.cash.closing = -100
  rows[2]!.cash.closing = 100
  rows[3]!.cash.closing = -1e-10
  render(<ForecastCharts input={input} rows={rows} events={[]} onAddGoal={() => {}} />)

  const chart = screen.getByRole('img', { name: /Combined net worth and asset category chart/ })
  const positiveArea = chart.querySelector('.cash-positive-area')!
  const negativeArea = chart.querySelector('.cash-negative-area')!
  expect(positiveArea.getAttribute('d')).toContain(' Z M')
  expect(negativeArea.getAttribute('d')).toContain(' Z M')

  fireEvent.change(screen.getByLabelText('Explore a year'), { target: { value: '4' } })
  const categories = chart.closest('.chart-card')!.querySelector('.category-values')!
  expect(categories.textContent).toContain('Cash / unfunded need £0.00')
})
