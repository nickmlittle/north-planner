import type { Household } from '../domain/models'

/** Bootstrap data only: no personal balances or unconfirmed ages are invented. */
const defaultHousehold: Household = {
  id: 'nick-and-immy',
  name: 'Nick + Immy',
  people: [
    { id: 'nick', name: 'Nick', birthYear: null, targetFireAge: null },
    { id: 'immy', name: 'Immy', birthYear: null, targetFireAge: null },
  ],
  isas: [],
  pensions: [],
  properties: [],
  mortgages: [],
  cash: [],
  events: [],
  assumptions: {
    moneyBasis: { currency: 'GBP', priceYear: 2026, terms: 'real' },
    startYear: 2026,
    endYear: 2100,
    annualRealReturns: { investments: null, property: null, cash: null },
  },
}

/** Each application instance receives independent mutable configuration. */
export function loadDefaultHousehold(): Household {
  return structuredClone(defaultHousehold)
}
