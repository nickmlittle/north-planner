import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { moveState, moveSteps, movedByTransaction, moveTotal, potPhrase, recordMove, toMove, undoMove, usesSetAside } from './setAside'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const NOV = 'amex:2026-11-24', OCT = 'amex:2026-10-24'
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})

/** Nick's Amex pot sits in Joint Monzo; Immy's and Nick's own pots are in their own Monzo accounts. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'immy', name: 'Immy' }, { id: 'nick', name: 'Nick' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Joint Monzo', provider: 'Monzo', ownerPersonIds: ['immy', 'nick'] },
    { id: 'nick-own', name: 'Nick', provider: 'Monzo', ownerPersonIds: ['nick'] },
    { id: 'immy-own', name: 'Immy', provider: 'Monzo', ownerPersonIds: ['immy'] },
  ]
  document.budget.pots = [
    { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' },
    { id: 'immy-treats', name: 'Treats', accountId: 'immy-own' }, { id: 'fuel', name: 'Fuel', accountId: 'nick-own' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('2026-10-20', pot('groceries'), 4000, { id: 'old', statementKey: OCT }),
      tx('2026-10-30', pot('groceries'), 8420, { id: 'tesco' }),
      tx('2026-11-01', pot('immy-treats'), 2500, { id: 'book' }),
      tx('2026-11-02', pot('fuel'), 6000, { id: 'fuel' }),
      tx('2026-11-03', { kind: 'account', accountId: 'joint' }, 1500, { id: 'lamp' }),
      tx('2026-11-04', null, 999, { id: 'unsorted' }),
      tx('2026-11-05', pot('eating'), -1200, { id: 'refund' }),
      tx('2026-11-08', null, -50000, { id: 'payment', kind: 'payment', description: 'PAYMENT RECEIVED' }),
    ],
  }
  return document
}

describe('which statements are paid from the pot', () => {
  it('starts at the chosen statement; earlier ones settle once', () => {
    const card = household().card!.cards[0]!
    expect(usesSetAside(card, NOV)).toBe(true)
    expect(usesSetAside(card, 'amex:2026-12-24')).toBe(true)
    expect(usesSetAside(card, OCT)).toBe(false)
    expect(usesSetAside({}, NOV)).toBe(false)
  })
})

describe('to move', () => {
  it('lists sorted purchases and refunds on pot statements, newest first, never payments or unsorted ones', () => {
    expect(toMove(household(), 'amex').map(row => [row.transaction.id, row.pence, row.changed])).toEqual([
      ['refund', -1200, false], ['lamp', 1500, false], ['fuel', 6000, false], ['book', 2500, false], ['tesco', 8420, false],
    ])
    expect(toMove(household(), 'amex', OCT)).toEqual([])
  })

  it('is empty without a set-aside pot', () => {
    const document = household()
    delete document.card!.cards[0]!.setAside
    expect(toMove(document, 'amex')).toEqual([])
  })
})

describe('move steps', () => {
  it('takes each pot’s share out, sends other accounts’ shares to the pot’s account, then into the pot', () => {
    const document = household()
    const plan = moveSteps(document, 'amex', toMove(document, 'amex'))!
    expect(plan.accounts.map(account => [account.accountId, account.sharePence, account.steps.map(step => `${step.kind} ${step.potId ?? ''} ${step.amountPence}`)])).toEqual([
      ['immy-own', 2500, ['out immy-treats 2500', 'send  2500']],
      ['nick-own', 6000, ['out fuel 6000', 'send  6000']],
      ['joint', 8720, ['into eating 1200', 'out groceries 8420']],
    ])
    expect(plan.accounts[2]!.oneOffsPence).toBe(1500)
    expect(plan).toMatchObject({ potId: 'amex-pot', accountId: 'joint', totalPence: 17220 })
  })
})

describe('recording a move', () => {
  const now = new Date('2026-11-10T09:00:00Z')

  it('records what moved; the moved transactions drop off the list', () => {
    const moved = recordMove(household(), 'amex', ['tesco', 'book', 'payment', 'unsorted'], now, 'm1')
    expect(moved.card!.moves).toEqual([{ id: 'm1', cardId: 'amex', at: now.toISOString(), transactions: [
      { transactionId: 'book', lines: [{ destination: pot('immy-treats'), amountPence: 2500 }] },
      { transactionId: 'tesco', lines: [{ destination: pot('groceries'), amountPence: 8420 }] },
    ] }])
    expect(toMove(moved, 'amex').map(row => row.transaction.id)).toEqual(['refund', 'lamp', 'fuel'])
    expect(moveTotal(moved.card!.moves![0]!)).toBe(10920)
    expect(decodeBudgetDocument(moved)).not.toBeNull()
  })

  it('does nothing when nothing is left to move', () => {
    const document = household()
    expect(recordMove(document, 'amex', ['payment', 'old'], now, 'm1')).toBe(document)
  })

  it('moves only the change after a re-sort, and shows it as changed', () => {
    let document = recordMove(household(), 'amex', ['tesco'], now, 'm1')
    const tesco = () => document.card!.transactions.find(row => row.id === 'tesco')!
    expect(moveState(tesco(), movedByTransaction(document.card!).get('tesco'))).toBe('moved')
    // Split: £20.00 of it was eating out.
    document = { ...document, card: { ...document.card!, transactions: document.card!.transactions.map(row => row.id === 'tesco' ? { ...row, sort: { lines: [{ amountPence: 6420, destination: pot('groceries') }, { amountPence: 2000, destination: pot('eating') }], by: 'person' as const, at: 'y' } } : row) } }
    expect(moveState(tesco(), movedByTransaction(document.card!).get('tesco'))).toBe('changed')
    const row = toMove(document, 'amex').find(item => item.transaction.id === 'tesco')!
    expect(row).toMatchObject({ pence: 0, changed: true })
    expect(row.lines).toEqual([{ destination: pot('groceries'), amountPence: -2000 }, { destination: pot('eating'), amountPence: 2000 }])
    const plan = moveSteps(document, 'amex', [row])!
    expect(plan.accounts[0]!.steps.map(step => `${step.kind} ${step.potId} ${step.amountPence}`)).toEqual(['out eating 2000', 'into groceries 2000'])
    expect(plan.totalPence).toBe(0)
    document = recordMove(document, 'amex', ['tesco'], new Date('2026-11-11T09:00:00Z'), 'm2')
    expect(moveState(tesco(), movedByTransaction(document.card!).get('tesco'))).toBe('moved')
  })

  it('moving it back to To sort leaves it changed until it is sorted again', () => {
    const document = recordMove(household(), 'amex', ['tesco'], now, 'm1')
    const unsorted = { ...document.card!.transactions.find(row => row.id === 'tesco')! }
    delete unsorted.sort
    expect(moveState(unsorted, movedByTransaction(document.card!).get('tesco'))).toBe('changed')
  })

  it('undo puts the transactions back on the list', () => {
    const moved = recordMove(household(), 'amex', ['tesco'], now, 'm1')
    const undone = undoMove(moved, 'm1')
    expect(undone.card!.moves).toBeUndefined()
    expect(toMove(undone, 'amex')).toHaveLength(5)
  })
})

describe('validation', () => {
  it('rejects a move for a transaction that doesn’t exist, and a set-aside pot that doesn’t', () => {
    const moved = recordMove(household(), 'amex', ['tesco'], new Date(), 'm1')
    expect(decodeBudgetDocument({ ...moved, card: { ...moved.card!, moves: [{ ...moved.card!.moves![0]!, transactions: [{ transactionId: 'nope', lines: [] }] }] } })).toBeNull()
    const document = household()
    document.card!.cards[0]!.setAside = { potId: 'missing', fromCloseDate: '2026-11-24' }
    expect(decodeBudgetDocument(document)).toBeNull()
  })
})

describe('words', () => {
  it('says “the Amex pot”, without doubling pot', () => {
    expect(potPhrase('Amex')).toBe('the Amex pot')
    expect(potPhrase('Amex pot')).toBe('the Amex pot')
  })
})
