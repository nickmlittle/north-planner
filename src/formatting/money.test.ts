import { expect, it } from 'vitest'
import { balanceLabel, formatGBP } from './money'

it.each([[0, '£0.00'], [88000, '£88,000.00'], [1234.56, '£1,234.56']])('formats %s as GBP', (value, expected) => {
  expect(formatGBP(value as number)).toBe(expected)
})

it.each([[-114187, '£1,141.87 over'], [1000, '£10.00 left'], [0, 'Balanced']])('labels a balance of %s pence', (pence, expected) => {
  expect(balanceLabel(pence as number)).toBe(expected)
})
