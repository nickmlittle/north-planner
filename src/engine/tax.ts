import type { TaxBand, TaxRules } from '../domain/tax'
import { validateTaxRules } from '../domain/tax'
import { nonNegative } from '../domain/timeline'

function bandCharge(income: number, bands: TaxBand[]): number {
  let lower = 0, total = 0
  for (const band of bands) {
    total += Math.max(0, Math.min(income, band.upTo ?? income) - lower) * band.rate
    if (band.upTo === null || income <= band.upTo) break
    lower = band.upTo
  }
  return total
}
/** NI earnings can differ from taxable income for net-pay pensions. */
export function estimateTax(taxableIncome: number, rules: TaxRules, niEarnings = taxableIncome, adjustedNetIncome = taxableIncome) {
  const error = validateTaxRules(rules)
  if (error) throw new Error(error)
  if (![taxableIncome, niEarnings, adjustedNetIncome].every(nonNegative)) throw new Error('Income must be finite and non-negative.')
  const allowance = Math.max(0, rules.personalAllowance - Math.max(0, adjustedNetIncome - rules.taperStart) * rules.taperRate)
  const tax = bandCharge(Math.max(0, taxableIncome - allowance), rules.incomeTaxBands)
  const ni = bandCharge(niEarnings, rules.employeeNIBands)
  return { allowance, tax, ni, takeHome: taxableIncome - tax - ni }
}
