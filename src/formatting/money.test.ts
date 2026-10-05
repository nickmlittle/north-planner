import { expect, it } from 'vitest'
import { formatGBP } from './money'

it.each([[0, '£0.00'], [88000, '£88,000.00'], [1234.56, '£1,234.56']])('formats %s as GBP', (value, expected) => {
  expect(formatGBP(value as number)).toBe(expected)
})
