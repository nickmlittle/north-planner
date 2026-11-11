import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { allSettleSteps, paymentMatchingPay, setSettleTick, settleSteps, settleWithoutFinal, statementKeys, statementSummary } from './cardStatements'
import type { BudgetDestination } from './monthlyBudget'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const KEY = 'amex:2026-11-24'
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: KEY, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})

/** Board 5's October statement, on the real 25th–24th dates. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'immy', name: 'Immy' }, { id: 'nick', name: 'Nick' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Joint Monzo', provider: 'Monzo', ownerPersonIds: ['immy', 'nick'] },
    { id: 'nick-own', name: 'Nick', provider: 'Monzo', ownerPersonIds: ['nick'] },
    { id: 'immy-own', name: 'Immy', provider: 'Monzo', ownerPersonIds: ['immy'] },
  ]
  document.budget.pots = [
    { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' },
    { id: 'immy-treats', name: 'Treats', accountId: 'immy-own' }, { id: 'car', name: 'Car', accountId: 'immy-own' },
    { id: 'nick-treats', name: 'Treats', accountId: 'nick-own' }, { id: 'fuel', name: 'Fuel', accountId: 'nick-own' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    transactions: [
      tx('2026-10-26', pot('immy-treats'), 18675), tx('2026-10-27', pot('car'), 7130), tx('2026-10-28', pot('nick-treats'), 14320), tx('2026-10-29', pot('fuel'), 6410),
      tx('2026-10-30', pot('groceries'), 51240), tx('2026-11-01', pot('bills'), 8600), tx('2026-11-02', pot('eating'), 12000), tx('2026-11-03', { kind: 'account', accountId: 'joint' }, 9500),
      tx('2026-11-08', null, -50000, { kind: 'payment', description: 'PAYMENT RECEIVED' }),
    ],
  }
  return document
}

describe('settle-up steps', () => {
  it('moves each pot’s share out, sends each account’s share to Joint Monzo, then pays the total', () => {
    const plan = settleSteps(household(), KEY)!
    expect(plan.accounts.map(account => [account.accountId, account.sharePence, account.steps.map(step => `${step.key} ${step.amountPence}`)])).toEqual([
      ['immy-own', 25805, ['settle:out:car 7130', 'settle:out:immy-treats 18675', 'settle:send:immy-own 25805']],
      ['nick-own', 20730, ['settle:out:fuel 6410', 'settle:out:nick-treats 14320', 'settle:send:nick-own 20730']],
      ['joint', 81340, ['settle:out:bills 8600', 'settle:out:eating 12000', 'settle:out:groceries 51240']],
    ])
    expect(plan.accounts[2]!.oneOffsPence).toBe(9500)
    expect(plan.pay).toEqual({ key: 'settle:pay', kind: 'pay', accountId: 'joint', amountPence: 127875 })
    // The steps add up to the bill: what reaches Joint Monzo, plus what's already there.
    const sends = plan.accounts.flatMap(account => account.steps).filter(step => step.kind === 'send').reduce((sum, step) => sum + step.amountPence, 0)
    const jointOuts = plan.accounts[2]!.steps.reduce((sum, step) => sum + step.amountPence, 0)
    expect(sends + jointOuts + plan.accounts[2]!.oneOffsPence).toBe(plan.totalPence)
  })

  it('reverses a pot whose refunds outweigh its spend, and returns money to an account that’s owed', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-04', pot('car'), -20000), tx('2026-11-04', pot('groceries'), -60000))
    const plan = settleSteps(document, KEY)!
    expect(plan.accounts[0]!.steps.map(step => `${step.kind} ${step.potId ?? step.accountId} ${step.amountPence}`)).toEqual(['into car 12870', 'out immy-treats 18675', 'send immy-own 5805'])
    expect(plan.accounts[2]!.steps.map(step => `${step.kind} ${step.potId} ${step.amountPence}`)).toEqual(['out bills 8600', 'out eating 12000', 'into groceries 8760'])
    document.card!.transactions.push(tx('2026-11-04', pot('fuel'), -30000))
    expect(settleSteps(document, KEY)!.accounts[1]!.steps.at(-1)).toEqual({ key: 'settle:return:nick-own', kind: 'return', accountId: 'joint', potId: undefined, amountPence: 9270 })
  })
})

describe('statement state', () => {
  it('is open until it closes, then ready once complete and sorted, and settled when every step is ticked', () => {
    let document = household()
    expect(statementSummary(document, KEY, '2026-11-20')).toMatchObject({ open: true, ready: false, totalPence: 127875, transactions: 8, toSort: 0, closeDate: '2026-11-24', from: '2026-10-25', dueDate: '2026-12-19', done: 0, steps: 10 })
    expect(statementSummary(document, KEY, '2026-11-26')).toMatchObject({ open: false, complete: false, ready: false })
    document = settleWithoutFinal(document, KEY, new Date('2026-11-26T09:00:00Z'))
    expect(statementSummary(document, KEY, '2026-11-26')).toMatchObject({ complete: true, ready: true, settled: false })
    document.card!.transactions.push(tx('2026-11-20', null, 500))
    expect(statementSummary(document, KEY, '2026-11-26')).toMatchObject({ toSort: 1, ready: false })
    document.card!.transactions.pop()
    const plan = settleSteps(document, KEY)!
    const at = new Date('2026-11-30T09:00:00Z')
    for (const step of allSettleSteps(plan)) document = setSettleTick(document, KEY, step.key, step.amountPence, at)
    expect(statementSummary(document, KEY, '2026-11-30')).toMatchObject({ done: 10, settled: true })
    expect(document.card!.statements[KEY]!.settledAt).toBe('2026-11-30T09:00:00.000Z')
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
    // A late refund changes Car's share: the step shows as changed and the statement is no longer settled.
    document.card!.transactions.push(tx('2026-11-21', pot('car'), -1000))
    expect(statementSummary(document, KEY, '2026-12-01')).toMatchObject({ settled: false, done: 7 })
    document = setSettleTick(document, KEY, 'settle:pay', null, at)
    expect(document.card!.statements[KEY]!.settledAt).toBeUndefined()
  })

  it('splits the statement across the months its transactions count in, and checks Amex’s summary', () => {
    const document = household()
    document.card!.statements[KEY] = { cardId: 'amex', closeDate: '2026-11-24', amexSummary: { previousPence: 0, paymentsAndCreditsPence: -50000, chargesPence: 128000, totalPence: 78000, at: 'x' } }
    const summary = statementSummary(document, KEY, '2026-11-26')!
    expect(summary.byMonth).toEqual([{ month: '2026-10', pence: 97775 }, { month: '2026-11', pence: 30100 }])
    expect(summary.summaryCheck).toEqual({ matches: false, missingChargesPence: 125, missingCreditsPence: 0 })
    expect(summary.payments.map(row => row.amountPence)).toEqual([-50000])
  })

  it('offers to tick Pay when a payment row matches it, but never ticks it', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-23', null, -127875, { kind: 'payment' }))
    const summary = statementSummary(document, KEY, '2026-11-26')!
    expect(paymentMatchingPay(summary, settleSteps(document, KEY))?.amountPence).toBe(-127875)
    expect(summary.done).toBe(0)
  })

  it('lists statements newest first', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-10-01', null, 100, { statementKey: 'amex:2026-10-24' }))
    document.card!.statements['amex:2026-12-24'] = { cardId: 'amex', closeDate: '2026-12-24' }
    expect(statementKeys(document.card!)).toEqual(['amex:2026-12-24', KEY, 'amex:2026-10-24'])
  })
})

describe('settling up from the Amex pot', () => {
  function withPot() {
    const document = household()
    document.budget.pots.push({ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' })
    document.card!.cards[0]!.setAside = { potId: 'amex-pot', fromCloseDate: '2026-11-24' }
    return document
  }

  it('moves the rest into the pot, then pays the card from it', async () => {
    const { recordMove } = await import('./setAside')
    let document = withPot()
    const plan = settleSteps(document, KEY)!
    expect(plan.accounts).toEqual([])
    expect(plan.setAside).toEqual({ potId: 'amex-pot', toMovePence: 127875, toMove: 8 })
    expect(plan.pay).toMatchObject({ kind: 'pay', accountId: 'joint', potId: 'amex-pot', amountPence: 127875 })
    expect(allSettleSteps(plan).map(step => step.key)).toEqual(['settle:move', 'settle:pay'])
    document = settleWithoutFinal(document, KEY, new Date('2026-11-26T09:00:00Z'))
    document = setSettleTick(document, KEY, 'settle:pay', 127875, new Date('2026-12-01T09:00:00Z'))
    expect(statementSummary(document, KEY, '2026-12-01')).toMatchObject({ done: 1, steps: 2, settled: false })
    document = recordMove(document, 'amex', document.card!.transactions.map(row => row.id), new Date('2026-12-02T09:00:00Z'), 'm1')
    expect(statementSummary(document, KEY, '2026-12-02')).toMatchObject({ done: 2, steps: 2, settled: true })
  })

  it('statements before the pot keep settling once', () => {
    const document = withPot()
    document.card!.cards[0]!.setAside = { potId: 'amex-pot', fromCloseDate: '2026-12-24' }
    expect(settleSteps(document, KEY)!.setAside).toBeUndefined()
    expect(settleSteps(document, KEY)!.accounts).toHaveLength(3)
  })
})

it('records when a move into the Amex pot finishes settling a statement', async () => {
  const { recordMove } = await import('./setAside')
  const { refreshSettled } = await import('./cardStatements')
  let document = household()
  document.budget.pots.push({ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' })
  document.card!.cards[0]!.setAside = { potId: 'amex-pot', fromCloseDate: '2026-11-24' }
  document = settleWithoutFinal(document, KEY, new Date('2026-11-26T09:00:00Z'))
  document = setSettleTick(document, KEY, 'settle:pay', 127875, new Date('2026-12-01T09:00:00Z'))
  expect(document.card!.statements[KEY]!.settledAt).toBeUndefined()
  const moved = new Date('2026-12-02T09:00:00Z')
  document = refreshSettled(recordMove(document, 'amex', document.card!.transactions.map(row => row.id), moved, 'm1'), KEY, moved)
  expect(document.card!.statements[KEY]!.settledAt).toBe(moved.toISOString())
})
