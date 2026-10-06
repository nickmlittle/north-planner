import type { SpendingPlan } from '../domain/spending'
import { validateSpending } from '../domain/spending'
import { activeInYear } from '../domain/timeline'
export function lifestyleSpending(plan: SpendingPlan, year: number): number {
  const error = validateSpending(plan)
  if (error) throw new Error(error)
  return plan.baseline + plan.events.filter(e => e.enabled && activeInYear(e, year)).reduce((sum, event) => sum + event.annualChange, 0)
}
export function lifestyleSurplus(disposable: number, plan: SpendingPlan, year: number): number {
  return disposable - lifestyleSpending(plan, year)
}
