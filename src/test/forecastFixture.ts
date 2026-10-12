import type { ForecastInput } from '../domain/forecast'
import { loadDefaultHousehold } from '../config/defaultHousehold'
import { defaultPlanning } from '../config/defaultPlanning'
import { defaultTax } from '../config/defaultTax'
import { defaultContributions } from '../config/defaultContributions'
import { defaultMortgage } from '../config/defaultMortgage'
import { defaultAllowances } from '../config/defaultAllowances'

/** Explicit complete test household; financial assumptions are test data, not personal defaults. */
export function completeForecastFixture(): ForecastInput {
  const household = loadDefaultHousehold()
  household.isas.forEach(a => { a.value = 1000 })
  household.pensions.forEach(a => { a.value = 10000 })
  household.properties[0]!.value = 300000
  household.mortgages[0]!.balance = 12000
  household.cash[0]!.value = 500
  return {
    household, planning: { ...defaultPlanning, houseGrowth: 0.01 }, tax: structuredClone(defaultTax), moneyBasis: household.assumptions.moneyBasis,
    income: household.people.map(p => ({ id: `${p.id}-work`, personId: p.id, kind: 'paye', startYear: 2026, endYear: 2091, annualSalary: 30000, dayRate: 0, billableDays: 0, workingFraction: 1, annualGrossOverride: null,
      contributions: { ...defaultContributions, employeeRate: 0.1, employerRate: 0.05 } })),
    spending: { baseline: 20000, events: [] }, children: [], moves: [],
    mortgage: { ...defaultMortgage, annualRate: 0, termYears: 10 }, allowances: { ...defaultAllowances },
  }
}
