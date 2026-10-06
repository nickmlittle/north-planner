import type { ChildEvent } from '../domain/children'
import { validateChildren } from '../domain/children'
export function childEffects(children: ChildEvent[], year: number) {
  const error = validateChildren(children)
  if (error) throw new Error(error)
  let annualCost = 0, birthCost = 0
  const enabled = children.filter(c => c.enabled)
  for (const child of enabled) {
    const age = year - child.birthYear
    if (age < 0 || age > 18) continue
    if (age === 0) birthCost += child.birthCost
    annualCost += age <= 2 ? child.costs.ages0to2 : age <= 4 ? child.costs.ages3to4 : age <= 11 ? child.costs.ages5to11 : child.costs.ages12to18
  }
  return { annualCost, birthCost, totalCost: annualCost + birthCost, adjustments: enabled.flatMap(c => c.workAdjustments) }
}
