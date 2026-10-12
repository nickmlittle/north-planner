/** Amounts are in the explicitly declared GBP price basis at each record boundary. */
export type RealGBP = number
/** @deprecated Retained for source compatibility; use RealGBP with an explicit moneyBasis. */
export type Real2026GBP = RealGBP
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
  value: RealGBP
  /** Balance observation cutoff; null means unknown and excludes it from dated projections. */
  asOfDate: string | null
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
  balance: RealGBP
  asOfDate: string | null
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
  amount: RealGBP
}

export interface LifeEvent extends EventBase {
  kind: 'life'
  description: string
}

export type PlanningEvent = FinancialEvent | LifeEvent

export interface PlanningAssumptions {
  moneyBasis: { currency: 'GBP'; priceYear: number; terms: 'real' }
  /** Inclusive start of projection day. */
  startDate: string
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
