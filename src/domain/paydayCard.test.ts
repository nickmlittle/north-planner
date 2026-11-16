import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { resolveBudget } from './monthlyBudget'
import { landedText, paydayArrivals, paydayWent } from './paydayCard'

/** Audit 4's household: Ada £4,200 and Ben £3,500, pay landing in each person's own account. */
function audit4(): BudgetDocument {
  const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))!
  for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000; source.landsInAccountId = source.personId }
  return document
}
const transfersFor = (document: BudgetDocument, month: string) => budgetTransfers(document.budget, document.household.adults.map(person => person.id), month, resolveBudget(document.budget, month).items)
const name = (id: string) => id === 'ada' ? 'Ada' : 'Ben'

it('says when each person’s pay arrives and whether it has landed', () => {
  const document = audit4(), transfers = transfersFor(document, '2026-12')
  const before = paydayArrivals(document, transfers, '2026-12', '2026-11-20')
  expect(before.map(row => [row.personId, row.pence, row.landed])).toEqual([['ada', 420000, false], ['ben', 350000, false]])
  const arrived = paydayArrivals(document, transfers, '2026-12', '2026-11-27')
  expect(arrived.map(row => [row.personId, row.landed])).toEqual([['ada', true], ['ben', false]])
  expect(arrived[0]!.date <= '2026-11-27' && arrived[1]!.date > '2026-11-27').toBe(true)
})

it('has no row for someone without a salary date or pay', () => {
  const document = audit4()
  document.budget.incomeSources = document.budget.incomeSources.filter(source => source.personId === 'ada')
  expect(paydayArrivals(document, transfersFor(document, '2026-12'), '2026-12', '2026-11-30').map(row => row.personId)).toEqual(['ada'])
})

it('words what has landed: the household total, then each person, landed or lands', () => {
  const document = audit4(), transfers = transfersFor(document, '2026-12')
  const arrivals = paydayArrivals(document, transfers, '2026-12', '2026-11-27')
  expect(landedText(arrivals, transfers.availablePence, name)).toBe(`£7,700.00 in all · Ada’s £4,200.00 landed ${dayOf(arrivals[0]!.date)} · Ben’s £3,500.00 lands ${dayOf(arrivals[1]!.date)}`)
  // One person: no names and no total to add up.
  expect(landedText(arrivals.slice(0, 1), 420000, name)).toBe(`£4,200.00 landed ${dayOf(arrivals[0]!.date)}`)
  expect(landedText([], 0, name)).toBe('')
})
const dayOf = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')

it('adds up where the money went: each account with its pots, and what is left unassigned', () => {
  const document = audit4(), transfers = transfersFor(document, '2026-12')
  const went = paydayWent(transfers.accounts, transfers)
  expect(went.totalPence).toBe(770000)
  expect(went.rows.reduce((sum, row) => sum + row.amountPence, 0) + went.unassignedPence).toBe(went.totalPence)
  for (const row of went.rows) expect(row.parts.reduce((sum, part) => sum + part.amountPence, 0)).toBe(row.amountPence)
  expect(went.unassignedPence).toBe(Math.max(transfers.availablePence - transfers.plannedPence, 0))
})
