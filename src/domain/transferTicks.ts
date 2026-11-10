import type { BudgetDocument } from './budgetDocument'
import type { PersonTransferPlan } from './personTransfers'

/**
 * Payday tick-off (transfer-calculation-rules, "Ticking off steps"). A tick belongs to one month and one step,
 * and records the amount it was ticked at, so a later change to the plan shows as a difference rather than silently
 * reading as done. Ticks never change the plan, and the app doesn't verify them against a bank.
 */
export type StepTick = { amountPence: number; at: string }
/** Month (YYYY-MM) → step key → tick. */
export type TransferTicks = Record<string, Record<string, StepTick>>

/** A step is one person's: funding an account, or a pot move they make. */
export const fundStepKey = (personId: string, accountId: string) => `${personId}:fund:${accountId}`
export const moveStepKey = (personId: string, potId: string) => `${personId}:move:${potId}`

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

/** Every step in a person's payday plan, in order, with its key and amount. */
export function planSteps(plan: PersonTransferPlan) {
  return plan.rows.flatMap(row => [
    ...row.fundingPence > 0 ? [{ key: fundStepKey(plan.personId, row.accountId), kind: 'fund' as const, accountId: row.accountId, amountPence: row.fundingPence }] : [],
    ...row.potMoves.map(move => ({ key: moveStepKey(plan.personId, move.potId), kind: 'move' as const, accountId: row.accountId, potId: move.potId, amountPence: move.amountPence })),
  ])
}

export type PersonProgress = { total: number; done: number; changed: number; differencePence: number; complete: boolean }

/** How far through their steps a person is. Changed steps don't count as done. */
export function personProgress(plan: PersonTransferPlan | undefined, ticks: Readonly<Record<string, StepTick>> | undefined): PersonProgress {
  const statuses = plan ? planSteps(plan).map(step => stepStatus(ticks, step.key, step.amountPence)) : []
  const done = statuses.filter(status => status.state === 'done').length
  const changed = statuses.filter(status => status.state === 'changed')
  return { total: statuses.length, done, changed: changed.length, differencePence: changed.reduce((sum, status) => sum + status.differencePence, 0), complete: statuses.length > 0 && done === statuses.length }
}

export function validTransferTicks(value: unknown): value is TransferTicks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([month, steps]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && !!steps && typeof steps === 'object' && !Array.isArray(steps)
    && Object.entries(steps as Record<string, unknown>).every(([key, tick]) => {
      const row = tick as StepTick
      return /^[^:]+:(fund|move):.+$/.test(key) && !!row && typeof row === 'object' && Number.isSafeInteger(row.amountPence) && row.amountPence >= 0 && typeof row.at === 'string'
    }))
}
