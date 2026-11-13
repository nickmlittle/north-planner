import { describe, expect, it } from 'vitest'
import type { CardTransaction } from '../domain/cardTracker'
import { activeCount, filterTransactions, groupByMonth, NO_FILTERS, statusesOf } from './transactionFilters'

const document = { household: { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] } }
const sorted = (potId: string, pence: number, by: 'person' | 'rule' = 'person') => ({ sort: { lines: [{ amountPence: pence, destination: { kind: 'pot' as const, potId } }], by, at: 'x' } })
const tx = (id: string, date: string, description: string, amountPence: number, extra: Partial<CardTransaction> = {}): CardTransaction => ({ id, cardId: 'amex', date, description, merchant: description, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: 'x', ...extra })
const rows = [
  tx('g1', '2026-11-08', 'GREEN GROCER LONDON', 6240, sorted('groceries', 6240, 'rule')),
  tx('g2', '2026-11-02', 'GREEN GROCER LONDON', 1210, { cardSuffix: '41009', personId: 'ben', ...sorted('groceries', 1210) }),
  tx('t1', '2026-11-05', 'TRAIN TICKETS', 11281),
  tx('s1', '2026-10-20', 'KETTLE SHOP', 5000, { statementKey: 'amex:2026-10-24', sort: { lines: [{ amountPence: 3499, destination: { kind: 'pot', potId: 'spending' } }, { amountPence: 1501, destination: { kind: 'pot', potId: 'groceries' } }], by: 'person', at: 'x' } }),
  tx('r1', '2026-10-22', 'KETTLE SHOP', -1499, { statementKey: 'amex:2026-10-24', ...sorted('spending', -1499) }),
]
const names: Record<string, string> = { groceries: 'Groceries · Monzo Joint', spending: 'Spending · Starling Ada' }
const nameOf = (row: CardTransaction) => row.sort ? row.sort.lines.map(line => names[(line.destination as { potId: string }).potId]).join(', ') : 'To sort'
const ids = (list: CardTransaction[]) => list.map(row => row.id)

describe('transaction filters', () => {
  it('searches the description, where it went, the card ending, the person and the amount', () => {
    expect(ids(filterTransactions(document, rows, NO_FILTERS, 'green', nameOf))).toEqual(['g1', 'g2'])
    expect(ids(filterTransactions(document, rows, NO_FILTERS, 'monzo joint', nameOf))).toEqual(['g1', 'g2', 's1'])
    expect(ids(filterTransactions(document, rows, NO_FILTERS, '41009', nameOf))).toEqual(['g2'])
    expect(ids(filterTransactions(document, rows, NO_FILTERS, 'ben', nameOf))).toEqual(['g2'])
    expect(ids(filterTransactions(document, rows, NO_FILTERS, '£62.40', nameOf))).toEqual(['g1'])
    expect(ids(filterTransactions(document, rows, NO_FILTERS, '50', nameOf))).toEqual(['s1'])
  })
  it('combines filter groups with AND, and values within a group with OR, under the search', () => {
    const filters = { ...NO_FILTERS, destinations: ['pot:groceries'], people: ['ben'] }
    expect(ids(filterTransactions(document, rows, filters, '', nameOf))).toEqual(['g2'])
    expect(ids(filterTransactions(document, rows, { ...NO_FILTERS, destinations: ['pot:groceries', 'pot:spending'] }, '', nameOf))).toEqual(['g1', 'g2', 's1', 'r1'])
    expect(ids(filterTransactions(document, rows, { ...NO_FILTERS, statements: ['amex:2026-10-24'] }, 'kettle', nameOf))).toEqual(['s1', 'r1'])
    expect(ids(filterTransactions(document, rows, { ...NO_FILTERS, statuses: ['to-sort', 'refund'] }, '', nameOf))).toEqual(['t1', 'r1'])
    expect(ids(filterTransactions(document, rows, { ...NO_FILTERS, statuses: ['moved'] }, '', nameOf, row => row.id === 'g1' ? 'moved' : undefined))).toEqual(['g1'])
    expect(activeCount(filters)).toBe(2)
  })
  it('names each transaction’s statuses', () => {
    expect(rows.map(row => statusesOf(row))).toEqual([['rule'], [], ['to-sort'], ['split'], ['refund']])
  })
  it('groups by month, newest first, with each month’s total', () => {
    expect(groupByMonth(rows).map(group => [group.month, ids(group.rows), group.totalPence])).toEqual([['2026-11', ['g1', 'g2', 't1'], 18731], ['2026-10', ['s1', 'r1'], 3501]])
  })
})
