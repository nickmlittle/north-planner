import { nonNegative } from './timeline'
import type { SpendingEvent } from './spending'

export interface PurchaseEvent {
  id: string
  name: string
  preset: 'car' | 'rental-costs' | 'other'
  enabled: boolean
  year: number
  upfrontCost: number
  recurring: { annualCost: number; startYear: number; endYear: number } | null
}

export function validatePurchases(events: PurchaseEvent[]): string | undefined {
  const year = (n: number) => Number.isInteger(n) && n >= 1900 && n <= 9999
  const cost = nonNegative
  if (new Set(events.map(e => e.id)).size !== events.length) return 'Purchase IDs must be unique.'
  for (const e of events) {
    if (!e.id || !e.name.trim() || !['car', 'rental-costs', 'other'].includes(e.preset) || typeof e.enabled !== 'boolean'
      || !year(e.year) || !cost(e.upfrontCost)) return 'Purchases need a name, valid year and non-negative cost.'
    if (e.recurring && (!cost(e.recurring.annualCost) || !year(e.recurring.startYear) || !year(e.recurring.endYear)
      || e.recurring.startYear < e.year || e.recurring.endYear <= e.recurring.startYear)) return 'Running costs must start at or after the purchase and have a valid final year.'
  }
}

/** Generated only at the forecast boundary; purchase costs never become saved spending entries. */
export function purchaseSpending(events: PurchaseEvent[]): SpendingEvent[] {
  return events.flatMap(e => [
    { id: `purchase:${e.id}:upfront`, name: e.name, enabled: e.enabled, startYear: e.year, endYear: e.year + 1, annualChange: e.upfrontCost },
    ...(e.recurring ? [{ id: `purchase:${e.id}:running`, name: `${e.name} running costs`, enabled: e.enabled,
      startYear: e.recurring.startYear, endYear: e.recurring.endYear, annualChange: e.recurring.annualCost }] : []),
  ])
}
