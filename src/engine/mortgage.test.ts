import { expect, it } from 'vitest'
import { createMortgage, mortgageYear, monthlyPayment, initialMortgage, mortgagePreview } from './mortgage'
import { defaultMortgage } from '../config/defaultMortgage'
it('amortises a standard mortgage and reconciles annually', () => {
  let state = createMortgage(446000, 0.04, 300)
  expect(state.monthlyPayment).toBeCloseTo(2354.15, 1)
  for (let i = 0; i < 25; i++) {
    const year = mortgageYear(state)
    expect(year.opening + year.interest - year.payment).toBeCloseTo(year.closing, 6)
    state = year.state
  }
  expect(state.balance).toBe(0)
})
it('supports zero-rate/zero-balance and clamps final overpayments', () => {
  expect(monthlyPayment(12000, 0, 12)).toBe(1000)
  const result = mortgageYear(createMortgage(1000, 0, 12), 100000)
  expect(result.payment).toBe(1000)
  expect(result.closing).toBe(0)
  expect(mortgageYear(createMortgage(0, 0, 12)).payment).toBe(0)
})
it('overpayments lower balance and later interest without recasting scheduled payment', () => {
  const state = createMortgage(100000, 0.05, 240)
  const normal = mortgageYear(state), overpaid = mortgageYear(state, 500)
  expect(overpaid.closing).toBeLessThan(normal.closing)
  expect(mortgageYear(overpaid.state).interest).toBeLessThan(mortgageYear(normal.state).interest)
  expect(overpaid.state.monthlyPayment).toBe(state.monthlyPayment)
})
it('remortgages at the year boundary without replacing outstanding principal', () => {
  const state = mortgageYear(createMortgage(100000, 0.05, 240)).state
  const year = mortgageYear(state, 0, { id: 'r', year: 2027, annualRate: 0.02, termYears: 10, enabled: true })
  expect(year.opening).toBe(state.balance)
  expect(year.state.annualRate).toBe(0.02)
  expect(year.state.remainingMonths).toBe(108)
})
it('requires missing terms and explicitly converts nominal debt to real pounds', () => {
  expect(() => initialMortgage(446000, 2026, defaultMortgage)).toThrow(/Enter mortgage/)
  expect(mortgagePreview(0, 2026, defaultMortgage).payment).toBe(0)
  const plan = { ...defaultMortgage, annualRate: 0, termYears: 10, inflation: 0.1 }
  expect(mortgagePreview(12000, 2026, plan).closing).toBeCloseTo(10800 / 1.1)
})
