import type { MortgagePlan, Refinance } from '../domain/mortgage'
import { validateMortgagePlan } from '../domain/mortgage'
import { fraction, nonNegative } from '../domain/timeline'

export interface MortgageState { balance: number; annualRate: number; remainingMonths: number; monthlyPayment: number }
export function monthlyPayment(balance: number, annualRate: number, months: number): number {
  if (!nonNegative(balance) || !fraction(annualRate) || !Number.isInteger(months) || months < 1 || months > 600) throw new Error('Invalid mortgage balance, rate or remaining months.')
  const rate = annualRate / 12
  return rate === 0 ? balance / months : balance * rate / -Math.expm1(-months * Math.log1p(rate))
}
export function createMortgage(balance: number, annualRate: number, months: number): MortgageState {
  return { balance, annualRate, remainingMonths: months, monthlyPayment: monthlyPayment(balance, annualRate, months) }
}
/** Nominal monthly contractual payments. Overpayments keep the scheduled payment, shortening payoff. */
export function mortgageYear(opening: MortgageState, monthlyOverpayment = 0, refinance?: Refinance) {
  if (!nonNegative(monthlyOverpayment)) throw new Error('Invalid overpayment.')
  if (!nonNegative(opening.balance) || !fraction(opening.annualRate) || !nonNegative(opening.monthlyPayment)
    || !Number.isInteger(opening.remainingMonths) || opening.remainingMonths < 0 || opening.remainingMonths > 600
    || (opening.balance > 0 && opening.remainingMonths === 0)) throw new Error('Invalid mortgage state.')
  let state = { ...opening }
  if (refinance?.enabled && state.balance > 0) state = createMortgage(state.balance, refinance.annualRate, refinance.termYears * 12)
  let payment = 0, interest = 0
  for (let month = 0; month < 12 && state.balance > 1e-8; month++) {
    const charge = state.balance * state.annualRate / 12
    const paid = state.remainingMonths === 1 ? state.balance + charge : Math.min(state.balance + charge, state.monthlyPayment + monthlyOverpayment)
    interest += charge; payment += paid
    state.balance = Math.max(0, state.balance + charge - paid)
    state.remainingMonths--
  }
  if (state.balance < 1e-8) state.balance = 0
  return { state, opening: opening.balance, interest, payment, principal: payment - interest, closing: state.balance }
}
export function priceIndex(year: number, inflation: number): number { return (1 + inflation) ** (year - 2026) }
export function initialMortgage(balanceReal: number, year: number, plan: MortgagePlan): MortgageState {
  const error = validateMortgagePlan(plan)
  if (error) throw new Error(error)
  if (balanceReal > 0 && (plan.annualRate === null || plan.termYears === null)) throw new Error('Enter mortgage interest rate and remaining term to calculate payments.')
  return createMortgage(balanceReal * priceIndex(year, plan.inflation), plan.annualRate ?? 0, (plan.termYears ?? 1) * 12)
}
export function mortgagePreview(balanceReal: number, year: number, plan: MortgagePlan): { payment?: number; closing?: number; error?: string } {
  try {
    const result = mortgageYear(initialMortgage(balanceReal, year, plan), plan.monthlyOverpayment * priceIndex(year, plan.inflation), plan.refinances.find(r => r.enabled && r.year === year))
    return { payment: result.payment / priceIndex(year, plan.inflation), closing: result.closing / priceIndex(year + 1, plan.inflation) }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid mortgage configuration.' } }
}
