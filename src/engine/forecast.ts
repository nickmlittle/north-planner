import type { ForecastInput, ForecastYear, Ledger } from '../domain/forecast'
import { validatePlanning } from '../domain/planning'
import { validateIncome } from '../domain/income'
import { validateTaxRules } from '../domain/tax'
import { validateSpending } from '../domain/spending'
import { validateChildren } from '../domain/children'
import { validateMoves } from '../domain/property'
import { validateMortgagePlan } from '../domain/mortgage'
import { validateAllowances } from '../domain/surplus'
import { nonNegative } from '../domain/timeline'
import { isISODate, remainingYearFraction, remainingAfterObservationFraction } from '../domain/dates'
import { childEffects } from './children'
import { householdEmployment } from './employment'
import { lifestyleSpending } from './spending'
import { initialMortgage, createMortgage, mortgageYear, priceIndex } from './mortgage'
import { propertyMove } from './property'
import { netHouseholdSurplus, sweepISA } from './surplus'

function sum(values: number[]): number { return values.reduce((a, b) => a + b, 0) }
function ledger(opening: number, flows: number, returns: number): Ledger { return { opening, flows, returns, closing: opening + flows + returns } }

function validate(input: ForecastInput) {
  const { household: h } = input
  const errors = [validatePlanning(input.planning), validateIncome(input.income), validateTaxRules(input.tax), validateSpending(input.spending),
    validateChildren(input.children), validateMortgagePlan(input.mortgage), validateMoves(input.moves), validateAllowances(input.allowances)]
  const error = errors.find(Boolean)
  if (error) throw new Error(error)
  if (!h.people.length || h.people.some(p => p.birthYear === null || !Number.isInteger(p.birthYear) || h.assumptions.startYear - p.birthYear < 1 || h.assumptions.startYear - p.birthYear > 120)) throw new Error('Configure valid household ages before forecasting.')
  if (!Number.isInteger(h.assumptions.startYear) || !isISODate(h.assumptions.startDate) || h.assumptions.startYear !== Number(h.assumptions.startDate.slice(0, 4)) || h.assumptions.moneyBasis.currency !== 'GBP' || !Number.isInteger(h.assumptions.moneyBasis.priceYear) || h.assumptions.moneyBasis.terms !== 'real' || input.moneyBasis.currency !== 'GBP' || input.moneyBasis.terms !== 'real' || input.moneyBasis.priceYear !== h.assumptions.moneyBasis.priceYear) throw new Error('Forecast requires a valid planning date and explicit real GBP price basis.')
  if (![...h.isas, ...h.pensions, ...h.properties, ...h.cash, ...h.mortgages].every(a => a.asOfDate === null || isISODate(a.asOfDate))) throw new Error('Balance observation dates must be valid calendar dates.')
  if (new Set(h.people.map(p => p.id)).size !== h.people.length) throw new Error('Person IDs must be unique.')
  if (h.properties.length > 1 || h.mortgages.length > 1) throw new Error('V1 forecast supports one household home and mortgage.')
  if (h.mortgages.some(m => !h.properties.some(p => p.id === m.propertyId))) throw new Error('Mortgage must reference the current house.')
  if (![...h.isas, ...h.pensions, ...h.cash, ...h.properties].every(a => nonNegative(a.value)) || !h.mortgages.every(m => nonNegative(m.balance))) throw new Error('Starting asset and debt amounts must be finite and non-negative.')
  for (const accounts of [h.isas, h.pensions]) {
    if (accounts.some(a => a.ownerIds.length !== 1 || !h.people.some(p => p.id === a.ownerIds[0]))) throw new Error('ISA/pension accounts require a known individual owner.')
    if (h.people.some(p => accounts.filter(a => a.ownerIds[0] === p.id).length > 1)) throw new Error('V1 forecast supports one ISA and pension per person.')
  }
  if (input.income.some(p => !h.people.some(person => person.id === p.personId)) || input.children.some(c => c.workAdjustments.some(a => !h.people.some(p => p.id === a.personId)))) throw new Error('Income/work events must reference household people.')
  if (input.moves.some(m => m.enabled && input.mortgage.refinances.some(r => r.enabled && r.year === m.year))) throw new Error('Choose either a move or a remortgage in the same year.')
  if (h.events.length) throw new Error('Use the dedicated income, spending, child and property editors; generic events are not supported by this forecast.')
}

/** Annual plan ledger: opening-year moves, returns on opening assets, then end-year flows. */
export function annualForecast(input: ForecastInput): ForecastYear[] {
  validate(input)
  const { household: h, planning, mortgage: mortgagePlan } = input
  const start = h.assumptions.startYear
  const youngestBirth = Math.max(...h.people.map(p => p.birthYear!))
  // Continue until each household member has reached the horizon age, including that year.
  const end = youngestBirth + planning.horizonAge
  if (end < start || end - start > 120) throw new Error('Planning horizon must include the base year and span no more than 120 years.')
  const isas = h.people.map(p => h.isas.find(a => a.ownerIds[0] === p.id))
  const pensions = h.people.map(p => h.pensions.find(a => a.ownerIds[0] === p.id))
  let isaBalances = isas.map(a => a?.asOfDate ? a.value : 0)
  let pensionBalances = pensions.map(a => a?.asOfDate ? a.value : 0)
  let cash = sum(h.cash.filter(a => a.asOfDate).map(a => a.value))
  let house = sum(h.properties.filter(a => a.asOfDate).map(a => a.value))
  let debt = initialMortgage(h.mortgages[0]?.asOfDate ? h.mortgages[0].balance : 0, start, mortgagePlan, input.moneyBasis.priceYear)
  const rows: ForecastYear[] = []
  for (let year = start; year <= end; year++) {
    const yearFraction = year === start ? remainingYearFraction(h.assumptions.startDate) : 1
    const index = priceIndex(year, mortgagePlan.inflation, input.moneyBasis.priceYear)
    const openingISA = [...isaBalances], openingPension = [...pensionBalances], openingCash = cash, openingHouse = house, openingMortgage = debt.balance / index
    const move = input.moves.find(m => m.enabled && m.year === year)
    let moveISADraw = 0, propertyCosts = 0, cashReleased = 0, propertyFlow = 0, debtTransaction = 0, propertyValuationChange = 0
    const withdrawals = h.people.map(() => 0)
    if (move) {
      if (!h.properties.length) throw new Error('A property move needs a current house to sell.')
      const transaction = propertyMove(house, openingMortgage, isaBalances, move)
      propertyValuationChange = transaction.valuationChange; moveISADraw = transaction.isaDraw; propertyCosts = transaction.costs; cashReleased = transaction.cashReleased
      transaction.withdrawals.forEach((amount, i) => { withdrawals[i] = amount })
      isaBalances = transaction.isaBalances
      house = transaction.newHouseValue
      propertyFlow = house - openingHouse
      debtTransaction = transaction.newMortgage - openingMortgage
      debt = createMortgage(transaction.newMortgage * index, move.annualRate ?? 0, (move.termYears ?? 1) * 12)
    }
    const child = childEffects(input.children, year)
    const employment = householdEmployment(h, input.income, year, planning.fireAge, input.tax, child.adjustments, yearFraction)
    const lifestyle = lifestyleSpending(input.spending, year) * yearFraction
    const loan = mortgageYear(debt, mortgagePlan.monthlyOverpayment * index, mortgagePlan.refinances.find(r => r.enabled && r.year === year), yearFraction)
    debt = loan.state
    const payment = loan.payment / index, interest = loan.interest / index
    const isaReturns = isaBalances.map((balance, i) => balance * (isas[i]?.isaType === 'cash' ? 0 : planning.equityReturn) * (year === start ? remainingAfterObservationFraction(h.assumptions.startDate, isas[i]?.asOfDate ?? null) : 1))
    const pensionReturns = pensionBalances.map((balance, i) => balance * planning.equityReturn * (year === start ? remainingAfterObservationFraction(h.assumptions.startDate, pensions[i]?.asOfDate ?? null) : 1))
    const houseReturn = house * planning.houseGrowth * (year === start ? remainingAfterObservationFraction(h.assumptions.startDate, h.properties[0]?.asOfDate ?? null) : 1)
    isaBalances = isaBalances.map((balance, i) => balance + isaReturns[i]!)
    pensionBalances = pensionBalances.map((balance, i) => balance + pensionReturns[i]! + employment.byPerson[i]!.totalPension)
    employment.byPerson.forEach((p, i) => { if (p.totalPension > 0 && !pensions[i]) throw new Error('Configure a pension account for contribution recipients.') })
    house += houseReturn
    const surplus = netHouseholdSurplus(employment.disposable, lifestyle, child.totalCost * yearFraction, payment)
    cash += cashReleased + surplus
    const contributions = h.people.map(() => 0)
    if (cash >= 0) {
      const allocation = sweepISA(cash, h.people.map((p, i) => ({ personId: p.id, balance: isaBalances[i]!, allowance: isas[i] ? input.allowances[p.id] ?? 0 : 0, subscribed: 0,
        yearsToFire: Math.max(0, (p.targetFireAge ?? planning.fireAge) - (year - p.birthYear!) - 1), realReturn: isas[i]?.isaType === 'cash' ? 0 : planning.equityReturn })))
      isaBalances = allocation.balances; cash = allocation.cash
      allocation.contributions.forEach((amount, i) => { contributions[i] = amount })
    } else {
      // Exhaust cash first, then ISA proportionally. Remaining signed cash is an unfunded plan need, not assumed borrowing.
      const available = sum(isaBalances), draw = Math.min(-cash, available)
      isaBalances = isaBalances.map((balance, i) => {
        const amount = available > 0 ? draw * balance / available : 0
        withdrawals[i] = withdrawals[i]! + amount
        return Math.max(0, balance - amount)
      })
      cash += draw
      if (Math.abs(cash) < 1e-8) cash = 0
    }
    const cashLedger = ledger(openingCash, cashReleased + surplus + sum(withdrawals) - moveISADraw - sum(contributions), 0)
    const mortgageLedger = ledger(openingMortgage, debtTransaction + interest - payment, debt.balance / priceIndex(year + 1, mortgagePlan.inflation, input.moneyBasis.priceYear) - debt.balance / index)
    const houseLedger = ledger(openingHouse, propertyFlow, houseReturn)
    const people = h.people.map((person, i) => ({ personId: person.id, age: year - person.birthYear!, gross: employment.byPerson[i]!.gross, tax: employment.byPerson[i]!.tax, ni: employment.byPerson[i]!.ni,
      employee: employment.byPerson[i]!.employee, employer: employment.byPerson[i]!.employer, disposable: employment.byPerson[i]!.disposable, pensionContribution: employment.byPerson[i]!.totalPension,
      isaContribution: contributions[i]!, isaWithdrawal: withdrawals[i]!, isa: ledger(openingISA[i]!, contributions[i]! - withdrawals[i]!, isaReturns[i]!),
      pension: ledger(openingPension[i]!, employment.byPerson[i]!.totalPension, pensionReturns[i]!) }))
    const ledgers = [...people.flatMap(p => [p.isa, p.pension]), cashLedger, mortgageLedger, houseLedger]
    const actual = [...isaBalances, ...pensionBalances, cash, debt.balance / priceIndex(year + 1, mortgagePlan.inflation, input.moneyBasis.priceYear), house]
    const expected = [...people.map(p => p.isa.closing), ...people.map(p => p.pension.closing), cashLedger.closing, mortgageLedger.closing, houseLedger.closing]
    const reconciliationError = Math.max(...actual.map((value, i) => Math.abs(value - expected[i]!)))
    if (ledgers.some(l => !Object.values(l).every(Number.isFinite)) || reconciliationError > 0.01) throw new Error(`Forecast failed balance reconciliation in ${year}.`)
    const isa = sum(isaBalances), pension = sum(pensionBalances), equity = house - mortgageLedger.closing
    rows.push({ year, people, gross: sum(people.map(p => p.gross)), disposable: employment.disposable, tax: sum(people.map(p => p.tax)), ni: sum(people.map(p => p.ni)),
      lifestyle, childCosts: child.totalCost * yearFraction, mortgagePayment: payment, mortgageInterest: interest, propertyCosts, propertyValuationChange, moveName: move?.name, moveISADraw,
      cash: cashLedger, house: houseLedger, mortgage: mortgageLedger, isa, pension, equity, netWorth: isa + pension + cash + equity,
      unfundedCash: Math.max(0, -cash), reconciliationError })
  }
  return rows
}

export function forecastResult(input: ForecastInput): { rows: ForecastYear[]; error?: string } {
  try { return { rows: annualForecast(input) } }
  catch (error) { return { rows: [], error: error instanceof Error ? error.message : 'Invalid forecast configuration.' } }
}
