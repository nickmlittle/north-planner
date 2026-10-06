import { expect, it } from 'vitest'
import { defaultTax } from '../config/defaultTax'
import { estimateTax } from './tax'
it.each([[10000, 0], [12570, 0], [30000, 3486], [50270, 7540], [60000, 11432], [110000, 33432], [125140, 42516], [150000, 53703]])('estimates tax on %s', (gross, expected) => {
  expect(estimateTax(gross!, defaultTax).tax).toBeCloseTo(expected!, 2)
})
it('annualises category A NI and keeps individuals separate', () => {
  expect(estimateTax(60000, defaultTax).ni).toBeCloseTo(3210.6, 2)
  expect(estimateTax(30000, defaultTax).tax * 2).not.toBe(estimateTax(60000, defaultTax).tax)
})
it('accepts configuration changes without engine changes', () => {
  expect(estimateTax(30000, { ...defaultTax, personalAllowance: 30000 }).tax).toBe(0)
  expect(() => estimateTax(-1, defaultTax)).toThrow()
  expect(() => estimateTax(100, { ...defaultTax, incomeTaxBands: [{ upTo: null, rate: 2 }] })).toThrow()
})
