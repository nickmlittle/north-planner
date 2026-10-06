import { expect, it } from 'vitest'
import { childEffects } from './children'
import { grossIncome } from './income'
import type { ChildEvent } from '../domain/children'
const child: ChildEvent = { id: '1', birthYear: 2026, enabled: true, birthCost: 500, costs: { ages0to2: 10000, ages3to4: 8000, ages5to11: 5000, ages12to18: 6000 }, workAdjustments: [{ id: 'leave', personId: 'nick', startYear: 2026, endYear: 2027, workingFraction: 0.6, annualGrossOverride: null }] }
it('covers every age-band boundary and one-off cost', () => {
  expect([-1, 0, 2, 3, 4, 5, 11, 12, 18, 19].map(age => childEffects([child], 2026 + age).totalCost)).toEqual([0, 10500, 10000, 8000, 8000, 5000, 5000, 6000, 6000, 0])
})
it('stacks per-child costs and removes all disabled costs and work links', () => {
  expect(childEffects([child, { ...child, id: '2', workAdjustments: [] }], 2026).totalCost).toBe(21000)
  expect(childEffects([{ ...child, enabled: false }], 2026)).toMatchObject({ totalCost: 0, adjustments: [] })
})
it('applies a linked work event and rejects overlapping incompatible parental changes', () => {
  const p = { id: 'p', personId: 'nick', kind: 'paye' as const, startYear: 2026, endYear: 2030, annualSalary: 100000, dayRate: 0, billableDays: 0, workingFraction: 1, annualGrossOverride: null }
  expect(grossIncome([p], 'nick', 2026, childEffects([child], 2026).adjustments)).toBe(60000)
  expect(grossIncome([p], 'nick', 2026, childEffects([{ ...child, enabled: false }], 2026).adjustments)).toBe(100000)
  expect(() => childEffects([child, { ...child, id: '2' }], 2026)).toThrow(/Overlapping/)
})
