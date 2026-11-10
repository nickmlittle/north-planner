import { formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

/** One adult's side of the plan: what they have available and what the plan asks of them. */
export type MeterPerson = { personId: string; name: string; availablePence: number; plannedPence: number }

/** "£X left", "£X over" or "Balanced" (the glossary's balance wording). */
export const balanceText = (balancePence: number) => balancePence === 0 ? 'Balanced' : `${pounds(Math.abs(balancePence))} ${balancePence < 0 ? 'over' : 'left'}`

/**
 * The worst figure leads: whoever is over, even when the household still has money left.
 * With nobody over, the household balance. People who aren't over, but whose money left covers the one who is, are named in the hint.
 */
export function meterSummary(people: readonly MeterPerson[], availablePence: number, plannedPence: number) {
  const household = availablePence - plannedPence
  const split = people.length > 1
  const over = split ? people.filter(person => person.plannedPence > person.availablePence).sort((a, b) => (b.plannedPence - b.availablePence) - (a.plannedPence - a.availablePence)) : []
  const shortBy = (person: MeterPerson) => person.plannedPence - person.availablePence
  const worst = over[0]
  const headline = worst
    ? over.length === 1 ? `${worst.name} is ${pounds(shortBy(worst))} over` : over.length === 2 && people.length === 2 ? 'You’re both over' : `${over.length} people are over`
    : balanceText(household)
  const coverer = worst && over.length === 1 ? people.find(person => person !== worst && person.availablePence - person.plannedPence >= shortBy(worst)) : undefined
  const hint = !split ? null
    : coverer && worst ? `${coverer.name}’s ${pounds(coverer.availablePence - coverer.plannedPence)} left covers ${worst.name}’s ${pounds(shortBy(worst))}.`
    : household < 0 ? `The household plan is ${pounds(-household)} more than what’s available.`
    : over.length ? null
    : 'Everyone’s planned spending fits.'
  const mini = worst ? over.length === 1 ? `${worst.name} ${pounds(shortBy(worst))} over` : `${over.length === 2 && people.length === 2 ? 'Both' : `${over.length} people`} over · ${pounds(Math.max(0, -household))}` : balanceText(household)
  return { household, over, worst, headline, hint, mini, split, state: worst || household < 0 ? 'is-deficit' : household === 0 ? 'is-balanced' : 'is-surplus' }
}
