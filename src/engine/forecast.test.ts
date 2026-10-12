import { expect, it } from 'vitest'
import { annualForecast, forecastResult } from './forecast'
import { completeForecastFixture } from '../test/forecastFixture'
import type { ForecastYear } from '../domain/forecast'

function reconcile(row: ForecastYear, previous?: ForecastYear) {
  for (const l of [...row.people.flatMap(p => [p.isa, p.pension]), row.cash, row.house, row.mortgage]) {
    expect(l.opening + l.flows + l.returns).toBeCloseTo(l.closing, 5)
  }
  expect(row.reconciliationError).toBeLessThan(0.01)
  expect(row.netWorth).toBeCloseTo(row.isa + row.pension + row.cash.closing + row.house.closing - row.mortgage.closing, 5)
  if (previous) {
    row.people.forEach((p, i) => {
      expect(p.isa.opening).toBeCloseTo(previous.people[i]!.isa.closing, 5)
      expect(p.pension.opening).toBeCloseTo(previous.people[i]!.pension.closing, 5)
    })
    expect(row.cash.opening).toBeCloseTo(previous.cash.closing, 5)
    expect(row.house.opening).toBeCloseTo(previous.house.closing, 5)
    expect(row.mortgage.opening).toBeCloseTo(previous.mortgage.closing, 5)
  }
}
it('runs a complete no-event household to both horizon ages with independently calculated first-year totals', () => {
  const input = completeForecastFixture(), before = structuredClone(input)
  const rows = annualForecast(input)
  expect(rows).toHaveLength(65)
  expect(rows[0]!.year).toBe(2026)
  expect(rows.at(-1)!.year).toBe(2090)
  expect(rows.at(-1)!.people.map(p => p.age)).toEqual([96, 95])
  const first = rows[0]!
  expect(first).toMatchObject({ gross: 60000, lifestyle: 20000, childCosts: 0, propertyCosts: 0, mortgagePayment: 1200 })
  expect(first.disposable).toBeCloseTo(45919.2, 2)
  expect(first.tax).toBeCloseTo(5772, 2)
  expect(first.ni).toBeCloseTo(2308.8, 2)
  expect(first.isa).toBeCloseTo(27299.2, 2)
  expect(first.pension).toBeCloseTo(29800, 2)
  expect(first.house.closing).toBeCloseTo(303000, 2)
  expect(first.mortgage.closing).toBeCloseTo(10800, 2)
  expect(first.netWorth).toBeCloseTo(349299.2, 2)
  rows.forEach((row, i) => {
    reconcile(row, rows[i - 1])
    expect(row.people.every(p => p.isaContribution <= 20000)).toBe(true)
    expect(row.people.every(p => p.isa.closing >= 0 && p.pension.closing >= 0)).toBe(true)
    // Net-worth change independently excludes internal ISA/pension/mortgage principal transfers.
    const openingWorth = row.people.reduce((sum, p) => sum + p.isa.opening + p.pension.opening, 0) + row.cash.opening + row.house.opening - row.mortgage.opening
    const externalFlows = row.disposable + row.people.reduce((sum, p) => sum + p.pensionContribution, 0) - row.lifestyle - row.childCosts - row.mortgageInterest
    const returns = row.people.reduce((sum, p) => sum + p.isa.returns + p.pension.returns, 0) + row.house.returns - row.mortgage.returns
    expect(row.netWorth).toBeCloseTo(openingWorth + externalFlows + returns, 5)
  })
  expect(rows.find(row => row.year === 2035)!.mortgage.closing).toBe(0)
  expect(input).toEqual(before)
  expect(annualForecast(input)).toEqual(rows)
})
it('recalculates when returns/spending change and stops income and contributions at FIRE', () => {
  const input = completeForecastFixture()
  const rows = annualForecast(input)
  expect(rows.find(r => r.year === 2044)!.people[0]!.gross).toBe(0)
  expect(rows.find(r => r.year === 2044)!.people[1]!.gross).toBe(30000)
  expect(rows.find(r => r.year === 2045)!.people.every(p => p.pensionContribution === 0)).toBe(true)
  expect(annualForecast({ ...input, planning: { ...input.planning, equityReturn: 0 } })[0]!.pension).toBe(29000)
  expect(annualForecast({ ...input, spending: { baseline: 21000, events: [] } })[0]!.netWorth).toBeCloseTo(rows[0]!.netWorth - 1000)
})
it('prorates start-year income, pension saving and monthly spending by inclusive calendar days', () => {
  const input = completeForecastFixture()
  input.household.isas.forEach(a => { a.value = 0 })
  input.household.pensions.forEach(a => { a.value = 0 })
  input.household.cash.forEach(a => { a.value = 0 })
  input.household.properties.forEach(a => { a.value = 0 })
  input.household.mortgages.forEach(a => { a.balance = 0 })
  const fullYear = annualForecast(input)[0]!
  input.household.assumptions.startDate = '2026-10-01'
  input.household.assumptions.startYear = 2026
  input.household.isas.forEach(a => { a.asOfDate = '2026-09-30' })
  input.household.pensions.forEach(a => { a.asOfDate = '2026-09-30' })
  input.household.properties.forEach(a => { a.asOfDate = '2026-09-30' })
  input.household.mortgages.forEach(a => { a.asOfDate = '2026-09-30' })
  const first = annualForecast(input)[0]!
  const fraction = 92 / 365
  expect(first.gross).toBeCloseTo(60000 * fraction)
  expect(first.people.reduce((sum, p) => sum + p.pensionContribution, 0)).toBeCloseTo(9000 * fraction)
  expect(first.lifestyle).toBeCloseTo(20000 * fraction)
  expect(first.people.reduce((sum, p) => sum + p.isaContribution, 0)).toBeCloseTo(fullYear.people.reduce((sum, p) => sum + p.isaContribution, 0) * fraction)
})
it('uses the explicit planning year and keeps unknown dated balances outside the forecast', () => {
  const input = completeForecastFixture()
  input.household.assumptions.startDate = '2030-01-01'
  input.household.assumptions.startYear = 2030
  input.household.assumptions.moneyBasis.priceYear = 2028
  input.moneyBasis.priceYear = 2028
  input.household.isas[0]!.asOfDate = null
  input.household.isas[0]!.value = 5000
  const rows = annualForecast(input)
  expect(rows[0]!.year).toBe(2030)
  expect(rows[0]!.people[0]!.isa.opening).toBe(0)
  expect(input.household.isas[0]!.value).toBe(5000)
})
it('prorates planned mortgage overpayments from a mid-year start', () => {
  const input = completeForecastFixture()
  input.household.mortgages[0]!.balance = 100000
  input.mortgage = { ...input.mortgage, annualRate: 0, termYears: 20, monthlyOverpayment: 100 }
  const fullYear = annualForecast(input)[0]!
  input.household.assumptions.startDate = '2026-10-01'
  input.household.assumptions.startYear = 2026
  input.household.mortgages[0]!.asOfDate = '2026-09-30'
  const partialYear = annualForecast(input)[0]!
  expect(fullYear.mortgage.closing).toBeCloseTo(100000 - (100000 / 240 + 100) * 12)
  expect(partialYear.mortgage.closing).toBeCloseTo(100000 - (100000 / 240 + 100) * 12 * (92 / 365))
})
it('integrates child/work/spending events, property moves, debt inflation and remortgages while reconciling', () => {
  const input = completeForecastFixture()
  input.mortgage = { ...input.mortgage, annualRate: 0.04, inflation: 0.02, monthlyOverpayment: 10, refinances: [{ id: 'r', year: 2027, annualRate: 0.03, termYears: 5, enabled: true }] }
  input.children = [{ id: 'child', birthYear: 2027, enabled: true, birthCost: 1000, costs: { ages0to2: 10000, ages3to4: 8000, ages5to11: 5000, ages12to18: 6000 }, workAdjustments: [{ id: 'leave', personId: 'immy', startYear: 2027, endYear: 2028, workingFraction: 0.6, annualGrossOverride: null }] }]
  input.spending.events = [{ id: 'spend', name: 'spend', startYear: 2027, endYear: 2030, annualChange: 1000, enabled: true }]
  input.moves = [{ id: 'move', name: 'Surrey', year: 2033, enabled: true, saleValue: null, purchasePrice: 500000, stampDuty: 20000, agentFees: 5000, legalFees: 1000, movingCosts: 1000, renovation: 1000, annualRate: 0.04, termYears: 25, agentFeeRate: 0, legalFeeRate: 0, renovationRate: 0 }]
  const rows = annualForecast(input)
  rows.forEach((row, i) => {
    reconcile(row, rows[i - 1])
    const openingWorth = row.people.reduce((sum, p) => sum + p.isa.opening + p.pension.opening, 0) + row.cash.opening + row.house.opening - row.mortgage.opening
    const external = row.disposable + row.people.reduce((sum, p) => sum + p.pensionContribution, 0) - row.lifestyle - row.childCosts - row.mortgageInterest - row.propertyCosts + row.propertyValuationChange
    const returns = row.people.reduce((sum, p) => sum + p.isa.returns + p.pension.returns, 0) + row.house.returns - row.mortgage.returns
    expect(row.netWorth).toBeCloseTo(openingWorth + external + returns, 5)
  })
  expect(rows[1]!.childCosts).toBe(11000)
  expect(rows[1]!.people[1]!.gross).toBe(18000)
  expect(rows[1]!.lifestyle).toBe(21000)
  const moveYear = rows.find(r => r.year === 2033)!
  expect(moveYear.moveName).toBe('Surrey')
  expect(moveYear.moveISADraw).toBeGreaterThan(0)
  expect(moveYear.house.closing).toBe(505000)
  expect(moveYear.propertyCosts).toBe(28000)
  const disabled = annualForecast({ ...input, children: input.children.map(c => ({ ...c, enabled: false })) })
  expect(disabled[1]!.childCosts).toBe(0)
  expect(disabled[1]!.people[1]!.gross).toBe(30000)
})
it('flags cumulative unfunded cash without negative ISA/pension balances or pretending pension withdrawals', () => {
  const input = completeForecastFixture()
  input.income = []
  const rows = annualForecast(input)
  expect(rows[0]!.isa).toBe(0)
  expect(rows[0]!.unfundedCash).toBeGreaterThan(0)
  expect(rows[0]!.cash.closing).toBeLessThan(0)
  expect(rows[0]!.pension).toBe(20800)
  rows.forEach((row, i) => reconcile(row, rows[i - 1]))
})
it('safely reports missing mortgage terms and inconsistent configurations', () => {
  const input = completeForecastFixture()
  expect(forecastResult({ ...input, mortgage: { ...input.mortgage, annualRate: null } }).error).toMatch(/Enter mortgage/)
  expect(forecastResult({ ...input, household: { ...input.household, isas: [{ ...input.household.isas[0]!, ownerIds: ['unknown'] }] } }).error).toMatch(/owner/)
  expect(forecastResult({ ...input, planning: { ...input.planning, horizonAge: 30 } }).rows).toEqual([])
})

it('accounts for property sale overrides as explicit valuation changes and rejects conflicting transactions', () => {
  const input = completeForecastFixture()
  input.moves = [{ id: 'm', name: 'Move', year: 2026, enabled: true, saleValue: 320000, purchasePrice: 350000, stampDuty: 10000, agentFees: 2000, legalFees: 1000, movingCosts: 1000, renovation: 0, annualRate: 0.04, termYears: 10, agentFeeRate: 0, legalFeeRate: 0, renovationRate: 0 }]
  const first = annualForecast(input)[0]!
  expect(first.propertyValuationChange).toBe(20000)
  reconcile(first)
  expect(forecastResult({ ...input, mortgage: { ...input.mortgage, refinances: [{ id: 'r', year: 2026, enabled: true, annualRate: 0.02, termYears: 10 }] } }).error).toMatch(/either a move or a remortgage/)
})
