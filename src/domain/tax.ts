import { fraction, nonNegative } from './timeline'

/** Band ceilings are cumulative taxable income (tax) or gross NI earnings (NI). */
export interface TaxBand { upTo: number | null; rate: number }
export interface TaxRules {
  personalAllowance: number
  taperStart: number
  taperRate: number
  incomeTaxBands: TaxBand[]
  employeeNIBands: TaxBand[]
}
export function validateTaxRules(rules: TaxRules): string | undefined {
  if (!nonNegative(rules.personalAllowance) || !nonNegative(rules.taperStart) || !fraction(rules.taperRate)) return 'Invalid allowance or taper.'
  for (const bands of [rules.incomeTaxBands, rules.employeeNIBands]) {
    if (!bands.length || bands.at(-1)?.upTo !== null) return 'Tax bands need a final open-ended band.'
    let previous = 0
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i]!
      if (!fraction(band.rate) || (band.upTo === null && i !== bands.length - 1)
        || (band.upTo !== null && (!nonNegative(band.upTo) || band.upTo <= previous))) return 'Band ceilings must increase; rates must be 0–100%.'
      if (band.upTo !== null) previous = band.upTo
    }
  }
}
