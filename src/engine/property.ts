import type { PropertyMove } from '../domain/property'
import { validateMoves } from '../domain/property'
import { nonNegative } from '../domain/timeline'

export function propertyMove(houseValue: number, mortgage: number, isaBalances: number[], move: PropertyMove) {
  const error = validateMoves([move])
  if (error) throw new Error(error)
  if (!move.enabled) throw new Error('Cannot execute a disabled move.')
  if (![houseValue, mortgage, ...isaBalances].every(nonNegative)) throw new Error('Invalid starting property or ISA balances.')
  const sale = move.saleValue ?? houseValue
  const sellingCosts = move.agentFees
  const purchaseCosts = move.stampDuty + move.legalFees + move.movingCosts + move.renovation
  const equity = sale - mortgage - sellingCosts
  const required = Math.max(0, move.purchasePrice + purchaseCosts - equity)
  const totalISA = isaBalances.reduce((a, b) => a + b, 0)
  const isaDraw = Math.min(required, totalISA)
  const withdrawals = isaBalances.map(balance => totalISA === 0 ? 0 : isaDraw * balance / totalISA)
  const newMortgage = required - isaDraw
  if (newMortgage > 0 && (move.annualRate === null || move.termYears === null)) throw new Error('Enter new mortgage rate and term for a financed move.')
  const cashReleased = Math.max(0, equity - move.purchasePrice - purchaseCosts)
  return { sale, equity, costs: sellingCosts + purchaseCosts, isaDraw, withdrawals, isaBalances: isaBalances.map((balance, i) => Math.max(0, balance - withdrawals[i]!)),
    newHouseValue: move.purchasePrice, newMortgage, cashReleased, valuationChange: sale - houseValue }
}
