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
  expect(result.notCalculated).toEqual([])
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

it('keeps funding rows without instructions and reports uncalculated accounts separately', () => {
  const document = baseline()
  const withoutInstructions = plans(document, '2026-11', false)
  expect(withoutInstructions.people.every(plan => plan.rows.every(row => row.potMoves.length === 0))).toBe(true)
  expect(withoutInstructions.people.reduce((sum, plan) => sum + plan.fundingPence, 0)).toBe(764187)
  document.budget.incomeSources = []
  const noIncome = plans(document)
  expect(noIncome.notCalculated.length).toBeGreaterThan(0)
  for (const plan of noIncome.people) expect(plan.rows.some(row => noIncome.notCalculated.includes(row.accountId))).toBe(false)
})
