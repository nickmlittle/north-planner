import type { TaxRules } from '../domain/tax'

/** 2026/27 England/Wales/NI, employee category A, annualised planning estimates. */
export const defaultTax: TaxRules = {
  personalAllowance: 12570, taperStart: 100000, taperRate: 0.5,
  incomeTaxBands: [{ upTo: 37700, rate: 0.2 }, { upTo: 125140, rate: 0.4 }, { upTo: null, rate: 0.45 }],
  employeeNIBands: [{ upTo: 12570, rate: 0 }, { upTo: 50270, rate: 0.08 }, { upTo: null, rate: 0.02 }],
}
