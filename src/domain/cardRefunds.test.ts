import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction, type SplitLine } from './cardTracker'
import { findRefundMatch, matchRefundOnImport, payments, refundPlan, refundsOf, sortRefund, spreadLines } from './cardRefunds'

const pot = (potId: string) => ({ kind: 'pot' as const, potId })
const now = new Date('2026-11-10T09:00:00Z')
const tx = (id: string, date: string, merchant: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: merchant, merchant, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41009', statementKey: 'amex:2026-11-24', personId: 'ben', importedAt: 'x', ...overrides,
})
const sorted = (lines: SplitLine[]) => ({ lines, by: 'person' as const, at: 'x' })
const costco = tx('costco', '2026-10-24', 'COSTCO', 18640, { sort: sorted([
  { amountPence: 12179, destination: pot('groceries') }, { amountPence: 3250, destination: pot('treats-ben'), item: 'Skincare' },
  { amountPence: 1712, destination: pot('car'), item: 'Screenwash' }, { amountPence: 1499, destination: pot('treats-ada'), item: 'Running socks' },
]) })

function household(transactions: CardTransaction[]): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = ['groceries', 'treats-ben', 'treats-ada', 'car'].map(id => ({ id, name: id, accountId: 'joint' }))
  document.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41009', personId: 'ben' }] }], transactions }
  return document
}

describe('finding the purchase', () => {
  it('prefers an exact amount, then the most recent, on the same card and merchant within 180 days', () => {
    const refund = tx('r', '2026-11-06', 'SHOP', -1499)
    const rows = [
      tx('bigger-recent', '2026-11-01', 'SHOP', 5000), tx('exact-old', '2026-09-01', 'SHOP', 1499), tx('exact-older', '2026-08-01', 'SHOP', 1499),
      tx('other-card', '2026-11-05', 'SHOP', 1499, { cardSuffix: '41001' }), tx('other-shop', '2026-11-05', 'CAFE', 1499), tx('too-small', '2026-11-05', 'SHOP', 1000),
      tx('later', '2026-11-07', 'SHOP', 1499), tx('too-old', '2026-05-01', 'SHOP', 1499), refund,
    ]
    expect(findRefundMatch({ transactions: rows }, refund)?.id).toBe('exact-old')
    expect(findRefundMatch({ transactions: rows.filter(row => !row.id.startsWith('exact')) }, refund)?.id).toBe('bigger-recent')
    expect(findRefundMatch({ transactions: [tx('edge', '2026-05-10', 'SHOP', 1499), refund] }, refund)?.id).toBe('edge')
    expect(findRefundMatch({ transactions: [tx('past-edge', '2026-05-09', 'SHOP', 1499), refund] }, refund)).toBeUndefined()
    expect(findRefundMatch({ transactions: rows }, tx('p', '2026-11-06', 'SHOP', 1499))).toBeUndefined()
  })
})

describe('where it goes back', () => {
  it('goes to a plain purchase’s pot, to the exactly matching line of a split, or asks', () => {
    expect(refundPlan(tx('a', '2026-11-01', 'SHOP', 5000, { sort: sorted([{ amountPence: 5000, destination: pot('car') }]) }), { amountPence: -1000 })).toMatchObject({ kind: 'single', destination: pot('car') })
    expect(refundPlan(costco, { amountPence: -1499 })).toMatchObject({ kind: 'single', destination: pot('treats-ada'), lineIndex: 3 })
    expect(refundPlan(costco, { amountPence: -1000 })).toMatchObject({ kind: 'split' })
    expect(refundPlan(tx('u', '2026-11-01', 'SHOP', 5000), { amountPence: -1000 })).toMatchObject({ kind: 'unsorted' })
  })

  it('spreads a refund across a split in proportion, in pennies that add up', () => {
    const lines = spreadLines(-1000, costco.sort!.lines)
    expect(lines.map(line => line.amountPence)).toEqual([-653, -174, -92, -81])
    expect(lines.reduce((sum, line) => sum + line.amountPence, 0)).toBe(-1000)
    expect(lines[1]).toMatchObject({ destination: pot('treats-ben'), item: 'Skincare' })
  })

  it('sorts a refund by line, spread or a chosen pot, and links the two', () => {
    const document = household([costco, tx('r', '2026-11-06', 'COSTCO', -1499)])
    const byLine = sortRefund(document, 'r', 'costco', { lineIndex: 3 }, now)
    expect(byLine.card!.transactions[1]).toMatchObject({ refundOf: { transactionId: 'costco', lineIndex: 3 }, sort: { lines: [{ amountPence: -1499, destination: pot('treats-ada'), item: 'Running socks' }], by: 'person' } })
    expect(refundsOf(byLine.card!, 'costco').map(row => row.id)).toEqual(['r'])
    const spread = sortRefund(document, 'r', 'costco', { spread: true }, now)
    expect(spread.card!.transactions[1]!.sort!.lines).toHaveLength(4)
    expect(spread.card!.transactions[1]!.refundOf).toEqual({ transactionId: 'costco' })
    const chosen = sortRefund(document, 'r', 'costco', { destination: pot('car') }, now)
    expect(chosen.card!.transactions[1]!.sort!.lines).toEqual([{ amountPence: -1499, destination: pot('car') }])
    for (const next of [byLine, spread, chosen]) expect(decodeBudgetDocument(JSON.parse(JSON.stringify(next)))).toEqual(next)
  })
})

describe('on import', () => {
  it('sends a refund straight back when the purchase’s place is clear, and links it either way', () => {
    const plain = tx('p', '2026-10-01', 'SHOP', 5000, { sort: sorted([{ amountPence: 5000, destination: pot('car') }]) })
    expect(matchRefundOnImport({ transactions: [plain] }, tx('r', '2026-11-06', 'SHOP', -1000), 'now')).toMatchObject({ refundOf: { transactionId: 'p' }, sort: { lines: [{ amountPence: -1000, destination: pot('car') }], by: 'rule', at: 'now' } })
    const unsorted = matchRefundOnImport({ transactions: [costco] }, tx('r', '2026-11-06', 'COSTCO', -1000), 'now')
    expect(unsorted.refundOf).toEqual({ transactionId: 'costco' })
    expect(unsorted.sort).toBeUndefined()
    expect(matchRefundOnImport({ transactions: [] }, tx('r', '2026-11-06', 'SHOP', -1000), 'now').refundOf).toBeUndefined()
  })
})

it('lists payments apart, newest first', () => {
  const rows = [tx('a', '2026-10-08', 'PAYMENT RECEIVED', -100, { kind: 'payment' }), costco, tx('b', '2026-11-08', 'PAYMENT RECEIVED', -200, { kind: 'payment' })]
  expect(payments({ transactions: rows }).map(row => row.id)).toEqual(['b', 'a'])
})
