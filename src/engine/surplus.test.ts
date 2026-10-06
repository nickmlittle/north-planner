import { expect, it } from 'vitest'
import { sweepISA, netHouseholdSurplus } from './surplus'
const a = { personId: 'nick', balance: 88000, allowance: 20000, subscribed: 0, yearsToFire: 18, realReturn: 0.04 }
const b = { ...a, personId: 'immy', balance: 1000, yearsToFire: 19 }
it('prioritises the smaller projected ISA and respects allowance caps', () => {
  expect(sweepISA(10000, [a, b]).contributions[1]).toBeCloseTo(10000)
  const result = sweepISA(50000, [a, b])
  expect(result.contributions).toEqual([20000, 20000])
  expect(result.cash).toBe(10000)
})
it('balances projected FIRE values rather than just current balances', () => {
  const accounts = [{ ...a, balance: 0, yearsToFire: 20 }, { ...b, balance: 0, yearsToFire: 10 }]
  const result = sweepISA(20000, accounts)
  expect(result.balances[0]! * 1.04 ** 20).toBeCloseTo(result.balances[1]! * 1.04 ** 10, 5)
  expect(result.cash + result.contributions.reduce((x, y) => x + y, 0)).toBeCloseTo(20000)
})
it('rolls excess cash into subscriptions in the next year and accounts for prior usage', () => {
  const first = sweepISA(50000, [a, b])
  const second = sweepISA(first.cash, [{ ...a, balance: first.balances[0]! }, { ...b, balance: first.balances[1]! }])
  expect(second.contributions.reduce((x, y) => x + y, 0)).toBeCloseTo(10000)
  expect(sweepISA(10000, [{ ...a, subscribed: 19000 }]).contributions).toEqual([1000])
})
it('supports no allowance/no accounts and rejects corrupt input', () => {
  expect(sweepISA(10000, [{ ...a, allowance: 0 }]).cash).toBe(10000)
  expect(sweepISA(10000, []).cash).toBe(10000)
  expect(() => sweepISA(-1, [a])).toThrow()
  expect(() => sweepISA(100, [{ ...a, realReturn: NaN }])).toThrow()
  expect(netHouseholdSurplus(50000, 30000, 5000, 10000)).toBe(5000)
})
