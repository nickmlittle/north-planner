import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { byFundingShare, fundingShares, halfEach, personDestination, receiptLines, shareLabel, splitLabel, totalsByDestination } from './cardSplits'

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
