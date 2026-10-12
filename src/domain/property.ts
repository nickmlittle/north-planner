import { fraction, nonNegative } from './timeline'
import { validTerm } from './mortgage'
export interface PropertyMove {
  id: string; name: string; year: number; enabled: boolean
  saleValue: number | null
  purchasePrice: number
  stampDuty: number
  agentFees: number
  legalFees: number
  movingCosts: number
  renovation: number
  annualRate: number | null
  termYears: number | null
  agentFeeRate: number
  legalFeeRate: number
  renovationRate: number
}

export const defaultPropertyFeeRates = { agentFeeRate: 0.015, legalFeeRate: 0.005, renovationRate: 0.05 }

/** England and Northern Ireland residential SDLT for a main-home replacement. */
export function stampDutyLandTax(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  const bands: [number, number][] = [[125_000, 0], [250_000, 0.02], [925_000, 0.05], [1_500_000, 0.1], [Infinity, 0.12]]
  let lower = 0, tax = 0
  for (const [upper, rate] of bands) {
    tax += Math.max(0, Math.min(price, upper) - lower) * rate
    if (price <= upper) break
    lower = upper
  }
  return Math.round(tax * 100) / 100
}

/** Resolve percentage assumptions to the pound values consumed by the forecast engine. */
export function pricedPropertyMove(move: PropertyMove): PropertyMove {
  return { ...move, stampDuty: stampDutyLandTax(move.purchasePrice), agentFees: move.purchasePrice * move.agentFeeRate,
    legalFees: move.purchasePrice * move.legalFeeRate, renovation: move.purchasePrice * move.renovationRate }
}
export function validateMoves(moves: PropertyMove[]): string | undefined {
  const years = new Set<number>()
  for (const move of moves) {
    if (!Number.isInteger(move.year) || move.year < 1900 || move.year > 9999 || ![move.purchasePrice, move.stampDuty, move.agentFees, move.legalFees, move.movingCosts, move.renovation].every(nonNegative)
      || ![move.agentFeeRate, move.legalFeeRate, move.renovationRate].every(nonNegative)
      || (move.saleValue !== null && !nonNegative(move.saleValue)) || (move.annualRate !== null && !fraction(move.annualRate)) || (move.termYears !== null && !validTerm(move.termYears))) return 'Move values must be non-negative with valid year, rate and term.'
    if (move.enabled && move.purchasePrice <= 0) return 'Enter a positive purchase price before enabling a move.'
    if (move.enabled && years.has(move.year)) return 'Only one property move is allowed per year.'
    if (move.enabled) years.add(move.year)
  }
}
