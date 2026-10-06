import type { Household } from './models'
import type { ReturnAssumptions } from './planning'
import type { IncomePeriod } from './income'
import type { TaxRules } from './tax'
import type { SpendingPlan } from './spending'
import type { ChildEvent } from './children'
import type { MortgagePlan } from './mortgage'
import type { PropertyMove } from './property'
import type { ISAAllowances } from './surplus'

export interface ForecastInput {
  household: Household; planning: ReturnAssumptions; income: IncomePeriod[]; tax: TaxRules
  spending: SpendingPlan; children: ChildEvent[]; mortgage: MortgagePlan; moves: PropertyMove[]; allowances: ISAAllowances
}
export interface Ledger { opening: number; flows: number; returns: number; closing: number }
export interface PersonForecast {
  personId: string; age: number; gross: number; tax: number; ni: number; employee: number; employer: number
  disposable: number; pensionContribution: number; isaContribution: number; isaWithdrawal: number
  isa: Ledger; pension: Ledger
}
export interface ForecastYear {
  year: number; people: PersonForecast[]; gross: number; disposable: number; tax: number; ni: number
  lifestyle: number; childCosts: number; mortgagePayment: number; mortgageInterest: number
  propertyCosts: number; propertyValuationChange: number; moveName?: string; moveISADraw: number
  cash: Ledger; house: Ledger; mortgage: Ledger
  isa: number; pension: number; equity: number; netWorth: number
  unfundedCash: number; reconciliationError: number
}
