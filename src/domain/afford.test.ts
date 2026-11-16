import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { savePotKind } from './potKinds'
import { affordCheck } from './afford'
import { checkBuffer } from './buffer'
import { checkPotBalance } from './potBalances'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {},
})

/** Groceries £300 planned, £100 spent by 22 Nov (day 22 of 30, so £220 would be the steady pace); Going out is a person's own pot. */
function household(spent = 10000): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }, { id: 'ada-a', name: 'Starling', provider: 'Starling', ownerPersonIds: ['ada'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'ada-spend', name: 'Ada spending', accountId: 'ada-a' }, { id: 'holidays', name: 'Holidays', accountId: 'joint', kind: 'savings' }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  document.budget.snapshots['2026-11'] = { items: [item('g', 'groceries', 30000), item('a', 'ada-spend', 20000), item('h', 'holidays', 10000)] }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [tx('2026-11-05', pot('groceries'), spent)],
  }
  return savePotKind(document, 'groceries', 'tracked')
}
const TODAY = '2026-11-22'

describe('affordCheck', () => {
  it('says yes with what would be left, and records nothing', () => {
    const document = household()
    const before = JSON.stringify(document)
    expect(affordCheck(document, 'groceries', 5000, TODAY)).toEqual({ kind: 'within', leftAfterPence: 15000, daysLeft: 8, pace: 'on-pace' })
    expect(JSON.stringify(document)).toBe(before)
  })

  it('says how far behind a steady pace it would put the pot, to the pound', () => {
    // Steady pace to day 22 is £220: £100 + £150 is £30 past it (more than 10% of the plan).
    expect(affordCheck(household(), 'groceries', 15000, TODAY)).toMatchObject({ kind: 'within', leftAfterPence: 5000, pace: 'ahead', aheadPence: 3000 })
  })

  it('says over by how much when it goes past Left, and exactly Left is still yes', () => {
    expect(affordCheck(household(), 'groceries', 20000, TODAY)).toMatchObject({ kind: 'within', leftAfterPence: 0 })
    expect(affordCheck(household(), 'groceries', 21234, TODAY)).toMatchObject({ kind: 'over', overPence: 1234 })
  })

  it('answers for a pot that is already over', () => {
    expect(affordCheck(household(32000), 'groceries', 1000, TODAY)).toEqual({ kind: 'over', overPence: 3000, buffer: { destination: { kind: 'account', accountId: 'joint' }, otherOverPence: 0 } })
  })

  it('names the rows to sort and what sorting them here would do', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-21', null, 2400))
    expect(affordCheck(document, 'groceries', 5000, TODAY)).toMatchObject({ kind: 'within', toSort: { count: 1, pence: 2400, leftIfSortedPence: 12600 } })
  })

  it('tells a Funded only pot to check the bank, and whether the Amex is in play', () => {
    expect(affordCheck(household(), 'ada-spend', 5000, TODAY)).toEqual({ kind: 'funded-only', goesOnAmex: true })
  })

  it('is not offered for Saving, the Amex pot, or no amount', () => {
    const document = household()
    expect(affordCheck(document, 'holidays', 5000, TODAY).kind).toBe('not-offered')
    expect(affordCheck(document, 'amex-pot', 5000, TODAY).kind).toBe('not-offered')
    expect(affordCheck(document, 'groceries', 0, TODAY).kind).toBe('not-offered')
  })

  describe('the buffer (P9)', () => {
    const joint: BudgetDestination = { kind: 'account', accountId: 'joint' }

    it('says it is not checked until it has been, without a balance', () => {
      expect(affordCheck(household(), 'groceries', 25000, TODAY)).toMatchObject({ kind: 'over', overPence: 5000, buffer: { destination: joint, otherOverPence: 0 } })
      expect(affordCheck(household(), 'groceries', 25000, TODAY)).not.toHaveProperty('buffer.balancePence')
    })

    it('covers the overspend from the checked balance and names when it was checked', () => {
      const document = checkBuffer(household(), joint, 50000, new Date('2026-11-19T10:00:00Z'))
      expect(affordCheck(document, 'groceries', 25000, TODAY)).toMatchObject({ kind: 'over', buffer: { balancePence: 50000, checkedAt: '2026-11-19T10:00:00.000Z', availablePence: 50000, covers: true } })
    })

    it('says how short it is when the buffer cannot cover it', () => {
      const document = checkBuffer(household(), joint, 3000, new Date('2026-11-19T10:00:00Z'))
      expect(affordCheck(document, 'groceries', 25000, TODAY)).toMatchObject({ kind: 'over', overPence: 5000, buffer: { covers: false, shortPence: 2000 } })
    })

    it('keeps what other pots that are over will take out of the buffer', () => {
      const document = checkBuffer(household(), joint, 10000, new Date('2026-11-19T10:00:00Z'))
      document.budget.pots.push({ id: 'out', name: 'Going out', accountId: 'joint' })
      document.budget.snapshots['2026-11']!.items.push({ id: 'o', name: 'o', categoryId: 'c', entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly', destination: pot('out'), funding: 'proportional' })
      document.card!.transactions.push(tx('2026-11-10', pot('out'), 14000))
      savePotKind(document, 'out', 'tracked')
      const answer = affordCheck(savePotKind(document, 'out', 'tracked'), 'groceries', 25000, TODAY)
      expect(answer).toMatchObject({ kind: 'over', buffer: { balancePence: 10000, otherOverPence: 4000, availablePence: 6000, covers: true } })
    })

    it('works the balance out from the check: covers ticked out of it and extra moved into it since', () => {
      const document = checkBuffer(household(), joint, 50000, new Date('2026-11-19T10:00:00Z'))
      document.card!.months['2026-10'] = { covers: [{ potId: 'groceries', amountPence: 8000, source: joint }], coverTicks: { 'cover:groceries': { at: '2026-11-20T09:00:00.000Z', amountPence: 8000 } } }
      document.card!.gapMoves = [{ id: 'g1', cardId: 'amex', at: '2026-11-21T09:00:00.000Z', pence: 2000, destination: joint }, { id: 'g0', cardId: 'amex', at: '2026-11-18T09:00:00.000Z', pence: 9999, destination: joint }]
      expect(affordCheck(document, 'groceries', 25000, TODAY)).toMatchObject({ buffer: { balancePence: 50000 - 8000 + 2000 } })
    })

    it('uses the buffer pot’s own check when the buffer is a pot', () => {
      const document = household()
      document.card!.cards[0]!.bufferDestination = pot('holidays')
      const checked = checkPotBalance(document, 'holidays', 7000, new Date('2026-11-19T10:00:00Z'))
      expect(affordCheck(checked, 'groceries', 25000, TODAY)).toMatchObject({ buffer: { destination: pot('holidays'), balancePence: 7000, covers: true } })
    })
  })

  describe('overlap days', () => {
    const withPay = (): BudgetDocument => {
      const document = household()
      document.budget.incomeSources = [{ id: 'a', personId: 'ada', name: 'Job', type: 'employment', baseAmountPence: 400000, changes: {}, payday: { day: 27, ifNotWorkingDay: 'previous' } }]
      document.budget.snapshots['2026-12'] = { items: [{ id: 'g', name: 'g', categoryId: 'c', entryAmountPence: 25177, amountPence: 25177, frequency: 'monthly', destination: pot('groceries'), funding: 'proportional' }] }
      return document
    }

    it('says which month it counts in and when the next month’s pot starts, from the first payday to the 1st', () => {
      expect(affordCheck(withPay(), 'groceries', 5000, '2026-11-28')).toMatchObject({ kind: 'within', overlap: { potName: 'Groceries', month: '2026-11', nextMonth: '2026-12', nextPlannedPence: 25177, startsOn: '2026-12-01' } })
    })

    it('says nothing before the first payday', () => {
      expect(affordCheck(withPay(), 'groceries', 5000, '2026-11-26')).not.toHaveProperty('overlap')
    })

    it('says nothing for a pot the next month does not plan', () => {
      const none = withPay()
      none.budget.snapshots['2026-12'] = { items: [] }
      expect(affordCheck(none, 'groceries', 5000, '2026-11-28')).not.toHaveProperty('overlap')
    })
  })
})
