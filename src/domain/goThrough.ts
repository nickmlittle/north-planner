import type { BudgetDocument } from './budgetDocument'
import type { WaitingGroup } from './cardSorting'
import { cardTracker, type CardTransaction, type WaitingOn } from './cardTracker'

/**
 * Go through them (audit 6, W9): one waiting group's rows, one at a time, in the sort sheet. The queue is fixed when it
 * opens (WP8), so "1 of 4" never shifts: rows marked later join the next go-through, and a row sorted elsewhere drops
 * out. Only which rows have been dealt with is kept; what happened to each is read from the document.
 */
export type GoThrough = {
  on: WaitingOn
  /** The group's rows when it opened, in its order (newest first). */
  ids: string[]
  /** The group's total when it opened. */
  totalPence: number
  /** Rows placed, skipped, changed or sent back in this go-through. */
  handled: string[]
}

export const startGoThrough = (group: WaitingGroup): GoThrough => ({ on: group.on, ids: group.rows.map(row => row.id), totalPence: group.totalPence, handled: [] })

/** A row still to come: still waiting and not dealt with yet. */
const stillToCome = (rows: Map<string, CardTransaction>, state: GoThrough) => (id: string) => {
  const row = rows.get(id)
  return !!row?.waiting && !row.sort && !state.handled.includes(id)
}

export type GoThroughStep = {
  current: CardTransaction
  /** 1-based, out of the queue's length. */
  position: number
  next?: CardTransaction
}

/** The row being looked at and the one after it, or undefined once there's nothing left. */
export function goThroughStep(document: Pick<BudgetDocument, 'card'>, state: GoThrough): GoThroughStep | undefined {
  const rows = new Map(cardTracker(document).transactions.map(row => [row.id, row]))
  const left = state.ids.filter(stillToCome(rows, state))
  const [current, next] = left
  if (!current) return undefined
  return { current: rows.get(current)!, position: state.ids.indexOf(current) + 1, ...next ? { next: rows.get(next)! } : {} }
}

/** Mark the row dealt with, so the go-through moves on. */
export const handleRow = (state: GoThrough, id: string): GoThrough => state.handled.includes(id) ? state : { ...state, handled: [...state.handled, id] }

export type GoThroughCounts = {
  /** Rows gone through: dealt with here, or sorted or sent back elsewhere. */
  passed: number
  sorted: number
  /** Skipped, or given a new reason or note. */
  waiting: number
  /** Back to To sort. */
  back: number
  /** Every row in the queue has been gone through. */
  all: boolean
}

/** What happened to the rows gone through so far, as the document now has them. */
export function goThroughCounts(document: Pick<BudgetDocument, 'card'>, state: GoThrough): GoThroughCounts {
  const rows = new Map(cardTracker(document).transactions.map(row => [row.id, row]))
  const toCome = stillToCome(rows, state)
  const passed = state.ids.filter(id => rows.has(id) && !toCome(id)).map(id => rows.get(id)!)
  return {
    passed: passed.length,
    sorted: passed.filter(row => row.sort).length,
    waiting: passed.filter(row => row.waiting).length,
    back: passed.filter(row => !row.sort && !row.waiting).length,
    all: !state.ids.some(toCome),
  }
}
