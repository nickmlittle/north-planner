import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, validCardTracker, type CardTransaction, type SplitLine } from './cardTracker'
import { billSum } from './billSum'
import { monthSpending } from './cardSpending'
import { matchRefundOnImport, sortRefund } from './cardRefunds'
import { comingBackAgain, expectingBack, heldInPot, heldOut, heldPurchases, linkedOrder, linkRefund, notComingBack, ordersWithReturns, restoreTransactions } from './expectingBack'
import type { BudgetDestination } from './monthlyBudget'
import { potBalance } from './potBalances'
import { recordMove, toMove } from './setAside'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const DEC = 'amex:2026-12-24', JAN = 'amex:2027-01-24'
const OPEN = '2026-12-01', CLOSED = '2026-12-28'
const now = new Date('2026-12-01T10:00:00Z')

// The ASOS order (plan §6): £148.00 charged; Ada keeps £69.00, and two items (£45.00 + £34.00) go back.
const asosLines: SplitLine[] = [
  { amountPence: 6900, destination: pot('going-out'), item: 'Jeans' },
  { amountPence: 4500, destination: pot('going-out'), item: 'Coat', expectingBack: true },
  { amountPence: 3400, destination: pot('going-out'), item: 'Boots', expectingBack: true },
]
const tx = (id: string, date: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: 'ASOS', merchant: 'ASOS', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: DEC, importedAt: 'x', ...overrides,
})
const asos = () => tx('asos', '2026-11-26', 14800, { sort: { lines: asosLines.map(line => ({ ...line })), by: 'person', at: '2026-11-26T12:00:00Z' } })
const heldRefund = (id: string, date: string, pence: number, statementKey = DEC, item = 'Coat') => tx(id, date, -pence, { statementKey, refundOf: { transactionId: 'asos', lineIndex: 1 }, sort: { lines: [{ amountPence: -pence, destination: pot('going-out'), item, expectingBack: true }], by: 'rule', at: 'x' } })

function household(...extra: CardTransaction[]): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'going-out', name: 'Going out', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [asos(), ...extra],
  }
  return document
}
const spent = (document: BudgetDocument, month: string, today: string) => monthSpending(document, month, today).rows.find(row => row.key === 'pot:going-out')?.spentPence ?? 0
const moving = (document: BudgetDocument, today: string) => toMove(document, 'amex', undefined, today).map(row => [row.transaction.id, row.pence])
const parts = (sum: NonNullable<ReturnType<typeof billSum>>) => sum.inPotPence + sum.toMovePence + sum.toSortPence + sum.expectingBackPence

describe('held lines while the bill is open (D11)', () => {
  it('are not spent, not moved, and are the bill’s fifth part', () => {
    const document = household()
    expect(spent(document, '2026-11', OPEN)).toBe(6900)
    expect(moving(document, OPEN)).toEqual([['asos', 6900]])
    const sum = billSum(document, DEC, OPEN)!
    expect(sum).toMatchObject({ expectingBackPence: 7900, toMovePence: 6900, billPence: 14800 })
    expect(parts(sum)).toBe(sum.billPence)
    expect(heldInPot(document.card!, 'going-out', OPEN)).toBe(7900)
  })

  it('stay in the pot: they are not waiting to move', () => {
    const document = household(tx('pizza', '2026-11-27', 2000, { description: 'PIZZA', merchant: 'PIZZA', sort: { lines: [{ amountPence: 2000, destination: pot('going-out') }], by: 'person', at: 'x' } }))
    expect(potBalance(document, 'going-out', OPEN).waitingPence).toBe(8900)
    expect(potBalance(document, 'going-out', CLOSED).waitingPence).toBe(16800)
  })

  it('leave the money already moved alone: ticking Back after a move sends it back out of the Amex pot', () => {
    const plain = household()
    plain.card!.transactions = [{ ...asos(), sort: { lines: [{ amountPence: 14800, destination: pot('going-out') }], by: 'person', at: 'x' } }]
    const moved = recordMove(plain, 'amex', ['asos'], now, 'm1')
    moved.card!.transactions = [asos()]
    expect(moving(moved, OPEN)).toEqual([['asos', -7900]])
  })
})

describe('refunds for held lines', () => {
  it('cancel them out on the same bill: nothing is spent or moved', () => {
    const document = household(heldRefund('back', '2026-12-05', 7900))
    expect(spent(document, '2026-12', OPEN)).toBe(0)
    expect(moving(document, OPEN)).toEqual([['asos', 6900]])
    expect(billSum(document, DEC, OPEN)!.expectingBackPence).toBe(0)
    expect(expectingBack(document.card!, OPEN)).toEqual([])
    // Still nothing after the bill closes: a cancelled pair never moves.
    expect(moving(document, CLOSED)).toEqual([['asos', 6900]])
    expect(spent(document, '2026-11', CLOSED)).toBe(6900)
  })

  it('leave the rest held when only part comes back (£79.00 held, £47.00 refunded: £32.00 still expecting back)', () => {
    const document = household(heldRefund('back', '2026-12-05', 4700))
    const [held] = heldPurchases(document.card!, OPEN)
    expect(held).toMatchObject({ heldPence: 7900, backPence: 4700, outPence: 3200, open: true })
    const sum = billSum(document, DEC, OPEN)!
    expect(sum.expectingBackPence).toBe(3200)
    expect(parts(sum)).toBe(sum.billPence)
    expect(spent(document, '2026-12', OPEN)).toBe(0)
  })

  it('are left to sort on import while the shop has returns out: North never guesses the order', () => {
    const document = household()
    const imported = matchRefundOnImport(document.card!, tx('r1', '2026-12-05', -7900), 'now')
    expect(imported.refundOf).toBeUndefined()
    expect(imported.sort).toBeUndefined()
  })

  it('go to the kept items as today once nothing is expected back', () => {
    const document = household(heldRefund('back', '2026-12-05', 7900))
    const matched = matchRefundOnImport(document.card!, tx('r', '2026-12-08', -6900), 'now')
    expect(matched.sort!.lines).toEqual([{ amountPence: -6900, destination: pot('going-out') }])
  })

  it('are marked when someone sorts a refund back to a held line', () => {
    const document = household(tx('r', '2026-12-05', -4500))
    const sorted = sortRefund(document, 'r', 'asos', { lineIndex: 1 }, now)
    expect(sorted.card!.transactions.find(row => row.id === 'r')!.sort!.lines).toEqual([{ amountPence: -4500, destination: pot('going-out'), item: 'Coat', expectingBack: true }])
    expect(heldPurchases(sorted.card!, OPEN)[0]!.outPence).toBe(3400)
  })
})

describe('settle up', () => {
  it('moves what is still held once the bill has closed, and counts it as spending', () => {
    const document = household(heldRefund('back', '2026-12-05', 4700))
    expect(moving(document, CLOSED)).toEqual([['asos', 10100]])
    expect(spent(document, '2026-11', CLOSED)).toBe(10100)
    const sum = billSum(document, DEC, CLOSED)!
    expect(sum).toMatchObject({ expectingBackPence: 0, toMovePence: 10100, open: false })
    expect(parts(sum)).toBe(sum.billPence)
    // Still out (the item is on its way back), but the money has gone with the bill.
    expect(expectingBack(document.card!, CLOSED)[0]).toMatchObject({ outPence: 3200, open: false })
  })

  it('a refund after settle up is an ordinary refund: it moves back out of the Amex pot and clears the list', () => {
    const document = household(heldRefund('back', '2026-12-05', 4700), heldRefund('later', '2027-01-03', 3200, JAN, 'Boots'))
    const today = '2027-01-05'
    expect(moving(document, today)).toEqual([['later', -3200], ['asos', 10100]])
    expect(spent(document, '2027-01', today)).toBe(-3200)
    expect(expectingBack(document.card!, today)).toEqual([])
    expect(heldOut(document.card!, today).get('later')).toBeUndefined()
  })
})

describe('not coming back (P7)', () => {
  it('turns the held lines into spending, and can be undone', () => {
    const marked = notComingBack(household(), 'asos', now)
    expect(spent(marked, '2026-11', OPEN)).toBe(14800)
    expect(moving(marked, OPEN)).toEqual([['asos', 14800]])
    expect(expectingBack(marked.card!, OPEN)).toEqual([])
    const undone = comingBackAgain(marked, 'asos', now.toISOString())
    expect(spent(undone, '2026-11', OPEN)).toBe(6900)
  })

  it('keeps what a same-bill refund cancelled cancelled: only the rest counts as spending', () => {
    const marked = notComingBack(household(heldRefund('back', '2026-12-05', 4700)), 'asos', now)
    expect(spent(marked, '2026-11', OPEN)).toBe(10100)
    expect(spent(marked, '2026-12', OPEN)).toBe(0)
    expect(moving(marked, OPEN)).toEqual([['asos', 10100]])
  })
})

describe('the stored lines', () => {
  it('validate expectingBack and notComingBackAt like their neighbours', () => {
    const budget = household().budget, people = new Set(['ada', 'ben'])
    expect(validCardTracker(household().card, budget, people)).toBe(true)
    const marked = notComingBack(household(), 'asos', now)
    expect(validCardTracker(marked.card, budget, people)).toBe(true)
    const bad = household()
    bad.card!.transactions[0]!.sort!.lines[1] = { ...asosLines[1]!, expectingBack: false as unknown as true }
    expect(validCardTracker(bad.card, budget, people)).toBe(false)
  })
})

describe('linking a return to its order (health 9b)', () => {
  // A second order with a return out, so the refund has a choice.
  const boots = () => tx('boots', '2026-11-20', 5000, { description: 'BOOTS SHOP', merchant: 'BOOTS SHOP', sort: { lines: [{ amountPence: 5000, destination: pot('going-out'), item: 'Wellies', expectingBack: true }], by: 'person', at: 'x' } })

  it('offers orders with returns out: the same shop first, never ones dated after the refund', () => {
    const document = household(boots(), tx('later', '2026-12-10', 3000, { sort: { lines: [{ amountPence: 3000, destination: pot('going-out'), item: 'Hat', expectingBack: true }], by: 'person', at: 'x' } }))
    expect(ordersWithReturns(document.card!, tx('r', '2026-12-05', -5128), OPEN).map(row => row.purchase.id)).toEqual(['asos', 'boots'])
  })

  it('That’s everything back settles the order: the refund cancels what it covers, and the difference is spending', () => {
    // £79.00 ticked Back, £75.05 refunded (a 5% code): £3.95 counts as spending, nothing is left out.
    const document = linkRefund(household(tx('r', '2026-12-05', -7505)), 'r', 'asos', true, now)
    const refund = document.card!.transactions.find(row => row.id === 'r')!
    expect(refund.refundOf).toEqual({ transactionId: 'asos', lineIndex: 1 })
    expect(refund.sort!.lines).toEqual([
      { amountPence: -4500, destination: pot('going-out'), item: 'Coat', expectingBack: true },
      { amountPence: -3005, destination: pot('going-out'), item: 'Boots', expectingBack: true },
    ])
    expect(expectingBack(document.card!, OPEN)).toEqual([])
    expect(spent(document, '2026-11', OPEN)).toBe(6900 + 395)
    expect(spent(document, '2026-12', OPEN)).toBe(0)
    expect(moving(document, OPEN)).toEqual([['asos', 7295]])
    expect(moving(document, CLOSED)).toEqual([['asos', 7295]])
    expect(linkedOrder(document.card!, refund)?.id).toBe('asos')
    const sum = billSum(document, DEC, OPEN)!
    expect(sum.expectingBackPence).toBe(0)
    expect(parts(sum)).toBe(sum.billPence)
  })

  it('More to come leaves the rest expecting back, for the next refund', () => {
    const first = linkRefund(household(tx('r1', '2026-12-05', -4500), tx('r2', '2026-12-09', -3400)), 'r1', 'asos', false, now)
    expect(expectingBack(first.card!, OPEN)[0]!.outPence).toBe(3400)
    expect(ordersWithReturns(first.card!, first.card!.transactions.find(row => row.id === 'r2')!, OPEN).map(row => row.purchase.id)).toEqual(['asos'])
    const second = linkRefund(first, 'r2', 'asos', true, now)
    expect(second.card!.transactions.find(row => row.id === 'r2')!.sort!.lines).toEqual([{ amountPence: -3400, destination: pot('going-out'), item: 'Boots', expectingBack: true }])
    expect(expectingBack(second.card!, OPEN)).toEqual([])
    expect(spent(second, '2026-12', OPEN)).toBe(0)
  })

  it('sends a refund bigger than what was out back to the kept items as an ordinary refund', () => {
    const document = linkRefund(household(tx('r', '2026-12-05', -9000)), 'r', 'asos', true, now)
    expect(document.card!.transactions.find(row => row.id === 'r')!.sort!.lines.map(line => [line.amountPence, !!line.expectingBack])).toEqual([[-4500, true], [-3400, true], [-1100, false]])
    expect(spent(document, '2026-12', OPEN)).toBe(-1100)
  })

  it('relinks a refund already sorted the old way, whenever the Back ticks came', () => {
    // The live case: refunds sorted whole to the pot, then the items ticked Back afterwards.
    const refund = tx('r', '2026-12-05', -7900, { refundOf: { transactionId: 'boots' }, sort: { lines: [{ amountPence: -7900, destination: pot('going-out') }], by: 'person', at: 'x' } })
    const before = household(boots(), refund)
    expect(spent(before, '2026-12', OPEN)).toBe(-7900)
    const linked = linkRefund(before, 'r', 'asos', true, now)
    expect(spent(linked, '2026-12', OPEN)).toBe(0)
    expect(expectingBack(linked.card!, OPEN).map(row => row.purchase.id)).toEqual(['boots'])
    const undone = restoreTransactions(linked, before.card!.transactions)
    expect(undone.card!.transactions).toEqual(before.card!.transactions)
  })

  it('a refund on a later bill is linked like any other, but counts and moves as an ordinary refund', () => {
    const document = linkRefund(household(tx('r', '2027-01-03', -7900, { statementKey: JAN })), 'r', 'asos', true, now)
    const today = '2027-01-05'
    expect(expectingBack(document.card!, today)).toEqual([])
    expect(spent(document, '2026-11', today)).toBe(14800)
    expect(spent(document, '2027-01', today)).toBe(-7900)
  })
})
