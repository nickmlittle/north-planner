import type { BudgetDocument } from './budgetDocument'
import { HOUSEHOLD, isFundStep, sendPence, type HouseholdRow, type PersonTransferPlan, type PersonTransferPlans } from './personTransfers'

/**
 * Payday tick-off (transfer-calculation-rules, "Ticking off steps"). A tick belongs to one month and one step,
 * and records the amount it was ticked at, so a later change to the plan shows as a difference rather than silently
 * reading as done. Ticks never change the plan, and the app doesn't verify them against a bank.
 */
export type StepTick = { amountPence: number; at: string }
/** Month (YYYY-MM) → step key → tick. */
export type TransferTicks = Record<string, Record<string, StepTick>>

/**
 * A step is one person's (funding an account, or a pot move they make) or the household's: a joint pot move either
 * of you makes once (D6). A household key ends in `:move:<potId>` like a person's, so anything reading moves into a
 * pot by key reads both.
 */
export const fundStepKey = (personId: string, accountId: string) => `${personId}:fund:${accountId}`
export const moveStepKey = (personId: string, potId: string) => `${personId}:move:${potId}`
export const householdMoveKey = (potId: string) => moveStepKey(HOUSEHOLD, potId)

export type StepState = 'todo' | 'done' | 'changed'
export type StepStatus = { state: StepState; tickedPence?: number; differencePence: number }

/** Done: ticked at today's amount. Changed: ticked at a different amount; the difference is what's left to send (negative when less is needed). */
export function stepStatus(ticks: Readonly<Record<string, StepTick>> | undefined, key: string, amountPence: number): StepStatus {
  const tick = ticks?.[key]
  if (!tick) return { state: 'todo', differencePence: 0 }
  if (tick.amountPence === amountPence) return { state: 'done', tickedPence: tick.amountPence, differencePence: 0 }
  return { state: 'changed', tickedPence: tick.amountPence, differencePence: amountPence - tick.amountPence }
}

/** Tick a step at its current amount (also how a changed step is accepted), or untick it. */
export function setStepTick(document: BudgetDocument, month: string, key: string, amountPence: number | null, now = new Date()): BudgetDocument {
  const monthTicks = { ...document.ticks?.[month] }
  if (amountPence === null) delete monthTicks[key]
  else monthTicks[key] = { amountPence, at: now.toISOString() }
  const ticks = { ...document.ticks }
  if (Object.keys(monthTicks).length) ticks[month] = monthTicks
  else delete ticks[month]
  const next: BudgetDocument = { ...document, ticks }
  if (!Object.keys(ticks).length) delete next.ticks
  return next
}

/** Put a step's tick back as it was (undo): the saved tick, or none. */
export function restoreStepTick(document: BudgetDocument, month: string, key: string, tick: StepTick | undefined): BudgetDocument {
  return setStepTick(document, month, key, tick ? tick.amountPence : null, tick ? new Date(tick.at) : undefined)
}

export type PaydayStep = { key: string; kind: 'fund' | 'move'; accountId: string; potId?: string; amountPence: number }

/** Every step in a person's payday plan, in order, with its key and amount. A netted transfer is its net amount (D7). */
export function planSteps(plan: PersonTransferPlan): PaydayStep[] {
  return plan.rows.flatMap(row => [
    // Funding already where the pay lands isn't a step (a tick left from before is ignored, not deleted), nor is a
    // transfer netted down to nothing.
    ...isFundStep(row) ? [{ key: fundStepKey(plan.personId, row.accountId), kind: 'fund' as const, accountId: row.accountId, amountPence: sendPence(row) }] : [],
    ...row.potMoves.map(move => ({ key: moveStepKey(plan.personId, move.potId), kind: 'move' as const, accountId: row.accountId, potId: move.potId, amountPence: move.amountPence })),
  ])
}

/** The household's joint pot moves (D6), in order. */
export function householdSteps(rows: readonly HouseholdRow[]): PaydayStep[] {
  return rows.flatMap(row => row.moves.map(move => ({ key: householdMoveKey(move.potId), kind: 'move' as const, accountId: row.accountId, potId: move.potId, amountPence: move.amountPence })))
}

/**
 * What a step waits for (P6): the transfers that bring someone else's money into the account it moves out of.
 * A household move waits for every transfer into its joint account; a person's move waits only when it includes
 * someone else's money, for their transfer into that account (after netting, so a transfer netted away is nothing to
 * wait for). Transfers wait for nothing. Keys, in plan order.
 */
export function stepWaitsFor(plans: PersonTransferPlans, step: PaydayStep & { personId: string }): string[] {
  if (step.kind !== 'move') return []
  const from = step.personId === HOUSEHOLD ? null
    : new Set(plans.people.find(plan => plan.personId === step.personId)?.rows.find(row => row.accountId === step.accountId)?.potMoves.find(move => move.potId === step.potId)?.fromOthers.map(row => row.personId) ?? [])
  if (from && !from.size) return []
  return plans.people.filter(plan => plan.personId !== step.personId && (!from || from.has(plan.personId)))
    .flatMap(plan => planSteps(plan).filter(other => other.kind === 'fund' && other.accountId === step.accountId).map(other => other.key))
}

/** Every payday step, the people's then the household's, with whose it is and what it waits for. */
export function paydaySteps(plans: PersonTransferPlans) {
  const steps = [
    ...plans.people.flatMap(plan => planSteps(plan).map(step => ({ ...step, personId: plan.personId }))),
    ...householdSteps(plans.household).map(step => ({ ...step, personId: HOUSEHOLD })),
  ]
  return steps.map(step => ({ ...step, waitsFor: stepWaitsFor(plans, step) }))
}

/** The keys a step is still waiting on: any it waits for that nobody has ticked yet (a tick at another amount counts). */
export const waitingOn = (step: { waitsFor: readonly string[] }, ticks: Readonly<Record<string, StepTick>> | undefined) => step.waitsFor.filter(key => !ticks?.[key])

type OrderedStep = PaydayStep & { personId: string; waitsFor: readonly string[] }

/**
 * D9: the step to copy next: the first of `steps`, in order, that still needs doing and isn't waiting for anyone's
 * money. `after` leaves out the step just ticked (its tick may not have landed yet); `personId` keeps to one person's
 * run, because you tick in one banking app at a time.
 */
export function nextStep<Step extends OrderedStep>(steps: readonly Step[], ticks: Readonly<Record<string, StepTick>> | undefined, { after, personId }: { after?: string; personId?: string } = {}): Step | undefined {
  return steps.find(step => step.key !== after && (!personId || step.personId === personId) && stepStatus(ticks, step.key, step.amountPence).state !== 'done' && !waitingOn(step, ticks).length)
}

/** What a step is still waiting for: the unticked steps it waits on, with whose they are and their amounts (P6). */
export function waitingSteps<Step extends OrderedStep>(steps: readonly Step[], step: Pick<Step, 'waitsFor'>, ticks: Readonly<Record<string, StepTick>> | undefined): Step[] {
  return waitingOn(step, ticks).flatMap(key => steps.find(row => row.key === key) ?? [])
}

export type PersonProgress = { total: number; done: number; changed: number; differencePence: number; complete: boolean }

function stepsProgress(steps: readonly PaydayStep[], ticks: Readonly<Record<string, StepTick>> | undefined): PersonProgress {
  const statuses = steps.map(step => stepStatus(ticks, step.key, step.amountPence))
  const done = statuses.filter(status => status.state === 'done').length
  const changed = statuses.filter(status => status.state === 'changed')
  return { total: statuses.length, done, changed: changed.length, differencePence: changed.reduce((sum, status) => sum + status.differencePence, 0), complete: statuses.length > 0 && done === statuses.length }
}

/** How far through their steps a person is. Changed steps don't count as done. */
export const personProgress = (plan: PersonTransferPlan | undefined, ticks: Readonly<Record<string, StepTick>> | undefined) => stepsProgress(plan ? planSteps(plan) : [], ticks)

/** How far through the household's joint pot moves the month is (D6). */
export const householdProgress = (plans: PersonTransferPlans, ticks: Readonly<Record<string, StepTick>> | undefined) => stepsProgress(householdSteps(plans.household), ticks)

export function validTransferTicks(value: unknown): value is TransferTicks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([month, steps]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && !!steps && typeof steps === 'object' && !Array.isArray(steps)
    && Object.entries(steps as Record<string, unknown>).every(([key, tick]) => {
      const row = tick as StepTick
      return /^[^:]+:(fund|move):.+$/.test(key) && !!row && typeof row === 'object' && Number.isSafeInteger(row.amountPence) && row.amountPence >= 0 && typeof row.at === 'string'
    }))
}
