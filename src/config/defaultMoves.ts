import type { PropertyMove } from '../domain/property'
export const defaultMoves: PropertyMove[] = []
export function newPropertyMove(year: number): PropertyMove {
  return { id: crypto.randomUUID(), name: 'Property move', year, enabled: false, saleValue: null,
    purchasePrice: 0, stampDuty: 0, agentFees: 0, legalFees: 0, movingCosts: 0, renovation: 0, annualRate: null, termYears: null }
}
