import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { cardRemovable, emptyCardTracker, type CardTransaction } from './cardTracker'
import { setSettleTick } from './cardStatements'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance, checkPotBalances, potBalance } from './potBalances'
import { recordMove } from './setAside'
import { billCover, gapDestination, gapSteps, RECENT_MOVES, recordGapMove, setAsideCheck, shouldHold, undoGapMove } from './setAsideCheck'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const NOV = 'amex:2026-11-24', DEC = 'amex:2026-12-24', OCT = 'amex:2026-10-24'
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})
const at = (date: string, hour = 9) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)

/** The Amex pot sits in Monzo Joint with Groceries, Eating out and Spending; Fuel is Nick's, Treats Immy's. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'immy', name: 'Immy' }, { id: 'nick', name: 'Nick' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['immy', 'nick'] },
    { id: 'nick-own', name: 'Monzo Nick', provider: 'Monzo', ownerPersonIds: ['nick'] },
    { id: 'immy-own', name: 'Monzo Immy', provider: 'Monzo', ownerPersonIds: ['immy'] },
  ]
  document.budget.pots = [
    { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' },
    { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'spending', name: 'Spending', accountId: 'joint' },
    { id: 'fuel', name: 'Fuel', accountId: 'nick-own' }, { id: 'immy-treats', name: 'Treats', accountId: 'immy-own' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('2026-10-20', pot('groceries'), 3000, { id: 'oct', statementKey: OCT }),
      tx('2026-10-30', pot('groceries'), 8420, { id: 'tesco' }),
      tx('2026-11-03', pot('eating'), 2500, { id: 'pizza' }),
      tx('2026-11-05', pot('fuel'), 6000, { id: 'fuel' }),
      tx('2026-11-06', pot('eating'), -1200, { id: 'refund' }),
      tx('2026-11-07', null, 999, { id: 'unsorted' }),
      tx('2026-11-30', pot('groceries'), 4000, { id: 'xmas', statementKey: DEC }),
    ],
  }
  return document
}
const NOV_SORTED = ['tesco', 'pizza', 'fuel', 'refund']

describe('should hold', () => {
  it('is what has moved in for statements not paid yet, refunds taken off', () => {
    let document = household()
    expect(shouldHold(document, 'amex')).toBe(0)
    document = recordMove(document, 'amex', ['tesco', 'pizza', 'refund'], at('2026-11-10'), 'm1')
    expect(shouldHold(document, 'amex')).toBe(8420 + 2500 - 1200)
    document = recordMove(document, 'amex', ['xmas'], at('2026-12-01'), 'm2')
    expect(shouldHold(document, 'amex')).toBe(9720 + 4000)
    // Paying November takes its money out of what the pot should hold; December's stays.
    document = setSettleTick(document, NOV, 'settle:pay', 16719, at('2026-12-10'))
    expect(shouldHold(document, 'amex')).toBe(4000)
  })

  it('is 0 without a set-aside pot', () => {
    const document = recordMove(household(), 'amex', ['tesco'], at('2026-11-10'), 'm1')
    delete document.card!.cards[0]!.setAside
    expect(shouldHold(document, 'amex')).toBe(0)
    expect(setAsideCheck(document, 'amex')).toBeNull()
  })
})

describe('checking the Amex pot', () => {
  const moved = () => recordMove(household(), 'amex', ['tesco', 'pizza'], at('2026-11-10'), 'm1')

  it('is unchecked until the pot is checked against the bank, and says what is still to move', () => {
    expect(setAsideCheck(moved(), 'amex', '2026-11-15')).toMatchObject({ potId: 'amex-pot', shouldHoldPence: 10920, state: 'unchecked', toMovePence: 8800, toMove: 3, unpaidClosed: [] })
    expect(setAsideCheck(moved(), 'amex', '2026-11-15')!.holdsPence).toBeUndefined()
  })

  it('matches, has extra or is short against what Monzo shows', () => {
    const check = (pence: number) => setAsideCheck(checkPotBalance(moved(), 'amex-pot', pence, at('2026-11-12')), 'amex', '2026-11-15')!
    expect(check(10920)).toMatchObject({ holdsPence: 10920, gapPence: 0, state: 'matches', checkedAt: at('2026-11-12').toISOString() })
    expect(check(11000)).toMatchObject({ gapPence: 80, state: 'extra' })
    expect(check(10000)).toMatchObject({ gapPence: -920, state: 'short' })
  })

  it('keeps the gap as moves and payments shift both figures: money left from before November stays extra', () => {
    let document = checkPotBalance(household(), 'amex-pot', 500, at('2026-11-01'))
    expect(setAsideCheck(document, 'amex', '2026-11-02')).toMatchObject({ shouldHoldPence: 0, holdsPence: 500, gapPence: 500, state: 'extra' })
    document = recordMove(document, 'amex', NOV_SORTED, at('2026-11-10'), 'm1')
    expect(setAsideCheck(document, 'amex', '2026-11-11')).toMatchObject({ shouldHoldPence: 15720, holdsPence: 16220, gapPence: 500 })
    document = setSettleTick(document, NOV, 'settle:pay', 15720, at('2026-12-10'))
    expect(setAsideCheck(document, 'amex', '2026-12-11')).toMatchObject({ shouldHoldPence: 0, holdsPence: 500, gapPence: 500 })
  })

  it('reads short after paying more than was moved in (an unsorted purchase on the bill)', () => {
    let document = checkPotBalance(household(), 'amex-pot', 0, at('2026-11-01'))
    document = recordMove(document, 'amex', NOV_SORTED, at('2026-11-10'), 'm1')
    document = setSettleTick(document, NOV, 'settle:pay', 16719, at('2026-12-10'))
    expect(setAsideCheck(document, 'amex', '2026-12-11')).toMatchObject({ shouldHoldPence: 0, holdsPence: -999, gapPence: -999, state: 'short' })
  })

  it('a purchase sorted to the Amex pot itself is paid from what is in it', () => {
    let document = household()
    document.card!.transactions.push(tx('2026-11-08', pot('amex-pot'), 700, { id: 'gift' }))
    document = checkPotBalance(document, 'amex-pot', 1000, at('2026-11-01'))
    document = recordMove(document, 'amex', ['gift'], at('2026-11-10'), 'm1')
    expect(setAsideCheck(document, 'amex', '2026-11-11')).toMatchObject({ shouldHoldPence: 700, holdsPence: 1000, gapPence: 300 })
  })

  it('counts a transfer twice when the pot is checked before Moved is pressed, so the check says what is still to move', () => {
    // Moved Tesco in Monzo, checked, then pressed Moved.
    const checked = checkPotBalance(household(), 'amex-pot', 8420, at('2026-11-10', 9))
    expect(setAsideCheck(checked, 'amex', '2026-11-10')).toMatchObject({ gapPence: 8420, state: 'extra', toMovePence: 19720 })
    const twice = recordMove(checked, 'amex', ['tesco'], at('2026-11-10', 10), 'm1')
    expect(setAsideCheck(twice, 'amex', '2026-11-10')).toMatchObject({ shouldHoldPence: 8420, holdsPence: 16840, gapPence: 8420 })
  })

  it('lists closed statements with money in but no Pay tick: a paid bill not ticked reads short', () => {
    let document = recordMove(household(), 'amex', ['tesco'], at('2026-11-10'), 'm1')
    document = checkPotBalance(document, 'amex-pot', 0, at('2026-12-15'))
    expect(setAsideCheck(document, 'amex', '2026-12-15')).toMatchObject({ state: 'short', gapPence: -8420, unpaidClosed: [{ statementKey: NOV, closeDate: '2026-11-24' }] })
    expect(setAsideCheck(document, 'amex', '2026-11-20')!.unpaidClosed).toEqual([])
  })

  it('shows the last five moves, newest first', () => {
    const document = household()
    document.card!.moves = Array.from({ length: RECENT_MOVES + 1 }, (_, index) => ({ id: `m${index}`, cardId: 'amex', at: at(`2026-11-1${index}`).toISOString(), transactions: [] }))
    expect(setAsideCheck(document, 'amex', '2026-11-20')!.recentMoves.map(move => move.id)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1'])
  })
})

describe('evening it up', () => {
  it('moves extra to the card’s buffer: the Amex pot matches and the buffer pot gains it; Undo puts it back', () => {
    let document = household()
    document.card!.cards[0]!.bufferDestination = pot('spending')
    document = recordMove(document, 'amex', ['tesco', 'pizza'], at('2026-11-10'), 'm1')
    document = checkPotBalances(document, new Map([['amex-pot', 11500], ['spending', 2000]]), at('2026-11-12'))
    expect(setAsideCheck(document, 'amex', '2026-11-13')).toMatchObject({ gapPence: 580, state: 'extra' })
    const evened = recordGapMove(document, 'amex', 580, at('2026-11-13'), 'g1')
    expect(evened.card!.gapMoves).toEqual([{ id: 'g1', cardId: 'amex', at: at('2026-11-13').toISOString(), pence: 580, destination: pot('spending') }])
    expect(setAsideCheck(evened, 'amex', '2026-11-13')).toMatchObject({ holdsPence: 10920, gapPence: 0, state: 'matches' })
    expect(potBalance(evened, 'amex-pot', '2026-11-13').since).toEqual([{ flow: 'gap', pence: -580 }])
    expect(potBalance(evened, 'spending', '2026-11-13')).toMatchObject({ since: [{ flow: 'gap', pence: 580 }], balancePence: 2580 })
    expect(decodeBudgetDocument(evened)).not.toBeNull()
    const undone = undoGapMove(evened, 'g1')
    expect(undone.card!.gapMoves).toBeUndefined()
    expect(setAsideCheck(undone, 'amex', '2026-11-13')!.state).toBe('extra')
  })

  it('tops it up from the pay-from account’s main balance when there’s no buffer', () => {
    let document = recordMove(household(), 'amex', ['tesco', 'pizza'], at('2026-11-10'), 'm1')
    document = checkPotBalance(document, 'amex-pot', 10000, at('2026-11-12'))
    document = recordGapMove(document, 'amex', -920, at('2026-11-13'), 'g1')
    expect(document.card!.gapMoves![0]!.destination).toEqual({ kind: 'account', accountId: 'joint' })
    expect(setAsideCheck(document, 'amex', '2026-11-13')).toMatchObject({ holdsPence: 10920, state: 'matches' })
  })

  it('records nothing for £0 or without a set-aside pot', () => {
    const document = household()
    expect(recordGapMove(document, 'amex', 0, at('2026-11-13'), 'g1')).toBe(document)
    delete document.card!.cards[0]!.setAside
    expect(recordGapMove(document, 'amex', 500, at('2026-11-13'), 'g1')).toBe(document)
  })

  it('never sends extra to the Amex pot itself', () => {
    const card = household().card!.cards[0]!
    expect(gapDestination({ ...card, bufferDestination: pot('amex-pot') })).toEqual({ kind: 'account', accountId: 'joint' })
    expect(gapDestination({ ...card, bufferDestination: pot('spending') })).toEqual(pot('spending'))
  })
})

describe('the banking steps', () => {
  const steps = (buffer: BudgetDestination | undefined, pence: number) => {
    const document = household()
    if (buffer) document.card!.cards[0]!.bufferDestination = buffer
    const plan = gapSteps(document, 'amex', pence)!
    return [plan.toAccountId, plan.steps.map(step => `${step.kind} ${step.accountId} ${step.potId ?? ''} ${step.amountPence}`.replace('  ', ' '))]
  }

  it('moves extra out of the Amex pot to the buffer, sending it across accounts when it must', () => {
    expect(steps(undefined, 580)).toEqual(['joint', ['out joint amex-pot 580']])
    expect(steps(pot('spending'), 580)).toEqual(['joint', ['out joint amex-pot 580', 'into joint spending 580']])
    expect(steps(pot('fuel'), 580)).toEqual(['nick-own', ['out joint amex-pot 580', 'send joint 580', 'into nick-own fuel 580']])
  })

  it('tops the Amex pot up from the buffer', () => {
    expect(steps(pot('spending'), -920)).toEqual(['joint', ['out joint spending 920', 'into joint amex-pot 920']])
    expect(steps({ kind: 'account', accountId: 'nick-own' }, -920)).toEqual(['joint', ['send nick-own 920', 'into joint amex-pot 920']])
  })

  it('has none for £0', () => {
    expect(gapSteps(household(), 'amex', 0)).toBeNull()
  })
})

describe('does the pot cover the bill?', () => {
  it('needs a check, and leaves out money moved in for the next statement', () => {
    let document = recordMove(household(), 'amex', [...NOV_SORTED, 'xmas'], at('2026-11-30'), 'm1')
    expect(billCover(document, NOV, '2026-12-01')).toBeNull()
    document = checkPotBalance(document, 'amex-pot', 15720 + 4000 + 580, at('2026-12-01'))
    // £5.80 extra, but the unsorted £9.99 was never moved in: £4.19 short.
    expect(billCover(document, NOV, '2026-12-01')).toEqual({ billPence: 16719, availablePence: 16300, coverPence: -419 })
    expect(billCover(document, OCT, '2026-12-01')).toBeNull()
    document = setSettleTick(document, NOV, 'settle:pay', 16719, at('2026-12-10'))
    expect(billCover(document, NOV, '2026-12-10')).toBeNull()
  })
})

describe('validation', () => {
  it('rejects a gap move of £0, for an unknown card or to a pot that doesn’t exist', () => {
    let document = household()
    document = checkPotBalance(document, 'amex-pot', 500, at('2026-11-01'))
    const evened = recordGapMove(document, 'amex', 500, at('2026-11-02'), 'g1')
    const gap = evened.card!.gapMoves![0]!
    const withGap = (row: object) => ({ ...evened, card: { ...evened.card!, gapMoves: [row] } })
    expect(decodeBudgetDocument(withGap({ ...gap, pence: 0 }))).toBeNull()
    expect(decodeBudgetDocument(withGap({ ...gap, cardId: 'visa' }))).toBeNull()
    expect(decodeBudgetDocument(withGap({ ...gap, destination: pot('missing') }))).toBeNull()
    expect(decodeBudgetDocument({ ...evened, card: { ...evened.card!, gapMoves: [gap, gap] } })).toBeNull()
  })

  it('keeps a card with a gap move from being removed', () => {
    const tracker = { ...emptyCardTracker(), cards: household().card!.cards, gapMoves: [{ id: 'g1', cardId: 'amex', at: 'x', pence: 500, destination: pot('spending') }] }
    expect(cardRemovable(tracker, 'amex')).toBe(false)
  })
})
