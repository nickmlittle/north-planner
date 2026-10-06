import { expect, it } from 'vitest'
import { lifestyleSpending, lifestyleSurplus } from './spending'
const plan = { baseline: 30000, events: [{ id: '1', name: 'one', startYear: 2027, endYear: 2030, annualChange: 10000, enabled: true }, { id: '2', name: 'two', startYear: 2028, endYear: 2031, annualChange: 5000, enabled: true }] }
it('stacks events and respects start/end boundaries', () => {
  expect([2026, 2027, 2028, 2030, 2031].map(y => lifestyleSpending(plan, y))).toEqual([30000, 40000, 45000, 35000, 30000])
  expect(lifestyleSurplus(50000, plan, 2028)).toBe(5000)
})
it('supports reductions/disabling without resetting other input state', () => {
  expect(lifestyleSpending({ ...plan, events: [{ ...plan.events[0]!, annualChange: -5000 }] }, 2028)).toBe(25000)
  expect(lifestyleSpending({ ...plan, events: plan.events.map(e => ({ ...e, enabled: false })) }, 2028)).toBe(30000)
})
it('rejects invalid spending rather than creating negative lifestyle costs', () => {
  expect(() => lifestyleSpending({ ...plan, baseline: -1 }, 2026)).toThrow()
  expect(() => lifestyleSpending({ ...plan, events: [{ ...plan.events[0]!, annualChange: -40000 }] }, 2026)).toThrow()
})
