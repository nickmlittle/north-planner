import type { YearPeriod } from './timeline'
import { activeInYear, nonNegative, validPeriod } from './timeline'
export interface SpendingEvent extends YearPeriod { id: string; name: string; annualChange: number; enabled: boolean }
export interface SpendingPlan { baseline: number; events: SpendingEvent[] }
export function validateSpending(plan: SpendingPlan): string | undefined {
  if (!nonNegative(plan.baseline)) return 'Baseline spending must be non-negative.'
  if (new Set(plan.events.map(e => e.id)).size !== plan.events.length) return 'Spending event IDs must be unique.'
  for (const event of plan.events) {
    if (!validPeriod(event) || !nonNegative(Math.abs(event.annualChange))) return 'Spending events need valid years and finite annual changes.'
  }
  for (const year of plan.events.flatMap(e => [e.startYear, e.endYear])) {
    const spend = plan.baseline + plan.events.filter(e => e.enabled && activeInYear(e, year)).reduce((sum, e) => sum + e.annualChange, 0)
    if (spend < 0) return 'Combined lifestyle spending cannot be negative in any year.'
  }
}
