import type { Household } from '../domain/models'

/** User-supplied starting position in real 2026 GBP. */
const defaultHousehold: Household = {
  id: 'nick-and-immy',
  name: 'Nick + Immy',
  people: [
    { id: 'nick', name: 'Nick', birthYear: 1994, targetFireAge: null },
    { id: 'immy', name: 'Immy', birthYear: 1995, targetFireAge: null },
  ],
  isas: [
    { id: 'nick-isa', kind: 'isa', name: 'Nick ISA', ownerIds: ['nick'], value: 88000, asOfDate: '2025-12-31', isaType: 'stocks-and-shares' },
    { id: 'immy-isa', kind: 'isa', name: 'Immy ISA', ownerIds: ['immy'], value: 1000, asOfDate: '2025-12-31', isaType: 'stocks-and-shares' },
  ],
  pensions: [
    { id: 'nick-pension', kind: 'pension', name: 'Nick pension', ownerIds: ['nick'], value: 117000, asOfDate: '2025-12-31', accessAge: null },
    { id: 'immy-pension', kind: 'pension', name: 'Immy pension', ownerIds: ['immy'], value: 25000, asOfDate: '2025-12-31', accessAge: null },
  ],
  properties: [{ id: 'home', kind: 'property', name: 'Current house', ownerIds: ['nick', 'immy'], value: 850000, asOfDate: '2025-12-31', use: 'primary-residence' }],
  mortgages: [{ id: 'home-mortgage', propertyId: 'home', borrowerIds: ['nick', 'immy'], balance: 446000, asOfDate: '2025-12-31', annualInterestRate: null, endYear: null }],
  cash: [{ id: 'household-cash', kind: 'cash', name: 'Household cash', ownerIds: ['nick', 'immy'], value: 0, asOfDate: '2025-12-31' }],
  events: [],
  assumptions: {
    moneyBasis: { currency: 'GBP', priceYear: 2026, terms: 'real' },
    startYear: 2026,
    startDate: '2026-01-01',
    endYear: 2100,
    annualRealReturns: { investments: null, property: null, cash: null },
  },
}

/** Each application instance receives independent mutable configuration. */
export function loadDefaultHousehold(): Household {
  return structuredClone(defaultHousehold)
}
