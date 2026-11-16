import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { setSettleTick } from './cardStatements'
import { amexPotKnown, billSum, homeBill, potBills } from './billSum'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance } from './potBalances'
import { recordMove } from './setAside'
import { setAsideCheck } from './setAsideCheck'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const NOV = 'amex:2026-11-24', DEC = 'amex:2026-12-24', OCT = 'amex:2026-10-24'
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})
const at = (date: string, hour = 9) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('2026-10-20', pot('groceries'), 3000, { id: 'oct', statementKey: OCT }),
      tx('2026-10-30', pot('groceries'), 8420, { id: 'tesco' }),
      tx('2026-11-03', pot('eating'), 2500, { id: 'pizza' }),
      tx('2026-11-05', pot('groceries'), 6000, { id: 'lidl' }),
      tx('2026-11-06', pot('eating'), -1200, { id: 'refund' }),
      tx('2026-11-07', null, 999, { id: 'unsorted' }),
      tx('2026-11-20', null, -500, { id: 'payment', kind: 'payment' }),
      tx('2026-11-30', pot('groceries'), 4000, { id: 'xmas', statementKey: DEC }),
    ],
  }
  return document
}
const parts = (sum: NonNullable<ReturnType<typeof billSum>>) => sum.inPotPence + sum.toMovePence + sum.toSortPence + sum.expectingBackPence

describe('the bill sum (D1)', () => {
  it('is In the Amex pot + To move + To sort, and adds up to the bill', () => {
    const document = recordMove(household(), 'amex', ['tesco', 'pizza'], at('2026-11-10'), 'm1')
    const sum = billSum(document, NOV, '2026-11-20')!
    expect(sum).toMatchObject({ open: true, paid: false, inPotPence: 10920, toMovePence: 4800, toMove: 2, toSortPence: 999, toSort: 1, expectingBackPence: 0, billPence: 16719, covered: false })
    expect(parts(sum)).toBe(sum.billPence)
  })

  it('still adds up when a moved transaction goes back to To sort', () => {
    const document = recordMove(household(), 'amex', ['tesco', 'pizza'], at('2026-11-10'), 'm1')
    document.card!.transactions = document.card!.transactions.map(row => row.id === 'pizza' ? { ...row, sort: undefined } : row)
    const sum = billSum(document, NOV, '2026-11-20')!
    expect(sum.toSort).toBe(2)
    expect(parts(sum)).toBe(sum.billPence)
  })

  it('is only for statements paid from the Amex pot', () => {
    expect(billSum(household(), OCT, '2026-11-20')).toBeNull()
    const document = household()
    delete document.card!.cards[0]!.setAside
    expect(billSum(document, NOV, '2026-11-20')).toBeNull()
  })

  it('is covered once it has closed and all of it is in the Amex pot, until the Pay tick', () => {
    let document = household()
    document.card!.transactions = document.card!.transactions.map(row => row.id === 'unsorted' ? { ...row, sort: { lines: [{ amountPence: 999, destination: pot('groceries') }], by: 'person' as const, at: 'x' } } : row)
    document = recordMove(document, 'amex', ['tesco', 'pizza', 'lidl', 'refund', 'unsorted'], at('2026-11-25'), 'm1')
    expect(billSum(document, NOV, '2026-11-24')!.covered).toBe(false)
    expect(billSum(document, NOV, '2026-11-26')).toMatchObject({ open: false, covered: true, inPotPence: 16719, toMovePence: 0, toSortPence: 0 })
    // Edge case: closed and covered, Pay not ticked: Home shows it until the Pay tick, then the open bill.
    expect(homeBill(document, '2026-11-26')).toMatchObject({ statementKey: NOV, covered: true })
    document = setSettleTick(document, NOV, 'settle:pay', 16719, at('2026-12-10'))
    expect(billSum(document, NOV, '2026-12-10')!.paid).toBe(true)
    expect(homeBill(document, '2026-12-10')).toMatchObject({ statementKey: DEC, open: true, billPence: 4000 })
  })
})

describe('which bills', () => {
  it('lists the unpaid bills paid from the pot, oldest first, then the open one', () => {
    expect(potBills(household(), 'amex', '2026-11-20').map(row => row.statementKey)).toEqual([NOV, DEC])
    expect(potBills(household(), 'amex', '2026-12-01').map(row => row.statementKey)).toEqual([NOV, DEC])
  })

  it('always has the open bill, even with nothing on it yet', () => {
    const document = setSettleTick(household(), NOV, 'settle:pay', 16719, at('2026-12-10'))
    document.card!.transactions = document.card!.transactions.filter(row => row.statementKey !== DEC)
    expect(potBills(document, 'amex', '2026-12-10')).toMatchObject([{ statementKey: DEC, billPence: 0, open: true }])
  })

  it('Home shows the oldest unpaid bill, or nothing without a pot', () => {
    expect(homeBill(household(), '2026-12-01')).toMatchObject({ statementKey: NOV, open: false })
    const document = household()
    delete document.card!.cards[0]!.setAside
    expect(homeBill(document, '2026-12-01')).toBeNull()
  })
})

describe('how In the Amex pot is known', () => {
  const moved = () => recordMove(household(), 'amex', ['tesco', 'pizza'], at('2026-11-10'), 'm1')

  it('is worked out until a check made after the last move matches', () => {
    let document = moved()
    expect(amexPotKnown(document, 'amex', '2026-11-12')).toBe('worked-out')
    document = checkPotBalance(document, 'amex-pot', 10920, at('2026-11-11'))
    expect(amexPotKnown(document, 'amex', '2026-11-12')).toBe('checked')
    expect(billSum(document, NOV, '2026-11-12')!.known).toBe('checked')
    // Another move: it matches still, but only as worked out.
    document = recordMove(document, 'amex', ['lidl'], at('2026-11-12'), 'm2')
    expect(setAsideCheck(document, 'amex', '2026-11-12')!.state).toBe('matches')
    expect(amexPotKnown(document, 'amex', '2026-11-12')).toBe('worked-out')
  })

  it('is worked out when the check found extra or short', () => {
    const document = checkPotBalance(moved(), 'amex-pot', 11500, at('2026-11-11'))
    expect(amexPotKnown(document, 'amex', '2026-11-12')).toBe('worked-out')
  })
})
