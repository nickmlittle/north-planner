import { fraction } from './timeline'
export interface PensionContributions {
  employeeRate: number
  employerRate: number
  treatment: 'salary-sacrifice' | 'net-pay' | 'relief-at-source'
  continueAfterFire: boolean
}
export function validateContributions(value: PensionContributions): string | undefined {
  if (!fraction(value.employeeRate) || !fraction(value.employerRate)) return 'Pension contribution rates must be 0–100%.'
  if (!['salary-sacrifice', 'net-pay', 'relief-at-source'].includes(value.treatment) || typeof value.continueAfterFire !== 'boolean') return 'Invalid pension treatment.'
}
