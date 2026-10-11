import type { IncomeAdjustment } from './income'
import { validateIncome } from './income'
import { nonNegative } from './timeline'
export interface ChildEvent {
  id: string
  name?: string
  birthYear: number
  enabled: boolean
  birthCost: number
  costs: { ages0to2: number; ages3to4: number; ages5to11: number; ages12to18: number }
  workAdjustments: IncomeAdjustment[]
}
export function validateChildren(children: ChildEvent[]): string | undefined {
  if (new Set(children.map(c => c.id)).size !== children.length) return 'Child IDs must be unique.'
  for (const child of children) {
    if (!Number.isInteger(child.birthYear) || child.birthYear < 1900 || child.birthYear > 9999 || !nonNegative(child.birthCost)
      || !Object.values(child.costs).every(nonNegative)) return 'Child costs must be non-negative with a valid birth year.'
    if (child.workAdjustments.some(a => a.startYear < child.birthYear)) return 'Linked parental work changes must start at or after birth.'
    const error = validateIncome([], child.workAdjustments)
    if (error) return error
  }
  return validateIncome([], children.filter(c => c.enabled).flatMap(c => c.workAdjustments))
}
