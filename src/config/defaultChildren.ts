import type { ChildEvent } from '../domain/children'
export const defaultChildren: ChildEvent[] = []
export function newChildEvent(year: number): ChildEvent {
  return { id: crypto.randomUUID(), birthYear: year, enabled: true, birthCost: 0,
    costs: { ages0to2: 0, ages3to4: 0, ages5to11: 0, ages12to18: 0 }, workAdjustments: [] }
}
