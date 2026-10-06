import { nonNegative } from './timeline'
export type ISAAllowances = Record<string, number>
export function validateAllowances(value: ISAAllowances): string | undefined {
  if (!Object.values(value).every(nonNegative)) return 'ISA allowances must be finite and non-negative.'
}
export interface SweepAccount {
  personId: string
  balance: number
  allowance: number
  subscribed: number
  yearsToFire: number
  realReturn: number
}
