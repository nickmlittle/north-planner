import { expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument } from './budgetDocument'
import type { PersonTransferPlan } from './personTransfers'
import { fundStepKey, moveStepKey, personProgress, planSteps, setStepTick, stepStatus } from './transferTicks'

const plan: PersonTransferPlan = {
  personId: 'nick', fundingPence: 100000, fundCount: 1, moveCount: 2, stepCount: 3,
  rows: [{ accountId: 'joint', fundingPence: 100000, alreadyThere: false, fromAccountId: null, movedOnBy: [], potMoves: [{ potId: 'bills', amountPence: 30000, fromOthers: [] }, { potId: 'food', amountPence: 20000, fromOthers: [] }] }],
}
const at = new Date('2026-11-10T09:00:00Z')

it('lists a plan’s steps in order: fund the account, then each pot move', () => {
  expect(planSteps(plan).map(step => [step.key, step.amountPence])).toEqual([['nick:fund:joint', 100000], ['nick:move:bills', 30000], ['nick:move:food', 20000]])
})

it('leaves out funding already where the pay lands, keeping every other step’s key, and ignores an old tick for it', () => {
  const landed: PersonTransferPlan = { ...plan, fundCount: 0, stepCount: 2, rows: [{ ...plan.rows[0]!, alreadyThere: true, fromAccountId: 'joint' }] }
  expect(planSteps(landed).map(step => step.key)).toEqual(['nick:move:bills', 'nick:move:food'])
  const ticks = { 'nick:fund:joint': { amountPence: 100000, at: 'x' }, 'nick:move:bills': { amountPence: 30000, at: 'x' } }
  expect(personProgress(landed, ticks)).toMatchObject({ total: 2, done: 1 })
})

it('ticks a step at its amount for one month, and unticks it', () => {
  const ticked = setStepTick(newBudgetDocument(), '2026-11', fundStepKey('nick', 'joint'), 100000, at)
  expect(ticked.ticks).toEqual({ '2026-11': { 'nick:fund:joint': { amountPence: 100000, at: '2026-11-10T09:00:00.000Z' } } })
  expect(stepStatus(ticked.ticks?.['2026-11'], 'nick:fund:joint', 100000)).toEqual({ state: 'done', tickedPence: 100000, differencePence: 0 })
  expect(stepStatus(ticked.ticks?.['2026-12'], 'nick:fund:joint', 100000).state).toBe('todo')
  const unticked = setStepTick(ticked, '2026-11', 'nick:fund:joint', null)
  expect(unticked.ticks).toBeUndefined()
})

it('reads a tick at another amount as changed, with the difference left to send', () => {
  const ticks = { 'nick:move:bills': { amountPence: 30000, at: at.toISOString() } }
  expect(stepStatus(ticks, 'nick:move:bills', 35000)).toEqual({ state: 'changed', tickedPence: 30000, differencePence: 5000 })
  expect(stepStatus(ticks, 'nick:move:bills', 25000).differencePence).toBe(-5000)
})

it('counts progress, with changed steps not done', () => {
  let document = newBudgetDocument()
  expect(personProgress(plan, document.ticks?.['2026-11'])).toEqual({ total: 3, done: 0, changed: 0, differencePence: 0, complete: false })
  document = setStepTick(document, '2026-11', fundStepKey('nick', 'joint'), 100000, at)
  document = setStepTick(document, '2026-11', moveStepKey('nick', 'bills'), 25000, at)
  expect(personProgress(plan, document.ticks?.['2026-11'])).toEqual({ total: 3, done: 1, changed: 1, differencePence: 5000, complete: false })
  document = setStepTick(document, '2026-11', moveStepKey('nick', 'bills'), 30000, at)
  document = setStepTick(document, '2026-11', moveStepKey('nick', 'food'), 20000, at)
  expect(personProgress(plan, document.ticks?.['2026-11']).complete).toBe(true)
})

it('keeps ticks through a save and rejects malformed ones', () => {
  const document = setStepTick(newBudgetDocument(), '2026-11', 'nick:fund:joint', 100000, at)
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))?.ticks).toEqual(document.ticks)
  expect(decodeBudgetDocument({ ...document, ticks: { '2026-13': {} } })).toBeNull()
  expect(decodeBudgetDocument({ ...document, ticks: { '2026-11': { 'nick:fund:joint': { amountPence: -1, at: '' } } } })).toBeNull()
  expect(decodeBudgetDocument({ ...document, ticks: { '2026-11': { 'nonsense': { amountPence: 1, at: '' } } } })).toBeNull()
})
