import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { byFundingShare, discountPence, fundingShares, halfEach, personDestination, receiptLines, shareLabel, spreadDiscount, splitLabel, totalsByDestination } from './cardSplits'

const pot = (potId: string) => ({ kind: 'pot' as const, potId })
const joint = { kind: 'account' as const, accountId: 'joint' }

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] },
    { id: 'ben-own', name: 'Ben', provider: 'Nationwide', ownerPersonIds: ['ben'] },
  ]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'ada-treats', name: 'Treats', accountId: 'ada-own' }, { id: 'ada-car', name: 'Car', accountId: 'ada-own' }]
  document.budget.incomeSources = [
    { id: 'a', personId: 'ada', name: 'Pay', type: 'employment', baseAmountPence: 300000, changes: { '2026-12': 400000 } },
    { id: 'b', personId: 'ben', name: 'Pay', type: 'employment', baseAmountPence: 200000, changes: {} },
    { id: 'gift', personId: 'ben', name: 'Gift', type: 'additional', baseAmountPence: 900000, changes: {} },
  ]
  return document
}

describe('shares', () => {
  it('uses employment income for the month, like Transfers', () => {
    expect(fundingShares(household(), '2026-11')).toEqual([{ personId: 'ada', weight: 300000 }, { personId: 'ben', weight: 200000 }])
    expect(shareLabel(fundingShares(household(), '2026-11')!)).toBe('60/40')
    expect(shareLabel(fundingShares(household(), '2026-12')!)).toBe('67/33')
    const none = household()
    none.budget.incomeSources = []
    expect(fundingShares(none, '2026-11')).toBeNull()
  })

  it('sends each person’s part to their own pot, else their own account, else the fallback', () => {
    const document = household()
    expect(personDestination(document, 'ada', joint)).toEqual(pot('ada-car'))
    expect(personDestination(document, 'ben', joint)).toEqual({ kind: 'account', accountId: 'ben-own' })
    document.budget.accounts = document.budget.accounts.filter(account => account.id !== 'ben-own')
    expect(personDestination(document, 'ben', joint)).toEqual(joint)
  })

  it('splits half each and by the funding share, in pennies that add up', () => {
    const document = household()
    expect(halfEach(document, { amountPence: 6241 }, joint)).toEqual([{ amountPence: 3121, destination: pot('ada-car') }, { amountPence: 3120, destination: { kind: 'account', accountId: 'ben-own' } }])
    expect(byFundingShare(document, { amountPence: 10000, date: '2026-11-10' }, joint)).toEqual([{ amountPence: 6000, destination: pot('ada-car') }, { amountPence: 4000, destination: { kind: 'account', accountId: 'ben-own' } }])
    expect(halfEach(document, { amountPence: -1001 }, joint).map(line => line.amountPence)).toEqual([-501, -500])
  })
})

describe('receipt items', () => {
  it('makes a line per item and gives the rest to Everything else', () => {
    const lines = receiptLines({ amountPence: 18640 }, [{ item: 'Running socks', pence: 1499, destination: pot('ada-treats') }, { item: ' Skincare ', pence: 3250, destination: pot('ada-treats') }], pot('groceries'))
    expect(lines).toEqual([
      { amountPence: 1499, destination: pot('ada-treats'), item: 'Running socks' },
      { amountPence: 3250, destination: pot('ada-treats'), item: 'Skincare' },
      { amountPence: 13891, destination: pot('groceries') },
    ])
    expect(totalsByDestination(lines!)).toEqual([{ destination: pot('groceries'), amountPence: 13891 }, { destination: pot('ada-treats'), amountPence: 4749 }])
    expect(splitLabel(lines!)).toBe('Split · 2 pots')
  })

  it('keeps a refund’s sign, leaves out an empty remainder, and refuses items over the total', () => {
    expect(receiptLines({ amountPence: -1000 }, [{ item: 'Socks', pence: 1000, destination: pot('ada-treats') }], pot('groceries'))).toEqual([{ amountPence: -1000, destination: pot('ada-treats'), item: 'Socks' }])
    expect(receiptLines({ amountPence: 1000 }, [{ item: 'Socks', pence: 1001, destination: pot('ada-treats') }], pot('groceries'))).toBeNull()
    expect(receiptLines({ amountPence: 1000 }, [{ item: 'Socks', pence: 0, destination: pot('ada-treats') }], pot('groceries'))).toBeNull()
  })

  it('calls a split with an account in it a split of ways', () => {
    expect(splitLabel([{ amountPence: 1, destination: pot('groceries') }, { amountPence: 1, destination: joint }, { amountPence: 1, destination: pot('ada-car') }])).toBe('Split · 3 ways')
  })
})

describe('discounts (D12)', () => {
  it('spreads a discount in proportion to price, always adding up to it', () => {
    expect(spreadDiscount([5000, 3000, 2000], 1000)).toEqual([500, 300, 200])
    const shares = spreadDiscount([999, 999, 1002], 1000)!
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('gives leftover pennies to the largest remainder, then the dearest item', () => {
    expect(spreadDiscount([300, 100, 100], 1)).toEqual([1, 0, 0])
    expect(spreadDiscount([100, 100, 100], 100)).toEqual([34, 33, 33])
    expect(spreadDiscount([100, 300, 100], 1)).toEqual([0, 1, 0])
  })

  it('refuses a discount of nothing, or one that takes the whole lot', () => {
    expect(spreadDiscount([1000], 0)).toBeNull()
    expect(spreadDiscount([1000], 1000)).toBeNull()
    expect(spreadDiscount([], 10)).toBeNull()
  })

  it('never takes an item to nothing', () => {
    const shares = spreadDiscount([1, 1, 1000], 2)!
    expect(shares.reduce((a, b) => a + b, 0)).toBe(2)
    expect(shares[0]).toBe(0)
    expect(shares[1]).toBe(0)
  })

  it('reads a percentage off the covered prices', () => {
    expect(discountPence([5000, 3000], { percent: 20 })).toBe(1600)
    expect(discountPence([1999], { percent: 15 })).toBe(300)
    expect(discountPence([5000], { pence: 700 })).toBe(700)
  })

  it('makes discounted lines that keep the original prices and add up to the charge', () => {
    const items = [
      { item: 'Coat', pence: 4500, destination: pot('ada-treats'), back: true, covered: true },
      { item: 'Boots', pence: 3000, destination: pot('ada-treats'), back: true, covered: true },
      { item: 'Top', pence: 1000, destination: pot('ada-treats'), covered: true },
      { item: 'Socks', pence: 7000, destination: pot('ben-treats') },
      { item: 'Scarf', pence: 1000, destination: pot('ada-treats'), covered: true },
    ]
    const off = discountPence(items.filter(row => row.covered).map(row => row.pence), { percent: 20 })
    expect(off).toBe(1900)
    const lines = receiptLines({ amountPence: 16500 - off }, items, pot('groceries'), off)!
    expect(lines.reduce((sum, line) => sum + line.amountPence, 0)).toBe(16500 - off)
    expect(lines.map(line => line.originalPence)).toEqual([4500, 3000, 1000, undefined, 1000])
    expect(lines[0]).toMatchObject({ item: 'Coat', amountPence: 3600, expectingBack: true })
    expect(lines[3]).toEqual({ amountPence: 7000, destination: pot('ben-treats'), item: 'Socks' })
  })

  it('lets Everything else take what the discounted items leave, and refuses items over the charge', () => {
    const items = [{ item: 'Coat', pence: 5000, destination: pot('ada-treats'), covered: true }]
    expect(receiptLines({ amountPence: 5000 }, items, pot('groceries'), 1000)).toEqual([
      { amountPence: 4000, destination: pot('ada-treats'), item: 'Coat', originalPence: 5000 },
      { amountPence: 1000, destination: pot('groceries') },
    ])
    expect(receiptLines({ amountPence: 3500 }, items, pot('groceries'), 1000)).toBeNull()
    expect(receiptLines({ amountPence: 5000 }, items, pot('groceries'), 5000)).toBeNull()
    expect(receiptLines({ amountPence: 5000 }, [{ ...items[0]!, covered: false }], pot('groceries'), 1000)).toBeNull()
  })

  it('leaves lines unchanged with no discount', () => {
    expect(receiptLines({ amountPence: 1000 }, [{ item: 'Socks', pence: 1000, destination: pot('ada-treats'), covered: true }], pot('groceries'))).toEqual([{ amountPence: 1000, destination: pot('ada-treats'), item: 'Socks' }])
  })
})
