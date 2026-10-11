import type { AppDocument } from './setup'
import { annual } from './setup'
import type { PropertyMove } from './property'
import { validateMoves } from './property'
import type { ChildEvent } from './children'
import { validateChildren } from './children'
import type { SpendingEvent } from './spending'
import { validateSpending } from './spending'
import type { PurchaseEvent } from './purchases'
import { purchaseSpending, validatePurchases } from './purchases'

export type PlanEvent = { kind: 'move'; value: PropertyMove } | { kind: 'child'; value: ChildEvent }
  | { kind: 'purchase'; value: PurchaseEvent } | { kind: 'spending'; value: SpendingEvent }
export type EventKind = PlanEvent['kind']
export const eventName = (e: PlanEvent) => e.kind === 'child' ? e.value.name || 'Future child' : e.value.name
export const eventYear = (e: PlanEvent) => e.kind === 'child' ? e.value.birthYear : e.kind === 'spending' ? e.value.startYear : e.value.year
export const eventKey = (e: PlanEvent) => `${e.kind}:${e.value.id}`
export function planEvents(doc: AppDocument): PlanEvent[] {
  return [...doc.moves.map(value => ({ kind: 'move' as const, value })), ...doc.childEvents.map(value => ({ kind: 'child' as const, value })),
    ...doc.purchaseEvents.map(value => ({ kind: 'purchase' as const, value })), ...doc.spendingEvents.map(value => ({ kind: 'spending' as const, value }))]
    .sort((a, b) => eventYear(a) - eventYear(b) || eventName(a).localeCompare(eventName(b)))
}
export function removePlanEvent(doc: AppDocument, event: PlanEvent): AppDocument {
  const id = event.value.id
  switch (event.kind) {
    case 'move': return { ...doc, moves: doc.moves.filter(e => e.id !== id) }
    case 'child': return { ...doc, childEvents: doc.childEvents.filter(e => e.id !== id) }
    case 'purchase': return { ...doc, purchaseEvents: doc.purchaseEvents.filter(e => e.id !== id) }
    case 'spending': return { ...doc, spendingEvents: doc.spendingEvents.filter(e => e.id !== id) }
  }
}
export function putPlanEvent(doc: AppDocument, event: PlanEvent): AppDocument {
  const next = removePlanEvent(doc, event)
  switch (event.kind) {
    case 'move': return { ...next, moves: [...next.moves, event.value] }
    case 'child': return { ...next, childEvents: [...next.childEvents, event.value] }
    case 'purchase': return { ...next, purchaseEvents: [...next.purchaseEvents, event.value] }
    case 'spending': return { ...next, spendingEvents: [...next.spendingEvents, event.value] }
  }
}
export function validatePlanEvents(doc: AppDocument): string | undefined {
  if (doc.moves.some(m => m.enabled) && doc.snapshot.housing !== 'own') return 'House moves require an existing home to sell.'
  if (doc.moves.some(m => m.enabled && doc.mortgageExtras.refinances.some(r => r.enabled && r.year === m.year))) return 'Choose either a move or a remortgage in the same year.'
  if (doc.childEvents.some(c => c.workAdjustments.some(a => !doc.snapshot.people.some(p => p.role !== 'child' && p.id === a.personId)))) return 'Parental work changes must reference a current adult.'
  return validateMoves(doc.moves) || validateChildren(doc.childEvents) || validatePurchases(doc.purchaseEvents)
    || validateSpending({ baseline: annual(doc.snapshot.spending, doc.snapshot.spendingFrequency) ?? 0,
      events: [...doc.spendingEvents, ...purchaseSpending(doc.purchaseEvents)] })
}
