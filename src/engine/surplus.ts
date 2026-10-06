import type { SweepAccount } from '../domain/surplus'
import { nonNegative } from '../domain/timeline'

export function netHouseholdSurplus(disposable: number, lifestyle: number, childCosts: number, mortgagePayment: number): number {
  if (![disposable, lifestyle, childCosts, mortgagePayment].every(Number.isFinite)) throw new Error('Invalid annual cash flows.')
  return disposable - lifestyle - childCosts - mortgagePayment
}
/** Water-fill towards equal projected FIRE values, respecting each person's remaining allowance. */
export function sweepISA(availableCash: number, accounts: SweepAccount[]) {
  if (!nonNegative(availableCash) || new Set(accounts.map(a => a.personId)).size !== accounts.length) throw new Error('Invalid cash or duplicate ISA owners.')
  for (const a of accounts) {
    if (![a.balance, a.allowance, a.subscribed].every(nonNegative) || a.subscribed > a.allowance || !Number.isInteger(a.yearsToFire) || a.yearsToFire < 0 || a.yearsToFire > 120
      || !Number.isFinite(a.realReturn) || a.realReturn <= -1 || a.realReturn > 1) throw new Error('Invalid ISA allocation assumptions.')
  }
  const weights = accounts.map(a => (1 + a.realReturn) ** a.yearsToFire)
  const caps = accounts.map(a => a.allowance - a.subscribed)
  const budget = Math.min(availableCash, caps.reduce((a, b) => a + b, 0))
  let low = 0, high = Math.max(0, ...accounts.map((a, i) => (a.balance + caps[i]!) * weights[i]!))
  for (let i = 0; i < 100; i++) {
    const target = (low + high) / 2
    const needed = accounts.reduce((sum, a, j) => sum + Math.min(caps[j]!, Math.max(0, target / weights[j]! - a.balance)), 0)
    if (needed < budget) low = target
    else high = target
  }
  let remaining = availableCash
  const contributions = accounts.map((a, i) => {
    const value = Math.min(remaining, caps[i]!, Math.max(0, high / weights[i]! - a.balance))
    remaining = Math.max(0, remaining - value)
    return value
  })
  return { contributions, balances: accounts.map((a, i) => a.balance + contributions[i]!), cash: remaining }
}
