import { formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

/** One adult's side of the plan: what they have available and what the plan asks of them. */
export type MeterPerson = { personId: string; name: string; availablePence: number; plannedPence: number }

/** "£X left", "£X over" or "Balanced" (the glossary's balance wording). */
export const balanceText = (balancePence: number) => balancePence === 0 ? 'Balanced' : `${pounds(Math.abs(balancePence))} ${balancePence < 0 ? 'over' : 'left'}`

/** The household balance, who is over (worst first), and the docked mini meter's line: whoever is over, else the balance. */
export function meterSummary(people: readonly MeterPerson[], availablePence: number, plannedPence: number) {
  const household = availablePence - plannedPence
  const split = people.length > 1
  const over = split ? people.filter(person => person.plannedPence > person.availablePence).sort((a, b) => (b.plannedPence - b.availablePence) - (a.plannedPence - a.availablePence)) : []
  const shortBy = (person: MeterPerson) => person.plannedPence - person.availablePence
  const worst = over[0]
  const mini = worst ? over.length === 1 ? `${worst.name} ${pounds(shortBy(worst))} over` : `${over.length === 2 && people.length === 2 ? 'Both' : `${over.length} people`} over · ${pounds(Math.max(0, -household))}` : balanceText(household)
  return { household, over, worst, mini, split, state: worst || household < 0 ? 'is-deficit' : household === 0 ? 'is-balanced' : 'is-surplus' }
}
