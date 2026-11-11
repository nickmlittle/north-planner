import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { setSettleTick } from './cardStatements'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance, checkPotBalances, potBalance, setAsideStatements } from './potBalances'
import { recordMove } from './setAside'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const NOV = 'amex:2026-11-24', OCT = 'amex:2026-10-24'
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})
const at = (day: number, hour = 9) => new Date(`2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`)

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'immy', name: 'Immy' }, { id: 'nick', name: 'Nick' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Joint Monzo', provider: 'Monzo', ownerPersonIds: ['immy', 'nick'] }]
  document.budget.pots = [
    { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' },
    { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('2026-10-20', pot('groceries'), 3000, { id: 'oct', statementKey: OCT }),
      tx('2026-11-02', pot('groceries'), 8420, { id: 'tesco' }),
      tx('2026-11-03', pot('eating'), 2500, { id: 'pizza' }),
      tx('2026-11-04', pot('groceries'), 1000, { id: 'later' }),
    ],
  }
  // Groceries' November money arrived on 28 Oct.
  document.ticks = { '2026-11': { 'immy:move:groceries': { amountPence: 50000, at: '2026-10-28T08:00:00.000Z' } } }
  return document
}

describe('a pot’s balance', () => {
  it('needs a check first, but always knows what’s waiting to move', () => {
    const balance = potBalance(household(), 'groceries')
    expect(balance.balancePence).toBeUndefined()
    expect(balance.waiting).toEqual([{ statementKey: OCT, closeDate: '2026-10-24', pence: 3000 }, { statementKey: NOV, closeDate: '2026-11-24', pence: 9420 }])
  })

  it('counts payday moves after the check, and money moved to the Amex pot out of it', () => {
    let document = checkPotBalance(household(), 'groceries', 1200, new Date('2026-10-27T09:00:00Z'))
    document = recordMove(document, 'amex', ['tesco', 'pizza'], at(6), 'm1')
    const groceries = potBalance(document, 'groceries')
    expect(groceries.since).toEqual([{ flow: 'payday', pence: 50000 }, { flow: 'set-aside', pence: -8420 }])
    expect(groceries.balancePence).toBe(1200 + 50000 - 8420)
    // October settles once; November's £10.00 isn't in the Amex pot yet.
    expect(groceries.waiting.map(row => row.pence)).toEqual([3000, 1000])
    expect(groceries.freePence).toBe(1200 + 50000 - 8420 - 4000)
  })

  it('a check resets it: only moves after it count', () => {
    let document = recordMove(household(), 'amex', ['tesco'], at(6), 'm1')
    document = checkPotBalance(document, 'groceries', 41580, at(7))
    expect(potBalance(document, 'groceries')).toMatchObject({ since: [], balancePence: 41580 })
  })

  it('the Amex pot fills with each move and empties when the card is paid from it', () => {
    let document = checkPotBalance(household(), 'amex-pot', 0, at(1))
    document = recordMove(document, 'amex', ['tesco', 'pizza'], at(6), 'm1')
    expect(potBalance(document, 'amex-pot')).toMatchObject({ setAside: true, balancePence: 10920, waiting: [], freePence: 10920 })
    document = recordMove(document, 'amex', ['later'], at(8), 'm2')
    document = setSettleTick(document, NOV, 'settle:pay', 11920, new Date('2026-12-10T09:00:00Z'))
    expect(potBalance(document, 'amex-pot')).toMatchObject({ since: [{ flow: 'set-aside', pence: 11920 }, { flow: 'paid', pence: -11920 }], balancePence: 0 })
  })

  it('counts settle-up ticks on a statement that settles once', () => {
    let document = checkPotBalance(household(), 'groceries', 60000, at(1))
    document = setSettleTick(document, OCT, 'settle:out:groceries', 3000, at(2))
    expect(potBalance(document, 'groceries')).toMatchObject({ since: [{ flow: 'settled', pence: -3000 }], balancePence: 57000 })
    expect(potBalance(document, 'groceries').waiting.map(row => row.statementKey)).toEqual([NOV])
  })

  it('counts Close month covers in and out, and built-up money moved out', () => {
    const document = checkPotBalances(household(), new Map([['groceries', 1000], ['eating', 5000]]), at(1))
    document.card!.months['2026-10'] = { covers: [{ potId: 'groceries', amountPence: 2000, source: pot('eating') }], coverTicks: { 'cover:groceries': { amountPence: 2000, at: at(2).toISOString() } } }
    document.card!.pots.eating = { ...document.card!.pots.eating, movedOut: [{ pence: 1500, at: at(3).toISOString() }] }
    expect(potBalance(document, 'groceries').balancePence).toBe(3000)
    expect(potBalance(document, 'eating')).toMatchObject({ since: [{ flow: 'covers', pence: -2000 }, { flow: 'built-up', pence: -1500 }], balancePence: 1500 })
  })
})

describe('statements paid from the Amex pot', () => {
  it('shows what each costs, what’s in the pot for it and what’s paid', () => {
    let document = recordMove(household(), 'amex', ['tesco'], at(6), 'm1')
    expect(setAsideStatements(document, 'amex')).toEqual([{ statementKey: NOV, closeDate: '2026-11-24', totalPence: 11920, movedPence: 8420, toMovePence: 3500, paidPence: 0 }])
    document = setSettleTick(document, NOV, 'settle:pay', 11920, at(30))
    expect(setAsideStatements(document, 'amex')[0]!.paidPence).toBe(11920)
  })
})
