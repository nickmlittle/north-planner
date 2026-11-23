import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, removeAdult, type BudgetDocument } from './budgetDocument'
import { billSum } from './billSum'
import { sortRefund } from './cardRefunds'
import { addRule, clearWaiting, markWaiting, restoreSort, sortTransaction, transactionsToSort, transactionsWaiting, waitingRows } from './cardSorting'
import { monthSpending } from './cardSpending'
import { settleWithoutFinal, statementSummary } from './cardStatements'
import { emptyCardTracker, WAITING_NOTE_MAX, type CardTransaction, type WaitingMark } from './cardTracker'
import { linkRefund } from './expectingBack'
import { homeInbox } from './homeInbox'
import { closeMonthPlan, markAllIn } from './monthStages'
import type { BudgetDestination } from './monthlyBudget'
import { recordMove, toMove } from './setAside'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const NOV = 'amex:2026-11-24'
const now = new Date('2026-11-23T10:00:00Z'), later = new Date('2026-11-25T10:00:00Z')
const tx = (id: string, date: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', personId: 'ada', statementKey: NOV, importedAt: 'x', ...overrides,
})
const sorted = (destination: BudgetDestination, amountPence: number) => ({ sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } })
const askAda = { kind: 'person', personId: 'ada' } as const, askBen = { kind: 'person', personId: 'ben' } as const, discuss = { kind: 'discuss' } as const

/** Ada's card ends 41001 and Ben's 41009. Ben is listed first in the household, Ada first on the card. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ben', name: 'Ben' }, { id: 'ada', name: 'Ada' }, { id: 'cy', name: 'Cy' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'going-out', name: 'Going out', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41009', personId: 'ben' }, { suffix: '41001', personId: 'ada' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('tesco', '2026-11-03', 6000, sorted(pot('groceries'), 6000)),
      tx('zara', '2026-11-10', 4999),
      tx('boots', '2026-11-12', 2345),
      tx('amazon', '2026-11-14', 3120),
      tx('pizza', '2026-11-15', 1800),
      tx('paid', '2026-11-16', -5000, { kind: 'payment' }),
    ],
    imports: [{ at: '2026-12-04T08:00:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: NOV, rows: 6, added: 6, skipped: 0, sortedByRules: 0, latestDate: '2026-11-16', matchesSummary: true }],
  }
  return document
}
const row = (document: BudgetDocument, id: string) => document.card!.transactions.find(item => item.id === id)!

/** Zara and Boots ask Ada, Amazon is to discuss; Pizza stays to sort. */
function parked(): BudgetDocument {
  let document = household()
  document = markWaiting(document, 'zara', askAda, 'Which jumper was it?', now)
  document = markWaiting(document, 'boots', askAda, undefined, now)
  return markWaiting(document, 'amazon', discuss, '  Order 204-77,\n gift or ours? ', now)
}

describe('the Waiting mark (W4–W6)', () => {
  it('marks a row in To sort with a reason and a trimmed one-line note, and it stays valid', () => {
    const document = parked()
    expect(row(document, 'zara').waiting).toEqual({ on: askAda, note: 'Which jumper was it?', at: now.toISOString() })
    expect(row(document, 'boots').waiting).toEqual({ on: askAda, at: now.toISOString() })
    expect(row(document, 'amazon').waiting!.note).toBe('Order 204-77, gift or ours?')
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).not.toBeNull()
  })

  it('changing the mark keeps when it was first marked (WP5)', () => {
    const changed = markWaiting(parked(), 'zara', discuss, '', later)
    expect(row(changed, 'zara').waiting).toEqual({ on: discuss, at: now.toISOString() })
  })

  it('only marks a purchase or refund in To sort, for an adult, with a note up to 140 characters (WP4, WP6)', () => {
    const document = household()
    expect(markWaiting(document, 'tesco', askAda, '', now)).toBe(document)
    expect(markWaiting(document, 'paid', askAda, '', now)).toBe(document)
    expect(markWaiting(document, 'zara', { kind: 'person', personId: 'stranger' }, '', now)).toBe(document)
    expect(markWaiting(document, 'zara', askAda, 'x'.repeat(WAITING_NOTE_MAX + 1), now)).toBe(document)
    expect(row(markWaiting(document, 'zara', askAda, 'x'.repeat(WAITING_NOTE_MAX), now), 'zara').waiting!.note).toHaveLength(WAITING_NOTE_MAX)
  })

  it('Back to To sort clears it', () => {
    const document = clearWaiting(parked(), 'zara')
    expect(row(document, 'zara').waiting).toBeUndefined()
    expect(transactionsToSort(document.card!).map(item => item.id)).toEqual(['pizza', 'zara'])
  })

  it.each<[string, (document: BudgetDocument) => unknown]>([
    ['with a sort', document => { const zara = row(document, 'zara'); zara.sort = sorted(pot('groceries'), zara.amountPence).sort }],
    ['on a payment', document => { row(document, 'paid').waiting = { on: discuss, at: 'x' } }],
    ['for someone not in the household', document => { row(document, 'zara').waiting = { on: { kind: 'person', personId: 'stranger' }, at: 'x' } }],
    ['with a note over 140 characters', document => { row(document, 'zara').waiting = { on: discuss, note: 'x'.repeat(WAITING_NOTE_MAX + 1), at: 'x' } }],
    ['with no reason', document => { row(document, 'zara').waiting = { at: 'x' } as unknown as WaitingMark }],
    ['with an unknown reason', document => { row(document, 'zara').waiting = { on: { kind: 'later' }, at: 'x' } as unknown as WaitingMark }],
  ])('makes the document invalid %s', (_, spoil) => {
    const document = JSON.parse(JSON.stringify(parked())) as BudgetDocument
    spoil(document)
    expect(decodeBudgetDocument(document)).toBeNull()
  })

  it('keeps an adult someone is waiting on', () => {
    const document = markWaiting(household(), 'zara', { kind: 'person', personId: 'cy' }, '', now)
    expect(removeAdult(document, 'cy')).toBe(document)
    expect(removeAdult(household(), 'cy').household.adults.map(person => person.id)).toEqual(['ben', 'ada'])
  })
})

describe('every write that sorts a row drops its mark', () => {
  it('sorting by hand', () => {
    const document = sortTransaction(parked(), 'zara', [{ amountPence: 4999, destination: pot('going-out') }], later)
    expect(row(document, 'zara')).toMatchObject({ sort: { by: 'person' } })
    expect(row(document, 'zara').waiting).toBeUndefined()
    expect(decodeBudgetDocument(document)).not.toBeNull()
  })

  it('restoring a sort, and Undo puts a waiting row back in Waiting', () => {
    const before = row(parked(), 'zara')
    const placed = restoreSort(parked(), 'zara', sorted(pot('going-out'), 4999).sort)
    expect(row(placed, 'zara').waiting).toBeUndefined()
    expect(row(restoreSort(placed, 'zara', undefined, before.waiting), 'zara')).toEqual(before)
    expect(row(restoreSort(placed, 'zara', undefined), 'zara').waiting).toBeUndefined()
  })

  it('sorting and linking a refund', () => {
    let document = household()
    document.card!.transactions.push(tx('return', '2026-11-18', -1500))
    document = markWaiting(document, 'return', discuss, '', now)
    const back = sortRefund(document, 'return', 'tesco', { lineIndex: 0 }, later)
    expect(row(back, 'return')).toMatchObject({ refundOf: { transactionId: 'tesco' }, sort: { lines: [{ destination: pot('groceries') }] } })
    expect(row(back, 'return').waiting).toBeUndefined()
    const order = { ...document, card: { ...document.card!, transactions: document.card!.transactions.map(item => item.id === 'tesco' ? { ...item, sort: { lines: [{ amountPence: 4500, destination: pot('groceries') }, { amountPence: 1500, destination: pot('groceries'), expectingBack: true as const }], by: 'person' as const, at: 'x' } } : item) } }
    const linked = linkRefund(order, 'return', 'tesco', true, later)
    expect(row(linked, 'return').sort).toBeDefined()
    expect(row(linked, 'return').waiting).toBeUndefined()
  })

  it('a rule never sorts a waiting row, even one made later (WP7)', () => {
    const { document, alsoSorted } = addRule(parked(), { contains: 'ZARA', destination: pot('going-out') }, later)
    expect(alsoSorted).toBe(0)
    expect(row(document, 'zara')).toMatchObject({ waiting: { on: askAda } })
    expect(row(document, 'zara').sort).toBeUndefined()
    expect(addRule(household(), { contains: 'ZARA', destination: pot('going-out') }, later).alsoSorted).toBe(1)
  })
})

describe('To sort and Waiting', () => {
  it('To sort leaves Waiting rows out', () => {
    expect(transactionsToSort(parked().card!).map(item => item.id)).toEqual(['pizza'])
  })

  it('groups by reason: cardholders first, then the household, then To discuss; newest first in each', () => {
    let document = parked()
    document = markWaiting(document, 'pizza', askBen, '', now)
    const groups = transactionsWaiting(document)
    expect(groups.map(group => group.key)).toEqual(['person:ben', 'person:ada', 'discuss'])
    expect(groups.map(group => group.rows.map(item => item.id))).toEqual([['pizza'], ['boots', 'zara'], ['amazon']])
    expect(groups.map(group => group.totalPence)).toEqual([1800, 2345 + 4999, 3120])
    // An adult with no card comes after the cardholders.
    const cy = markWaiting(document, 'boots', { kind: 'person', personId: 'cy' }, '', now)
    expect(transactionsWaiting(cy).map(group => group.key)).toEqual(['person:ben', 'person:ada', 'person:cy', 'discuss'])
    expect(waitingRows(cy).map(item => item.id)).toEqual(['pizza', 'zara', 'boots', 'amazon'])
  })

  it('counts in no pot, pace or move (W1)', () => {
    const document = parked()
    const spent = monthSpending(document, '2026-11', '2026-11-23').rows.reduce((sum, item) => sum + item.spentPence, 0)
    expect(spent).toBe(monthSpending(household(), '2026-11', '2026-11-23').rows.reduce((sum, item) => sum + item.spentPence, 0))
    expect(toMove(document, 'amex', undefined, '2026-11-23').map(item => item.transaction.id)).toEqual(['tesco'])
  })
})

describe('the bill (W1)', () => {
  it('Bill = In the Amex pot + To move + To sort + Expecting back + Waiting', () => {
    const document = parked()
    const bill = billSum(document, NOV, '2026-11-23')!
    expect(bill).toMatchObject({ toSort: 1, toSortPence: 1800, waiting: 3, waitingPence: 4999 + 2345 + 3120, toMovePence: 6000, inPotPence: 0, covered: false })
    expect(bill.inPotPence + bill.toMovePence + bill.toSortPence + bill.expectingBackPence + bill.waitingPence).toBe(bill.billPence)
  })

  it('a waiting row that had moved before counts only what it still owes, and the parts still add up', () => {
    let document = sortTransaction(household(), 'zara', [{ amountPence: 4999, destination: pot('going-out') }], now)
    document = recordMove(document, 'amex', toMove(document, 'amex', undefined, '2026-11-23').map(item => item.transaction.id), now, 'm1')
    document = markWaiting(restoreSort(document, 'zara', undefined), 'zara', askAda, '', now)
    const bill = billSum(document, NOV, '2026-11-23')!
    expect(bill.waitingPence).toBe(0)
    expect(bill.inPotPence + bill.toMovePence + bill.toSortPence + bill.expectingBackPence + bill.waitingPence).toBe(bill.billPence)
  })

  it('is covered only when nothing is waiting', () => {
    let document = household()
    for (const id of ['zara', 'boots', 'amazon', 'pizza']) document = sortTransaction(document, id, [{ amountPence: row(document, id).amountPence, destination: pot('going-out') }], now)
    document = recordMove(document, 'amex', toMove(document, 'amex', undefined, '2026-11-30').map(item => item.transaction.id), now, 'm1')
    expect(billSum(document, NOV, '2026-11-30')!.covered).toBe(true)
    const waiting = markWaiting(restoreSort(document, 'pizza', undefined), 'pizza', discuss, '', now)
    expect(billSum(waiting, NOV, '2026-11-30')).toMatchObject({ covered: false, waiting: 1, waitingPence: 0 })
  })
})

describe('Close and settle up (W10, WP2)', () => {
  const allSorted = () => {
    let document = household()
    for (const id of ['zara', 'boots', 'amazon', 'pizza']) document = sortTransaction(document, id, [{ amountPence: row(document, id).amountPence, destination: pot('going-out') }], now)
    return document
  }

  it('Close stays blocked until nothing is waiting', () => {
    expect(closeMonthPlan(allSorted(), '2026-11', '2026-12-04')!.readiness).toMatchObject({ toSort: 0, waiting: 0, canClose: true })
    const waiting = markWaiting(restoreSort(allSorted(), 'pizza', undefined), 'pizza', discuss, '', now)
    const plan = closeMonthPlan(waiting, '2026-11', '2026-12-04')!
    expect(plan.readiness).toMatchObject({ toSort: 0, waiting: 1, canClose: false })
    expect(closeMonthPlan(markAllIn(waiting, '2026-11', later), '2026-11', '2026-12-04')!.readiness.canClose).toBe(false)
    expect(closeMonthPlan(clearWaiting(waiting, 'pizza'), '2026-11', '2026-12-04')!.readiness).toMatchObject({ toSort: 1, waiting: 0, canClose: false })
  })

  it('Home says November is all sorted only when nothing is waiting', () => {
    const done = (document: BudgetDocument) => homeInbox(document, { month: '2026-12', today: '2026-12-04' }).done.some(item => item.title === 'All November transactions sorted')
    expect(done(allSorted())).toBe(true)
    expect(done(markWaiting(restoreSort(allSorted(), 'pizza', undefined), 'pizza', discuss, '', now))).toBe(false)
  })

  it('a statement with rows waiting isn’t ready to settle, and says what’s waiting', () => {
    const complete = settleWithoutFinal(allSorted(), NOV, later)
    expect(statementSummary(complete, NOV, '2026-12-04')).toMatchObject({ toSort: 0, waiting: 0, ready: true })
    const waiting = markWaiting(restoreSort(complete, 'pizza', undefined), 'pizza', discuss, '', now)
    const summary = statementSummary(waiting, NOV, '2026-12-04')!
    expect(summary).toMatchObject({ toSort: 0, waiting: 1, ready: false, settled: false })
  })
})
