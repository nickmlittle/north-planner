import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { markWaiting, sortTransaction } from './cardSorting'
import { setSettleTick, settleWithoutFinal, statementSummary } from './cardStatements'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { bufferBalance, checkBuffer } from './buffer'
import { frontsOwed, setFrontSource } from './fronts'
import { homeInbox } from './homeInbox'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance, potBalance, setAsideStatements } from './potBalances'
import { moveSteps, moveTotal, recordMove, toMove, undoMove } from './setAside'
import { shouldHold } from './setAsideCheck'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const joint: BudgetDestination = { kind: 'account', accountId: 'joint' }
const NOV = 'amex:2026-11-24', DEC = 'amex:2026-12-24'
const at = (date: string, hour = 9) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)
const tx = (id: string, date: string, amountPence: number, destination: BudgetDestination | null, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', personId: 'ada', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})
const one = (destination: BudgetDestination, amountPence: number) => [{ amountPence, destination }]

/**
 * Ada and Ben (example figures). The Amex pot, Groceries, Going out and a Buffer pot sit in Monzo Joint, and Ada's
 * Spending pot in Starling Ada; the buffer is Joint's main balance. November's bill is £200.00: Tesco £120.00 (moved in),
 * Zara £50.00 and Pizza £30.00 waiting. December so far: Sainsbury's £45.10, sorted to Groceries.
 */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [
    { id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'starling-ada', name: 'Starling Ada', provider: 'Starling', ownerPersonIds: ['ada'] },
  ]
  document.budget.pots = [
    { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' },
    { id: 'going-out', name: 'Going out', accountId: 'joint' }, { id: 'buffer-pot', name: 'Buffer', accountId: 'joint' },
    { id: 'ada-spending', name: 'Spending', accountId: 'starling-ada' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('tesco', '2026-11-03', 12000, pot('groceries')),
      tx('zara', '2026-11-10', 5000, null),
      tx('pizza', '2026-11-15', 3000, null),
      tx('sainsburys', '2026-12-02', 4510, pot('groceries'), { statementKey: DEC }),
    ],
  }
  let next = recordMove(document, 'amex', ['tesco'], at('2026-11-20'), 'm1')
  next = markWaiting(next, 'zara', { kind: 'person', personId: 'ada' }, undefined, at('2026-11-21'))
  next = markWaiting(next, 'pizza', { kind: 'discuss' }, undefined, at('2026-11-21'))
  return settleWithoutFinal(next, NOV, at('2026-11-30'))
}
/** Paid on 18 Dec with Zara and Pizza still waiting: the buffer covers £80.00. */
const paid = (document = household()) => setSettleTick(document, NOV, 'settle:pay', 20000, at('2026-12-18'))
const sortZara = (document: BudgetDocument, destination: BudgetDestination = pot('going-out')) => sortTransaction(document, 'zara', one(destination, 5000), at('2026-12-20'))
const plan = (document: BudgetDocument) => moveSteps(document, 'amex', toMove(document, 'amex', undefined, '2026-12-20'))!

describe('routing a fronted row’s money (W11)', () => {
  it('a Joint pot: Out of Going out, and it stays in Joint’s main balance; December still goes into the Amex pot', () => {
    const steps = plan(sortZara(paid()))
    expect(steps.totalPence).toBe(4510)
    expect(steps.payBack).toEqual([{ source: joint, pence: 5000, statementKeys: [NOV], steps: [] }])
    expect(steps.payBackPence).toBe(5000)
    expect(steps.accounts).toEqual([expect.objectContaining({ accountId: 'joint', steps: [
      expect.objectContaining({ kind: 'out', potId: 'going-out', amountPence: 5000 }), expect.objectContaining({ kind: 'out', potId: 'groceries', amountPence: 4510 }),
    ] })])
  })

  it('a personal pot: Out of Spending and Send to Monzo Joint, as any move does', () => {
    const steps = plan(sortZara(paid(), pot('ada-spending')))
    expect(steps.accounts[0]).toMatchObject({ accountId: 'starling-ada', steps: [{ kind: 'out', potId: 'ada-spending', amountPence: 5000 }, { kind: 'send', accountId: 'starling-ada', amountPence: 5000 }] })
    expect(steps.payBack).toEqual([{ source: joint, pence: 5000, statementKeys: [NOV], steps: [] }])
  })

  it('a source pot gets Into <pot> once the money is in Joint', () => {
    const steps = plan(sortZara(paid(setFrontSource(household(), NOV, pot('buffer-pot')))))
    expect(steps.payBack).toEqual([{ source: pot('buffer-pot'), pence: 5000, statementKeys: [NOV], steps: [{ key: 'pay-back:into:buffer-pot', kind: 'into', accountId: 'joint', potId: 'buffer-pot', amountPence: 5000 }] }])
  })

  it('a row sorted to the source itself needs no step', () => {
    const steps = plan(sortZara(paid(), joint))
    expect(steps.payBack).toEqual([])
    expect(steps.accounts.flatMap(account => account.steps)).toEqual([expect.objectContaining({ potId: 'groceries' })])
  })

  it('before Pay, the same row goes into the Amex pot as usual', () => {
    const steps = plan(sortZara(household()))
    expect(steps.totalPence).toBe(9510)
    expect(steps.payBack).toEqual([])
  })
})

describe('what’s owed back (frontsOwed)', () => {
  it('is the whole Front until rows are sorted', () => {
    expect(frontsOwed(paid(), '2026-12-18')).toEqual([expect.objectContaining({ owedPence: 8000, toMove: [], toMovePence: 0, unsorted: 2, unsortedPence: 8000, waiting: 2 })])
  })

  it('counts a sorted row as ready to move, then paid back once moved', () => {
    const sorted = sortZara(paid())
    expect(frontsOwed(sorted, '2026-12-20')[0]).toMatchObject({ owedPence: 8000, toMovePence: 5000, unsorted: 1, unsortedPence: 3000, waiting: 1 })
    expect(frontsOwed(sorted, '2026-12-20')[0]!.toMove.map(row => row.transaction.id)).toEqual(['zara'])
    const moved = recordMove(sorted, 'amex', ['zara', 'sainsburys'], at('2026-12-20', 10), 'm2')
    expect(frontsOwed(moved, '2026-12-20')[0]).toMatchObject({ owedPence: 3000, toMove: [], unsortedPence: 3000 })
  })

  it('a row sorted to the source moves no money, and recording it clears what it owed', () => {
    const sorted = sortZara(paid(), joint)
    expect(frontsOwed(sorted, '2026-12-20')[0]).toMatchObject({ toMovePence: 0, owedPence: 8000 })
    expect(frontsOwed(recordMove(sorted, 'amex', ['zara'], at('2026-12-20', 10), 'm2'), '2026-12-20')[0]).toMatchObject({ owedPence: 3000, toMove: [] })
  })

  it('is empty once every row has paid back, and Undo brings it back', () => {
    let document = sortTransaction(sortZara(paid()), 'pizza', one(pot('going-out'), 3000), at('2026-12-20'))
    document = recordMove(document, 'amex', ['zara', 'pizza'], at('2026-12-20', 10), 'm2')
    expect(frontsOwed(document, '2026-12-20')).toEqual([])
    expect(frontsOwed(undoMove(document, 'm2'), '2026-12-20')[0]).toMatchObject({ owedPence: 8000, toMovePence: 8000 })
  })
})

describe('balances after paying back', () => {
  /** Buffer and pots checked on 10 Dec: Joint's main balance £500.00, the Amex pot £120.00, the Buffer pot £300.00. */
  const checked = (document: BudgetDocument) => {
    let next = checkBuffer(document, joint, 50000, at('2026-12-10'))
    next = checkPotBalance(next, 'amex-pot', 12000, at('2026-12-10'))
    return checkPotBalance(next, 'buffer-pot', 30000, at('2026-12-10'))
  }
  const movedBoth = (document: BudgetDocument) => recordMove(sortZara(paid(document)), 'amex', ['zara', 'sainsburys'], at('2026-12-20', 10), 'm2')

  it('the buffer gets its money back; the Amex pot gains only December’s', () => {
    const document = movedBoth(checked(household()))
    expect(bufferBalance(document, '2026-12-20')!.balancePence).toBe(50000 - 8000 + 5000)
    expect(potBalance(document, 'amex-pot', '2026-12-20')).toMatchObject({ balancePence: 4510, since: [{ flow: 'set-aside', pence: 4510 }, { flow: 'paid', pence: -12000 }] })
    expect(moveTotal(document.card!.moves!.at(-1)!, 'amex-pot', document.card!)).toBe(4510)
    expect(potBalance(checkPotBalance(document, 'going-out', 10000, at('2026-12-19')), 'going-out', '2026-12-20').since).toEqual([{ flow: 'set-aside', pence: -5000 }])
  })

  it('a source pot gains a paid-back flow', () => {
    const document = movedBoth(setFrontSource(checked(household()), NOV, pot('buffer-pot')))
    expect(potBalance(document, 'buffer-pot', '2026-12-20')).toMatchObject({ balancePence: 30000 - 8000 + 5000, since: [{ flow: 'front', pence: -8000 }, { flow: 'paid-back', pence: 5000 }] })
  })

  it('Should hold, the November statement’s moved figure and settled don’t shift', () => {
    const document = movedBoth(checked(household()))
    expect(shouldHold(document, 'amex')).toBe(4510)
    expect(setAsideStatements(document, 'amex').find(row => row.statementKey === NOV)).toMatchObject({ movedPence: 12000, paidPence: 12000 })
    expect(statementSummary(document, NOV, '2026-12-20')!.settled).toBe(true)
    expect(decodeBudgetDocument(document)).not.toBeNull()
  })

  it('unticking Pay afterwards turns pay-backs into ordinary Amex pot moves (WP9)', () => {
    const document = setSettleTick(movedBoth(checked(household())), NOV, 'settle:pay', null, at('2026-12-21'))
    expect(potBalance(document, 'amex-pot', '2026-12-21')).toMatchObject({ balancePence: 12000 + 9510 })
    expect(bufferBalance(document, '2026-12-21')!.balancePence).toBe(50000)
  })
})

describe('Home', () => {
  const todo = (document: BudgetDocument) => homeInbox(document, { month: '2026-12', today: '2026-12-20', nameDestination: () => 'Pot' }).todo
  it('Set aside leaves the pay-back out, and Pay the buffer back follows it', () => {
    const rows = todo(sortZara(paid())).filter(row => row.kind === 'set-aside' || row.kind === 'pay-back')
    expect(rows.map(row => [row.title, row.meta, row.trailing])).toEqual([
      ['Set aside in the Amex pot', '1 transaction sorted since the last move', '£45.10'],
      ['Pay the buffer back', 'For the November bill · 1 transaction sorted · £30.00 still owed for 1 waiting', '£50.00'],
    ])
  })

  it('names a source pot, and goes once it’s paid back', () => {
    expect(todo(sortZara(paid(setFrontSource(household(), NOV, pot('buffer-pot'))))).find(row => row.kind === 'pay-back')!.title).toBe('Pay Pot back')
    expect(todo(recordMove(sortZara(paid()), 'amex', ['zara'], at('2026-12-20', 10), 'm2')).some(row => row.kind === 'pay-back')).toBe(false)
  })
})
