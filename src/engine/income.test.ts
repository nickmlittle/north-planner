import { expect, it } from 'vitest'
import { grossIncome } from './income'
import { validateIncome } from '../domain/income'
import type { IncomePeriod } from '../domain/income'
const paye: IncomePeriod = { id: '1', personId: 'nick', kind: 'paye', startYear: 2026, endYear: 2028, annualSalary: 110000, dayRate: 500, billableDays: 200, workingFraction: 1, annualGrossOverride: null }
it('handles sequential replacement periods and exclusive boundaries', () => {
  const periods = [{ ...paye, kind: 'inside-ir35' as const }, { ...paye, id: '2', startYear: 2028, endYear: 2030 }]
  expect(grossIncome(periods, 'nick', 2027)).toBe(100000)
  expect(grossIncome(periods, 'nick', 2028)).toBe(110000)
  expect(grossIncome(periods, 'nick', 2030)).toBe(0)
  expect(grossIncome(periods, 'immy', 2026)).toBe(0)
})
it('scales salary for reduced work unless overridden', () => {
  expect(grossIncome([{ ...paye, workingFraction: 0.6 }], 'nick', 2026)).toBe(66000)
  expect(grossIncome([{ ...paye, workingFraction: 0.6, annualGrossOverride: 70000 }], 'nick', 2026)).toBe(70000)
  expect(grossIncome([paye], 'nick', 2026, [{ id: 'leave', personId: 'nick', startYear: 2026, endYear: 2027, workingFraction: 0, annualGrossOverride: null }])).toBe(0)
})
it('flags incompatible overlaps and invalid amounts', () => {
  expect(validateIncome([paye, { ...paye, id: '2' }])).toMatch(/Overlapping/)
  expect(() => grossIncome([{ ...paye, dayRate: Infinity }], 'nick', 2026)).toThrow()
  expect(validateIncome([{ ...paye, workingFraction: 1.1 }])).toBeTruthy()
})
