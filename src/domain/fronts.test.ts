import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { clearWaiting, markWaiting, restoreSort, sortTransaction } from './cardSorting'
import { setSettleTick, settleSteps, settleWithoutFinal, statementSummary } from './cardStatements'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { bufferBalance, checkBuffer } from './buffer'
import { frontOf, frontPlan, frontSourceFor, setFrontSource } from './fronts'
import type { BudgetDestination } from './monthlyBudget'
import { checkPotBalance, potBalance } from './potBalances'
import { recordMove } from './setAside'
import { billCover, setAsideCheck, shouldHold } from './setAsideCheck'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const joint: BudgetDestination = { kind: 'account', accountId: 'joint' }
const NOV = 'amex:2026-11-24', OCT = 'amex:2026-10-24'
const at = (date: string, hour = 9) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)
const tx = (id: string, date: string, amountPence: number, destination: BudgetDestination | null, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', personId: 'ada', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})
const askAda = { kind: 'person', personId: 'ada' } as const, discuss = { kind: 'discuss' } as const

/**
 * Ada and Ben. The Amex pot, Groceries, Going out and a Buffer pot sit in Monzo Joint; the buffer is Joint's main
 * balance. November's bill is £200.00: Tesco £120.00 (moved in), Zara £50.00 and Pizza £30.00 waiting.
 */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [
    { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' },
    { id: 'going-out', name: 'Going out', accountId: 'joint' }, { id: 'buffer-pot', name: 'Buffer', accountId: 'joint' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('tesco', '2026-11-03', 12000, pot('groceries')),
      tx('zara', '2026-11-10', 5000, null),
      tx('pizza', '2026-11-15', 3000, null),
      tx('oct', '2026-10-10', 1500, null, { statementKey: OCT }),
    ],
  }
  let next = recordMove(document, 'amex', ['tesco'], at('2026-11-20'), 'm1')
  next = markWaiting(next, 'zara', askAda, 'Which jumper?', at('2026-11-21'))
  next = markWaiting(next, 'pizza', discuss, undefined, at('2026-11-21'))
  return settleWithoutFinal(next, NOV, at('2026-11-30'))
}
const pay = (document: BudgetDocument, when = at('2026-12-18')) => setSettleTick(document, NOV, 'settle:pay', 20000, when)

describe('what the buffer would cover (W3, W11)', () => {
  it('is every waiting row on the bill, from the buffer by default', () => {
    const plan = frontPlan(household(), NOV)!
    expect(plan.source).toEqual(joint)
    expect(plan.rows.map(row => [row.transaction.id, row.pence])).toEqual([['zara', 5000], ['pizza', 3000]])
    expect(plan.pence).toBe(8000)
  })

  it('leaves out anything a waiting row had moved before it was unsorted', () => {
    let document = sortTransaction(household(), 'zara', [{ amountPence: 5000, destination: pot('going-out') }], at('2026-11-22'))
    document = recordMove(document, 'amex', ['zara'], at('2026-11-22'), 'm2')
    document = markWaiting(restoreSort(document, 'zara', undefined), 'zara', askAda, undefined, at('2026-11-23'))
    // Zara's £50.00 is already in the Amex pot, so only Pizza is covered.
    expect(frontPlan(document, NOV)!.rows.map(row => row.transaction.id)).toEqual(['pizza'])
  })

  it('is nothing with nothing waiting, or on a statement that settles once', () => {
    expect(frontPlan(clearWaiting(clearWaiting(household(), 'zara'), 'pizza'), NOV)).toBeNull()
    const october = markWaiting(household(), 'oct', discuss, undefined, at('2026-11-21'))
    expect(frontPlan(october, OCT)).toBeNull()
    expect(frontSourceFor(october, OCT)).toBeUndefined()
  })

  it('can come from another pot or account, never the Amex pot; choosing the buffer clears the choice', () => {
    let document = setFrontSource(household(), NOV, pot('buffer-pot'))
    expect(frontSourceFor(document, NOV)).toEqual(pot('buffer-pot'))
    expect(document.card!.statements[NOV]!.frontSource).toEqual(pot('buffer-pot'))
    expect(setFrontSource(document, NOV, pot('amex-pot'))).toBe(document)
    document = setFrontSource(document, NOV, joint)
    expect(document.card!.statements[NOV]!.frontSource).toBeUndefined()
    expect(frontSourceFor(document, NOV)).toEqual(joint)
  })
})

describe('ticking Pay with rows waiting', () => {
  it('is allowed, records the Front and settles the bill (W11)', () => {
    const document = pay(household())
    expect(frontOf(document.card!, NOV)).toEqual({ id: `front:${NOV}`, cardId: 'amex', statementKey: NOV, at: at('2026-12-18').toISOString(), source: joint,
      transactions: [{ transactionId: 'zara', pence: 5000 }, { transactionId: 'pizza', pence: 3000 }] })
    expect(statementSummary(document, NOV, '2026-12-18')).toMatchObject({ waiting: 2, ready: true, settled: true })
    expect(document.card!.statements[NOV]!.settledAt).toBeDefined()
    expect(decodeBudgetDocument(document)).not.toBeNull()
  })

  it('records the chosen source', () => {
    expect(frontOf(pay(setFrontSource(household(), NOV, pot('buffer-pot'))).card!, NOV)!.source).toEqual(pot('buffer-pot'))
  })

  it('unticking removes the Front (WP9), and ticking again records it afresh', () => {
    let document = pay(household())
    document = setSettleTick(document, NOV, 'settle:pay', null, at('2026-12-18', 10))
    expect(document.card!.fronts).toBeUndefined()
    expect(document.card!.statements[NOV]!.settledAt).toBeUndefined()
    document = sortTransaction(document, 'pizza', [{ amountPence: 3000, destination: pot('going-out') }], at('2026-12-18', 11))
    document = pay(document, at('2026-12-18', 12))
    expect(frontOf(document.card!, NOV)!.transactions).toEqual([{ transactionId: 'zara', pence: 5000 }])
  })

  it('writes no Front when nothing is waiting', () => {
    expect(pay(clearWaiting(clearWaiting(household(), 'zara'), 'pizza')).card!.fronts).toBeUndefined()
  })

  it('leaves fronted rows out of the move step once they are sorted, so the bill stays settled', () => {
    let document = pay(household())
    document = sortTransaction(document, 'zara', [{ amountPence: 5000, destination: pot('going-out') }], at('2026-12-19'))
    expect(settleSteps(document, NOV)!.setAside).toMatchObject({ toMove: 0, toMovePence: 0 })
    expect(statementSummary(document, NOV, '2026-12-19')!.settled).toBe(true)
  })
})

describe('balances', () => {
  it('the Amex pot pays the bill less the Front, so its check still matches', () => {
    let document = checkPotBalance(household(), 'amex-pot', 12000, at('2026-11-20', 10))
    expect(setAsideCheck(document, 'amex', '2026-12-18')!.state).toBe('matches')
    document = pay(document)
    expect(potBalance(document, 'amex-pot', '2026-12-18')).toMatchObject({ balancePence: 0, since: [{ flow: 'paid', pence: -12000 }] })
    expect(shouldHold(document, 'amex')).toBe(0)
    expect(setAsideCheck(document, 'amex', '2026-12-18')!.state).toBe('matches')
  })

  it('a buffer that is an account’s main balance pays the Front', () => {
    let document = checkBuffer(household(), joint, 50000, at('2026-12-10'))
    document = pay(document)
    expect(bufferBalance(document, '2026-12-18')!.balancePence).toBe(42000)
    // Unticking Pay puts it back.
    expect(bufferBalance(setSettleTick(document, NOV, 'settle:pay', null, at('2026-12-18', 10)), '2026-12-18')!.balancePence).toBe(50000)
  })

  it('a source pot pays the Front', () => {
    let document = checkPotBalance(household(), 'buffer-pot', 30000, at('2026-12-10'))
    document = pay(setFrontSource(document, NOV, pot('buffer-pot')))
    expect(potBalance(document, 'buffer-pot', '2026-12-18')).toMatchObject({ balancePence: 22000, since: [{ flow: 'front', pence: -8000 }] })
  })

  it('before Pay, the Amex pot only has to cover the bill less what’s waiting', () => {
    const document = checkPotBalance(household(), 'amex-pot', 12000, at('2026-11-20', 10))
    expect(billCover(document, NOV, '2026-12-18')).toEqual({ billPence: 20000, waitingPence: 8000, availablePence: 12000, coverPence: 0 })
  })
})

describe('validation', () => {
  const paid = () => pay(household())
  const withFront = (change: object) => { const document = paid(); return { ...document, card: { ...document.card!, fronts: [{ ...document.card!.fronts![0]!, ...change }] } } }
  it('rejects a Front for an unknown row, card or source, or two on one statement', () => {
    expect(decodeBudgetDocument(withFront({ transactions: [{ transactionId: 'nope', pence: 100 }] }))).toBeNull()
    expect(decodeBudgetDocument(withFront({ transactions: [] }))).toBeNull()
    expect(decodeBudgetDocument(withFront({ cardId: 'visa' }))).toBeNull()
    expect(decodeBudgetDocument(withFront({ source: pot('nope') }))).toBeNull()
    const document = paid()
    expect(decodeBudgetDocument({ ...document, card: { ...document.card!, fronts: [...document.card!.fronts!, { ...document.card!.fronts![0]!, id: 'other' }] } })).toBeNull()
  })

  it('rejects a chosen source that isn’t a pot or account', () => {
    const document = setFrontSource(household(), NOV, pot('buffer-pot'))
    const statements = { ...document.card!.statements, [NOV]: { ...document.card!.statements[NOV]!, frontSource: pot('nope') } }
    expect(decodeBudgetDocument({ ...document, card: { ...document.card!, statements } })).toBeNull()
  })
})
