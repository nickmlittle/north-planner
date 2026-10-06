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
}
export function validateMoves(moves: PropertyMove[]): string | undefined {
  const years = new Set<number>()
  for (const move of moves) {
    if (!Number.isInteger(move.year) || move.year < 1900 || move.year > 9999 || ![move.purchasePrice, move.stampDuty, move.agentFees, move.legalFees, move.movingCosts, move.renovation].every(nonNegative)
      || (move.saleValue !== null && !nonNegative(move.saleValue)) || (move.annualRate !== null && !fraction(move.annualRate)) || (move.termYears !== null && !validTerm(move.termYears))) return 'Move values must be non-negative with valid year, rate and term.'
    if (move.enabled && move.purchasePrice <= 0) return 'Enter a positive purchase price before enabling a move.'
    if (move.enabled && years.has(move.year)) return 'Only one property move is allowed per year.'
    if (move.enabled) years.add(move.year)
  }
}
