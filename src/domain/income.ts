import type { PensionContributions } from './contributions'
import { validateContributions } from './contributions'
import type { YearPeriod } from './timeline'
import { fraction, nonNegative, validPeriod } from './timeline'

export interface IncomePeriod extends YearPeriod {
  contributions?: PensionContributions
  id: string
  personId: string
  kind: 'paye' | 'inside-ir35'
  annualSalary: number
  dayRate: number
  billableDays: number
  workingFraction: number
  annualGrossOverride: number | null
}
export interface IncomeAdjustment extends YearPeriod {
  id: string
  personId: string
  workingFraction: number
  annualGrossOverride: number | null
}

export function validateIncome(periods: IncomePeriod[], adjustments: IncomeAdjustment[] = []): string | undefined {
  if (new Set(periods.map(p => p.id)).size !== periods.length) return 'Income period IDs must be unique.'
  for (const p of periods) {
    if (p.contributions && validateContributions(p.contributions)) return validateContributions(p.contributions)
    if (!p.personId || !validPeriod(p) || !['paye', 'inside-ir35'].includes(p.kind)) return 'Income periods need a person and valid start/end years.'
    if (![p.annualSalary, p.dayRate, p.billableDays].every(nonNegative) || p.billableDays > 366 || !fraction(p.workingFraction)
      || (p.annualGrossOverride !== null && !nonNegative(p.annualGrossOverride))) return 'Income amounts must be non-negative; billable days 0–366 and working fraction 0–1.'
  }
  for (let i = 0; i < periods.length; i++) for (const other of periods.slice(i + 1)) {
    const p = periods[i]!
    if (p.personId === other.personId && p.startYear < other.endYear && other.startYear < p.endYear) return 'Overlapping income periods for the same person are incompatible.'
  }
  for (const a of adjustments) {
    if (!validPeriod(a) || !a.personId || !fraction(a.workingFraction) || (a.annualGrossOverride !== null && !nonNegative(a.annualGrossOverride))) return 'Invalid reduced-work event.'
  }
  for (let i = 0; i < adjustments.length; i++) for (const other of adjustments.slice(i + 1)) {
    const a = adjustments[i]!
    if (a.personId === other.personId && a.startYear < other.endYear && other.startYear < a.endYear) return 'Overlapping reduced-work events need one explicit combined working pattern.'
  }
}
