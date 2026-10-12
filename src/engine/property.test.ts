import { expect, it } from 'vitest'
import { propertyMove } from './property'
import type { PropertyMove } from '../domain/property'
const move: PropertyMove = { id: 'm', name: 'Surrey', year: 2033, enabled: true, saleValue: null, purchasePrice: 900000, stampDuty: 35000, agentFees: 15000, legalFees: 5000, movingCosts: 5000, renovation: 10000, annualRate: 0.04, termYears: 25, agentFeeRate: 0, legalFeeRate: 0, renovationRate: 0 }
it('repays old loan/costs then uses equity, ISA and a new loan in order', () => {
  const result = propertyMove(850000, 446000, [88000, 1000], move)
  expect(result.equity).toBe(389000)
  expect(result.isaDraw).toBe(89000)
  expect(result.newMortgage).toBe(477000)
  expect(result.isaBalances).toEqual([0, 0])
  expect(result.costs).toBe(70000)
  const opening = 850000 - 446000 + 89000
  const closing = result.newHouseValue - result.newMortgage + result.isaBalances.reduce((a, b) => a + b, 0) + result.cashReleased
  expect(closing).toBe(opening - result.costs)
})
it('releases excess equity without touching ISA', () => {
  const result = propertyMove(1000000, 0, [100000, 50000], { ...move, purchasePrice: 500000 })
  expect(result.newMortgage).toBe(0)
  expect(result.isaDraw).toBe(0)
  expect(result.cashReleased).toBe(430000)
})
it('uses proportional ISA draws only as required and supports sequential moves', () => {
  const first = propertyMove(850000, 0, [100000, 100000], move)
  expect(first.isaDraw).toBe(120000)
  expect(first.isaBalances).toEqual([40000, 40000])
  const second = propertyMove(first.newHouseValue, first.newMortgage, first.isaBalances, { ...move, id: '2', name: 'Cotswolds', year: 2042, purchasePrice: 800000 })
  expect(second.newHouseValue).toBe(800000)
  expect(second.isaDraw).toBe(0)
})
it('requires financing terms and accounts for a sale-price override', () => {
  expect(() => propertyMove(850000, 446000, [0], { ...move, annualRate: null })).toThrow(/rate and term/)
  expect(propertyMove(850000, 446000, [0], { ...move, saleValue: 800000 }).valuationChange).toBe(-50000)
})
