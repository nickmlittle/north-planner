import type { MortgagePlan } from '../domain/mortgage'
/** Interest/term must be entered; no personal mortgage assumptions are invented. */
export const defaultMortgage: MortgagePlan = { annualRate: null, termYears: null, monthlyOverpayment: 0, inflation: 0, refinances: [] }
