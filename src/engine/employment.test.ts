import { expect, it } from 'vitest'
import { employmentCashFlow } from './employment'
import { defaultTax } from '../config/defaultTax'
import { defaultContributions } from '../config/defaultContributions'
import type { IncomePeriod } from '../domain/income'
const p: IncomePeriod = { id: '1', personId: 'nick', kind: 'paye', startYear: 2026, endYear: 2030, annualSalary: 60000, dayRate: 0, billableDays: 0, workingFraction: 1, annualGrossOverride: null, contributions: { ...defaultContributions, employeeRate: 0.1, employerRate: 0.05 } }
it('reduces taxable and NI earnings under sacrifice; employer does not enter cash', () => {
  const flow = employmentCashFlow([p], 'nick', 2026, 32, 50, defaultTax)
  expect(flow).toMatchObject({ gross: 60000, taxableIncome: 54000, niEarnings: 54000, employee: 6000, employer: 3000, totalPension: 9000 })
  expect(flow.disposable + flow.employeeCash + flow.tax + flow.ni).toBeCloseTo(flow.gross)
})
it('net pay reduces tax but preserves NI earnings', () => {
  const flow = employmentCashFlow([{ ...p, contributions: { ...p.contributions!, treatment: 'net-pay' } }], 'nick', 2026, 32, 50, defaultTax)
  expect(flow.niEarnings).toBe(60000)
  expect(flow.taxableIncome).toBe(54000)
})
it('models SIPP gross relief-at-source contributions and reclaimed higher relief', () => {
  const flow = employmentCashFlow([{ ...p, contributions: { ...p.contributions!, treatment: 'relief-at-source' } }], 'nick', 2026, 32, 50, defaultTax)
  expect(flow.employeeCash).toBe(4800)
  expect(flow.tax).toBeCloseTo(10232, 2)
  expect(flow.niEarnings).toBe(60000)
})
it('stops at FIRE/end year unless work explicitly continues', () => {
  expect(employmentCashFlow([p], 'nick', 2026, 50, 50, defaultTax).totalPension).toBe(0)
  expect(employmentCashFlow([p], 'nick', 2030, 36, 50, defaultTax).gross).toBe(0)
  expect(employmentCashFlow([{ ...p, contributions: { ...p.contributions!, continueAfterFire: true } }], 'nick', 2026, 50, 50, defaultTax).totalPension).toBe(9000)
})
