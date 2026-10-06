import type { IncomeAdjustment, IncomePeriod } from '../domain/income'
import type { TaxRules } from '../domain/tax'
import { defaultContributions } from '../config/defaultContributions'
import { grossIncome } from './income'
import { activeInYear } from '../domain/timeline'
import { estimateTax } from './tax'

export function employmentCashFlow(periods: IncomePeriod[], personId: string, year: number, age: number, fireAge: number, rules: TaxRules, adjustments: IncomeAdjustment[] = []) {
  const period = periods.find(p => p.personId === personId && activeInYear(p, year))
  const contributions = period?.contributions ?? defaultContributions
  const configuredGross = grossIncome(periods, personId, year, adjustments)
  const gross = age < fireAge || contributions.continueAfterFire ? configuredGross : 0
  const employee = gross * contributions.employeeRate
  const employer = gross * contributions.employerRate
  const sacrifice = contributions.treatment === 'salary-sacrifice'
  const reliefAtSource = contributions.treatment === 'relief-at-source'
  const taxableIncome = reliefAtSource ? gross : gross - employee
  const niEarnings = sacrifice ? gross - employee : gross
  // Extend tax bands for gross relief-at-source contributions; allowance uses adjusted net income.
  const taxRules = reliefAtSource ? { ...rules, incomeTaxBands: rules.incomeTaxBands.map(b => ({ ...b, upTo: b.upTo === null ? null : b.upTo + employee })) } : rules
  const estimate = estimateTax(taxableIncome, taxRules, niEarnings, gross - employee)
  const employeeCash = reliefAtSource ? employee * 0.8 : employee
  const disposable = gross - employeeCash - estimate.tax - estimate.ni
  return { gross, taxableIncome, niEarnings, tax: estimate.tax, ni: estimate.ni, employee, employeeCash, employer, totalPension: employee + employer, disposable }
}
