import type { IncomeAdjustment, IncomePeriod } from '../domain/income'
import { validateIncome } from '../domain/income'
import { activeInYear } from '../domain/timeline'

export function grossIncome(periods: IncomePeriod[], personId: string, year: number, adjustments: IncomeAdjustment[] = []): number {
  const error = validateIncome(periods, adjustments)
  if (error) throw new Error(error)
  const period = periods.find(p => p.personId === personId && activeInYear(p, year))
  if (!period) return 0
  const adjustment = adjustments.find(a => a.personId === personId && activeInYear(a, year))
  const fullGross = period.kind === 'paye' ? period.annualSalary : period.dayRate * period.billableDays
  return adjustment?.annualGrossOverride ?? period.annualGrossOverride ?? fullGross * (adjustment?.workingFraction ?? period.workingFraction)
}
