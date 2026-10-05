/** All money is in pounds of 2026 purchasing power, never nominal future pounds. */
export type Real2026GBP = number
/** Annual real rates are decimals: 0.03 means 3% above inflation. */
export type AnnualRealRate = number
export type PersonId = string
export type CalendarYear = number

export interface Person {
  id: PersonId
  name: string
  birthYear: CalendarYear | null
  targetFireAge: number | null
}

interface OwnedAsset {
  id: string
  name: string
  ownerIds: PersonId[]
  value: Real2026GBP
}

export interface ISA extends OwnedAsset {
  kind: 'isa'
  isaType: 'cash' | 'stocks-and-shares'
}

export interface Pension extends OwnedAsset {
  kind: 'pension'
  accessAge: number | null
}

export interface House extends OwnedAsset {
  kind: 'property'
  use: 'primary-residence' | 'rental'
}

export interface Cash extends OwnedAsset {
  kind: 'cash'
}

export interface Mortgage {
  id: string
  propertyId: string
  borrowerIds: PersonId[]
  balance: Real2026GBP
  /** Contractual nominal annual interest rate, unlike real asset returns. */
  annualInterestRate: number | null
  endYear: CalendarYear | null
}

interface EventBase {
  id: string
  name: string
  year: CalendarYear
  personIds: PersonId[]
}

export interface FinancialEvent extends EventBase {
  kind: 'financial'
  /** Positive for inflows, negative for outflows; a one-off event. */
  amount: Real2026GBP
}

export interface LifeEvent extends EventBase {
  kind: 'life'
  description: string
}

export type PlanningEvent = FinancialEvent | LifeEvent

export interface PlanningAssumptions {
  moneyBasis: { currency: 'GBP'; priceYear: 2026; terms: 'real' }
  startYear: CalendarYear
  endYear: CalendarYear
  annualRealReturns: {
    investments: AnnualRealRate | null
    property: AnnualRealRate | null
    cash: AnnualRealRate | null
  }
}

export interface Household {
  id: string
  name: string
  people: Person[]
  isas: ISA[]
  pensions: Pension[]
  properties: House[]
  mortgages: Mortgage[]
  cash: Cash[]
  events: PlanningEvent[]
  assumptions: PlanningAssumptions
}
