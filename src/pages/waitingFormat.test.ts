import { describe, expect, it } from 'vitest'
import type { StatementSummary } from '../domain/cardStatements'
import type { ClosePlan } from '../domain/monthStages'
import { closeBlocker, statementStatus } from './spendingFormat'

// Waiting (audit 6, W10, WP2): until Close and the statement page show the Waiting section (waiting/6, waiting/7),
// their one-line status still says why they're held.
describe('Waiting in the status lines', () => {
  const plan = (toSort: number, waiting: number) => ({ readiness: { toSort, waiting, postingsIn: true, allIn: false, canClose: false } }) as unknown as ClosePlan

  it('Close names what is waiting once nothing is to sort', () => {
    expect(closeBlocker(plan(2, 3), '2026-11', '2026-12-04')).toBe('Sort 2 transactions first.')
    expect(closeBlocker(plan(0, 3), '2026-11', '2026-12-04')).toBe('Close November once nothing is waiting.')
  })

  it('a statement with rows waiting says so instead of ready', () => {
    const summary = { settled: false, open: false, complete: true, toSort: 0, waiting: 2, done: 0, steps: 4, closeDate: '2026-11-24', dueDate: '2026-12-19' } as unknown as StatementSummary
    expect(statementStatus(summary)).toEqual({ text: '2 waiting', tone: 'todo' })
    expect(statementStatus({ ...summary, toSort: 1 })).toEqual({ text: '1 to sort', tone: 'todo' })
  })
})
