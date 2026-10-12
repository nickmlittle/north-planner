import { expect, it } from 'vitest'
import { isISODate, remainingAfterObservationFraction, remainingYearFraction } from './dates'

it('validates strict calendar dates and prorates inclusive start days across leap years', () => {
  expect(isISODate('2024-02-29')).toBe(true)
  expect(isISODate('2025-02-29')).toBe(false)
  expect(isISODate('2026-13-01')).toBe(false)
  expect(remainingYearFraction('2024-07-02')).toBeCloseTo(183 / 366)
  expect(remainingYearFraction('2025-07-02')).toBeCloseTo(183 / 365)
  expect(remainingYearFraction('2024-01-01')).toBe(1)
  expect(remainingYearFraction('2024-12-31')).toBeCloseTo(1 / 366)
})

it('starts projections after an end-of-day balance cutoff, but includes the planning start day', () => {
  expect(remainingAfterObservationFraction('2024-01-01', null)).toBe(1)
  expect(remainingAfterObservationFraction('2024-07-02', '2024-07-02')).toBeCloseTo(182 / 366)
  expect(remainingAfterObservationFraction('2024-01-01', '2024-12-31')).toBe(0)
  expect(remainingAfterObservationFraction('2025-01-01', '2024-12-31')).toBe(1)
})
