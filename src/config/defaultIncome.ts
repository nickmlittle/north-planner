import type { IncomePeriod } from '../domain/income'

/** No household salary/day-rate defaults were supplied; do not fabricate earnings. */
export const defaultIncome: IncomePeriod[] = []
export function newIncomePeriod(personId: string, startYear: number): IncomePeriod {
  return { id: crypto.randomUUID(), personId, kind: 'paye', startYear, endYear: startYear + 1,
    annualSalary: 0, dayRate: 0, billableDays: 0, workingFraction: 1, annualGrossOverride: null }
}
