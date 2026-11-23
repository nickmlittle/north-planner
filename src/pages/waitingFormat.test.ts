import { describe, expect, it } from 'vitest'
import type { StatementSummary } from '../domain/cardStatements'
import type { ClosePlan } from '../domain/monthStages'
import type { BillSum } from '../domain/billSum'
import { billParts, closeBlocker, statementStatus } from './spendingFormat'

// Waiting (audit 6, W10, WP2): Close's header and the statement chip say why they're held in one line.
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

// Close and Home (waiting/6, W12): "£X waiting" joins every bill line, between To sort and Expecting back.
describe('Waiting on the bill lines', () => {
  const bill = { inPotPence: 81206, toMovePence: 17220, toMove: 6, toSortPence: 5820, toSort: 3, waitingPence: 21240, waiting: 6, expectingBackPence: 0, billPence: 125486, covered: false } as unknown as BillSum

  it('names the waiting part, and its five parts add up to the bill', () => {
    expect(billParts(bill, 'the Amex pot')).toBe('£812.06 in the Amex pot · £172.20 to move · £58.20 to sort · £212.40 waiting')
    expect(bill.inPotPence + bill.toMovePence + bill.toSortPence + bill.waitingPence + bill.expectingBackPence).toBe(bill.billPence)
  })

  it('leaves it out when nothing is waiting', () => {
    expect(billParts({ ...bill, waiting: 0, waitingPence: 0 }, 'the Amex pot')).not.toMatch(/waiting/)
  })
})
