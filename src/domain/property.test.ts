import { expect, it } from 'vitest'
import { newPropertyMove } from '../config/defaultMoves'
import { pricedPropertyMove, stampDutyLandTax } from './property'

it('calculates England and Northern Ireland residential SDLT by progressive band', () => {
  expect(stampDutyLandTax(125_000)).toBe(0)
  expect(stampDutyLandTax(250_000)).toBe(2_500)
  expect(stampDutyLandTax(925_000)).toBe(36_250)
  expect(stampDutyLandTax(1_500_000)).toBe(93_750)
  expect(stampDutyLandTax(1_600_000)).toBe(105_750)
  expect(stampDutyLandTax(-10)).toBe(0)
})

it('scales move costs from purchase price and fee percentage assumptions', () => {
  const move = { ...newPropertyMove(2030), purchasePrice: 400_000 }
  expect(pricedPropertyMove(move)).toMatchObject({ stampDuty: 10_000, agentFees: 6_000, legalFees: 2_000, renovation: 20_000 })
})
