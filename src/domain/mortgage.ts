import { fraction, nonNegative } from './timeline'
export interface Refinance { id: string; year: number; annualRate: number; termYears: number; enabled: boolean }
export interface MortgagePlan {
  annualRate: number | null
  termYears: number | null
  monthlyOverpayment: number
  inflation: number
  refinances: Refinance[]
}
export function validTerm(value: number): boolean { return Number.isInteger(value) && value >= 1 && value <= 50 }
export function validateMortgagePlan(plan: MortgagePlan): string | undefined {
  if ((plan.annualRate !== null && !fraction(plan.annualRate)) || (plan.termYears !== null && !validTerm(plan.termYears))) return 'Mortgage rate must be 0–100%; term 1–50 whole years.'
  if (!nonNegative(plan.monthlyOverpayment) || !Number.isFinite(plan.inflation) || plan.inflation < 0 || plan.inflation > 0.2) return 'Overpayment must be non-negative; inflation 0–20%.'
  const years = new Set<number>()
  for (const r of plan.refinances) {
    if (!Number.isInteger(r.year) || r.year < 1900 || r.year > 9999 || !fraction(r.annualRate) || !validTerm(r.termYears)) return 'Invalid remortgage year, rate or term.'
    if (r.enabled && years.has(r.year)) return 'Only one remortgage is allowed per year.'
    if (r.enabled) years.add(r.year)
  }
}
