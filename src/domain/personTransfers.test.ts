import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { resolveBudget } from './monthlyBudget'
import { personTransferPlans } from './personTransfers'
import { buildTransferInstructions } from './transferInstructions'

function baseline() {
  const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))
  if (!document) throw new Error('Baseline fixture is invalid')
  return document
}
function plans(document: BudgetDocument, month = '2026-11', withInstructions = true) {
  const ids = document.household.adults.map(person => person.id)
  const transfers = budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items)
  return personTransferPlans(transfers.accounts, withInstructions ? buildTransferInstructions(document, month) : undefined, ids)
}
const named = (document: BudgetDocument, name: string) => document.household.adults.find(person => person.name === name)!.id
const accountNamed = (document: BudgetDocument, provider: string, name: string) => document.budget.accounts.find(account => account.provider === provider && account.name === name)!.id
const potNamed = (document: BudgetDocument, accountId: string, name: string) => document.budget.pots.find(pot => pot.accountId === accountId && pot.name === name)!.id

it('gives each person what they fund, reconciling to the household total', () => {
  const document = baseline(), result = plans(document)
  const ada = result.people.find(plan => plan.personId === named(document, 'Ada'))!
  const ben = result.people.find(plan => plan.personId === named(document, 'Ben'))!
  expect(ada.fundingPence).toBe(442966)
  expect(ben.fundingPence).toBe(321221)
  expect(ada.fundingPence + ben.fundingPence).toBe(764187)
  expect(result.needsReview).toEqual([])
  // One step per funded account plus one per pot move.
  for (const plan of [ada, ben]) expect(plan.stepCount).toBe(plan.rows.filter(row => row.fundingPence > 0).length + plan.rows.reduce((sum, row) => sum + row.potMoves.length, 0))
})

it('lets the owner of a personal account make every pot move, and splits joint pot moves by contributor', () => {
  const document = baseline(), result = plans(document)
  const ada = result.people.find(plan => plan.personId === named(document, 'Ada'))!
  const ben = result.people.find(plan => plan.personId === named(document, 'Ben'))!
  const starling = accountNamed(document, 'Starling', 'Current account')
  expect(ada.rows.find(row => row.accountId === starling)).toMatchObject({ fundingPence: 69872, potMoves: [{ potId: potNamed(document, starling, 'Spending'), amountPence: 113542 }] })
  expect(ben.rows.find(row => row.accountId === starling)).toMatchObject({ fundingPence: 43670, potMoves: [] })
  const joint = accountNamed(document, 'Monzo', 'Current account')
  const bills = potNamed(document, joint, 'Bills')
  expect(ada.rows.find(row => row.accountId === joint)?.potMoves.find(move => move.potId === bills)?.amountPence).toBe(68236)
  expect(ben.rows.find(row => row.accountId === joint)?.potMoves.find(move => move.potId === bills)?.amountPence).toBe(60869)
})

it('says who else moves money on: an owner moves everything, including what others funded', () => {
  const document = baseline(), result = plans(document)
  const ada = result.people.find(plan => plan.personId === named(document, 'Ada'))!
  const ben = result.people.find(plan => plan.personId === named(document, 'Ben'))!
  const starling = accountNamed(document, 'Starling', 'Current account')
  const spending = potNamed(document, starling, 'Spending')
  expect(ada.rows.find(row => row.accountId === starling)?.potMoves[0]?.fromOthers).toEqual([{ personId: ben.personId, amountPence: 43670 }])
  expect(ben.rows.find(row => row.accountId === starling)?.movedOnBy).toEqual([{ personId: ada.personId, potIds: [spending], amountPence: 43670 }])
  // Joint contributors move their own share, so nobody moves anyone else's money there.
  const joint = accountNamed(document, 'Monzo', 'Current account')
  expect(ada.rows.find(row => row.accountId === joint)?.potMoves.every(move => move.fromOthers.length === 0)).toBe(true)
  expect(ada.rows.find(row => row.accountId === joint)?.movedOnBy).toEqual([])
})

it('withholds every step without instructions and lists those accounts for review', () => {
  const document = baseline()
  const withoutInstructions = plans(document, '2026-11', false)
  expect(withoutInstructions.people.every(plan => plan.rows.length === 0 && plan.stepCount === 0 && plan.fundingPence === 0)).toBe(true)
  expect(withoutInstructions.needsReview.every(account => account.reason === 'unavailable' && !account.notCalculated)).toBe(true)
  // The known amounts stay visible for comparison.
  expect(withoutInstructions.needsReview.flatMap(account => account.byPerson).reduce((sum, row) => sum + row.amountPence, 0)).toBe(764187)
})

it('moves accounts that cannot be calculated out of the steps and marks them not calculated', () => {
  const document = baseline()
  document.budget.incomeSources = []
  const noIncome = plans(document)
  expect(noIncome.needsReview.some(account => account.notCalculated && account.reason === 'unallocated')).toBe(true)
  for (const plan of noIncome.people) expect(plan.rows.some(row => noIncome.needsReview.some(account => account.accountId === row.accountId))).toBe(false)
})
