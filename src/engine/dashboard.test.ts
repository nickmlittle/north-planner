import { expect, it } from 'vitest'
import { dashboardMetrics, forecastChartPoints } from './dashboard'
import { annualForecast } from './forecast'
import { toForecastInput } from '../domain/setup'
import { completeDocument } from '../test/setupFixture'

it('anchors FIRE to the last adult and excludes locked pensions, home equity and negative cash', () => {
  const input = toForecastInput(completeDocument())
  const younger = input.household.people[0]!
  input.household.people.push({ id: 'older', name: 'Older', birthYear: 1980, targetFireAge: null })
  input.household.pensions.push({ id: 'older-pension', kind: 'pension', name: 'Older pension', ownerIds: ['older'], value: 0, accessAge: null })
  const rows = annualForecast(input)
  const index = rows.findIndex(r => r.year === 2040)
  const row = rows[index]!
  rows[index] = { ...row, isa: 100000, pension: 40000, cash: { opening: 0, flows: -5000, returns: 0, closing: -5000 }, netWorth: 999999,
    people: [{ ...row.people[0]!, personId: younger.id, age: 50, pension: { opening: 10000, flows: 0, returns: 0, closing: 10000 } },
      { ...row.people[1]!, personId: 'older', age: 60, pension: { opening: 30000, flows: 0, returns: 0, closing: 30000 } }] }
  expect(dashboardMetrics(input, rows)).toMatchObject({ fireYear: 2040, fireNetWorth: 999999, accessible: 130000, lockedPension: 10000, annualWithdrawal: 4550 })
})

it('uses the base year for already-retired households and accepts explicit zero', () => {
  const doc = completeDocument()
  doc.planning.fireAge = 30
  const input = toForecastInput(doc), rows = annualForecast(input)
  rows[0] = { ...rows[0]!, isa: 0, pension: 0, cash: { opening: 0, flows: 0, returns: 0, closing: 0 }, unfundedCash: 0,
    people: rows[0]!.people.map(p => ({ ...p, pension: { opening: 0, flows: 0, returns: 0, closing: 0 } })) }
  const metrics = dashboardMetrics(input, rows)
  expect(metrics.fireYear).toBe(2026)
  expect(metrics.annualWithdrawal).toBe(0)
  expect(metrics.firstUnfundedYear).toBe(rows.find(r => r.unfundedCash > 0)?.year)
  expect(dashboardMetrics(input, [])).toMatchObject({ annualWithdrawal: null, fireNetWorth: null })
})

it('keeps chart categories reconciled, including negative equity and unfunded cash', () => {
  const doc = completeDocument(); doc.snapshot.homeValue = '10000'
  const input = toForecastInput(doc), rows = annualForecast(input)
  const points = forecastChartPoints(input, rows)
  expect(points[0]!.netWorth).toBe(-120000)
  expect(points.some(p => p.cash < 0)).toBe(true)
  expect(points.some(p => p.equity < 0)).toBe(true)
  for (const point of points) expect(point.isa + point.pension + point.cash + point.equity).toBeCloseTo(point.netWorth, 6)
})
