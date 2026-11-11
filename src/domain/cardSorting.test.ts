import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { addRule, allTransactions, checkRuleSorts, deleteRule, moveRule, ruleUses, sortTransaction, suggestions, transactionsToSort, uncheckedRuleSorts, unsortTransaction, updateRule } from './cardSorting'

const now = new Date('2026-11-10T09:00:00Z')
const pot = (potId: string) => ({ kind: 'pot' as const, potId })
const account = (accountId: string) => ({ kind: 'account' as const, accountId })

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] },
    { id: 'ben-own', name: 'Ben', provider: 'Nationwide', ownerPersonIds: ['ben'] },
  ]
  document.budget.pots = [
    { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'buffer', name: 'Buffer', accountId: 'joint' },
    { id: 'ada-treats', name: 'Treats', accountId: 'ada-own' }, { id: 'ada-car', name: 'Car', accountId: 'ada-own' }, { id: 'ben-treats', name: 'Treats', accountId: 'ben-own' },
  ]
  document.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }] }] }
  return document
}
const tx = (id: string, date: string, merchant: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: `${merchant} LONDON`, merchant, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: '2026-11-09T10:00:00Z', ...overrides,
})
const sorted = (destination: ReturnType<typeof pot> | ReturnType<typeof account>, amountPence: number) => ({ lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' })

describe('suggestions', () => {
  it('offers last time’s place for the merchant, then the cardholder’s pots, joint pots, the joint account and the buffer', () => {
    const document = household()
    document.card!.transactions = [
      tx('old', '2026-10-01', 'TRAINLINE', 2000, { sort: sorted(pot('eating'), 2000) }),
      tx('older', '2026-09-01', 'TRAINLINE', 2000, { sort: sorted(pot('groceries'), 2000) }),
      tx('new', '2026-11-08', 'TRAINLINE', 11281),
    ]
    document.card!.cards[0]!.bufferDestination = pot('buffer')
    expect(suggestions(document, document.card!.transactions[2]!)).toEqual([
      { destination: pot('eating'), reason: 'last-used' },
      { destination: pot('ada-car'), reason: 'own' },
      { destination: pot('ada-treats'), reason: 'own' },
      { destination: pot('buffer'), reason: 'joint' },
      { destination: pot('groceries'), reason: 'joint' },
      { destination: account('joint'), reason: 'joint-account' },
    ])
  })

  it('lists each line of a split last time, skips other people’s pots, and leaves the buffer out when it is the joint account', () => {
    const document = household()
    document.card!.transactions = [
      tx('split', '2026-10-01', 'OCADO', 3000, { cardSuffix: '41009', personId: 'ben', sort: { lines: [{ amountPence: 1500, destination: pot('groceries') }, { amountPence: 1500, destination: pot('ben-treats') }], by: 'person', at: 'x' } }),
      tx('new', '2026-11-08', 'OCADO', 4000, { cardSuffix: '41009', personId: 'ben' }),
    ]
    const result = suggestions(document, document.card!.transactions[1]!)
    expect(result.slice(0, 2)).toEqual([{ destination: pot('groceries'), reason: 'last-used' }, { destination: pot('ben-treats'), reason: 'last-used' }])
    expect(result.some(row => row.destination.kind === 'pot' && row.destination.potId.startsWith('ada'))).toBe(false)
    expect(result.at(-1)).toEqual({ destination: account('joint'), reason: 'joint-account' })
  })

  it('suggests no personal pots for an unknown card', () => {
    const document = household()
    const unknown = tx('u', '2026-11-08', 'SHOP', 100, { personId: undefined, cardSuffix: '49999' })
    expect(suggestions(document, unknown).map(row => row.reason)).toEqual(['joint', 'joint', 'joint', 'joint-account'])
  })
})

describe('sorting', () => {
  it('sorts by hand when the lines add up, and can put it back', () => {
    const document = household()
    document.card!.transactions = [tx('a', '2026-11-08', 'SHOP', 1000)]
    const done = sortTransaction(document, 'a', [{ amountPence: 1000, destination: pot('groceries') }], now)
    expect(done.card!.transactions[0]!.sort).toEqual({ lines: [{ amountPence: 1000, destination: pot('groceries') }], by: 'person', at: '2026-11-10T09:00:00.000Z' })
    expect(sortTransaction(document, 'a', [{ amountPence: 999, destination: pot('groceries') }], now)).toBe(document)
    expect(transactionsToSort(done.card!)).toEqual([])
    expect(unsortTransaction(done, 'a').card!.transactions[0]!.sort).toBeUndefined()
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(done)))).toEqual(done)
  })

  it('never sorts a payment', () => {
    const document = household()
    document.card!.transactions = [tx('p', '2026-11-08', 'PAYMENT RECEIVED', -1000, { kind: 'payment' })]
    expect(sortTransaction(document, 'p', [{ amountPence: -1000, destination: account('joint') }], now)).toBe(document)
    expect(allTransactions(document.card!)).toEqual([])
  })

  it('lists rule sorts until they are checked', () => {
    const document = household()
    document.card!.transactions = [tx('a', '2026-11-08', 'SHOP', 1000, { sort: { lines: [{ amountPence: 1000, destination: pot('groceries') }], by: 'rule', ruleId: 'r', at: 'x' } }), tx('b', '2026-11-09', 'SHOP', 500, { sort: sorted(pot('groceries'), 500) })]
    expect(uncheckedRuleSorts(document.card!).map(row => row.id)).toEqual(['a'])
    const checked = checkRuleSorts(document, ['a', 'b'], now)
    expect(uncheckedRuleSorts(checked.card!)).toEqual([])
    expect(checked.card!.transactions[0]!.sort?.checkedAt).toBe('2026-11-10T09:00:00.000Z')
    expect(checked.card!.transactions[1]!.sort?.checkedAt).toBeUndefined()
  })
})

describe('rules', () => {
  it('adds a rule at the end and sorts anything still to sort that it matches', () => {
    const document = household()
    document.card!.rules = [{ id: 'first', contains: 'TESCO', destination: pot('groceries'), createdAt: 'x' }]
    document.card!.transactions = [tx('a', '2026-11-08', 'TRAINLINE', 1000), tx('b', '2026-11-01', 'TRAINLINE', 2000), tx('c', '2026-11-02', 'TRAINLINE', 3000, { cardSuffix: '41009', personId: 'ben' }), tx('d', '2026-11-03', 'TRAINLINE', 4000, { sort: sorted(pot('eating'), 4000) })]
    const { document: next, rule, alsoSorted } = addRule(document, { contains: ' trainline ', cardSuffix: '41001', destination: pot('ada-treats') }, now, 'r2')
    expect(rule).toEqual({ id: 'r2', contains: 'TRAINLINE', cardSuffix: '41001', destination: pot('ada-treats'), createdAt: '2026-11-10T09:00:00.000Z' })
    expect(next.card!.rules.map(row => row.id)).toEqual(['first', 'r2'])
    expect(alsoSorted).toBe(2)
    expect(next.card!.transactions.map(row => row.sort?.ruleId ?? row.sort?.by ?? null)).toEqual(['r2', 'r2', null, 'person'])
    expect(ruleUses(next.card!, 'r2')).toBe(2)
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(next)))).toEqual(next)
  })

  it('edits, reorders and deletes rules, leaving past sorts alone', () => {
    let document = household()
    document.card!.rules = [{ id: 'a', contains: 'A', destination: pot('groceries'), createdAt: 'x' }, { id: 'b', contains: 'B', cardSuffix: '41001', destination: pot('eating'), createdAt: 'y' }]
    document.card!.transactions = [tx('t', '2026-11-08', 'B', 100, { sort: { lines: [{ amountPence: 100, destination: pot('eating') }], by: 'rule', ruleId: 'b', at: 'x' } })]
    document = updateRule(document, 'b', { contains: 'bee', destination: pot('groceries') })
    expect(document.card!.rules[1]).toEqual({ id: 'b', contains: 'BEE', destination: pot('groceries'), createdAt: 'y' })
    expect(moveRule(document, 'b', -1).card!.rules.map(rule => rule.id)).toEqual(['b', 'a'])
    expect(moveRule(document, 'a', -1)).toBe(document)
    expect(moveRule(document, 'b', 1)).toBe(document)
    const without = deleteRule(document, 'b')
    expect(without.card!.rules.map(rule => rule.id)).toEqual(['a'])
    expect(without.card!.transactions[0]!.sort?.lines[0]?.destination).toEqual(pot('eating'))
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(without)))).toEqual(without)
  })
})
