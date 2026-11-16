import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { potSettings, savePotSettings } from './cardSpending'
import { emptyCardTracker, validCardTracker } from './cardTracker'
import { defaultPotKind, potKind, savePotKind } from './potKinds'

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] },
    { id: 'saver', name: 'Joint Savings', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'], accountTypeId: 'savings-account' },
  ]
  document.budget.pots = [
    { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' },
    { id: 'holidays', name: 'Holidays', accountId: 'joint', kind: 'savings' }, { id: 'emergency', name: 'Emergency', accountId: 'saver' },
    { id: 'spend', name: 'Spending', accountId: 'ada-own' }, { id: 'amex', name: 'Amex pot', accountId: 'joint' },
  ]
  document.card = { ...emptyCardTracker(), cards: [{ id: 'card', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex', fromCloseDate: '2026-11-24' } }], pots: { bills: { carriesOver: true } } }
  return document
}

describe('pot kinds (P2)', () => {
  it('defaults from where the pot is', () => {
    const document = household()
    expect(['groceries', 'bills', 'holidays', 'emergency', 'spend'].map(id => potKind(document, id))).toEqual(['tracked', 'carries-over', 'saving', 'saving', 'funded-only'])
  })
  it('leaves the Amex pot without a kind', () => {
    expect(potKind(household(), 'amex')).toBeUndefined()
  })
  it('keeps a chosen kind over the default: a savings pot kept in a current account, a personal pot to watch', () => {
    let document = household()
    document = savePotKind(document, 'holidays', 'saving')
    document = savePotKind(document, 'spend', 'tracked')
    expect(potKind(document, 'holidays')).toBe('saving')
    expect(potKind(document, 'spend')).toBe('tracked')
    expect(defaultPotKind(document, 'spend')).toBe('funded-only')
  })
  it('sets pace and carries-over to match the kind', () => {
    let document = household()
    document = savePotKind(document, 'spend', 'tracked')
    expect(potSettings(document, 'spend')).toMatchObject({ pace: 'steady', carriesOver: false })
    document = savePotKind(document, 'spend', 'carries-over')
    expect(potSettings(document, 'spend')).toMatchObject({ pace: 'none', carriesOver: true })
    document = savePotKind(document, 'groceries', 'saving')
    expect(potSettings(document, 'groceries')).toMatchObject({ pace: 'none', carriesOver: false })
  })
  it('only a Tracked pot has pace, even if pace was stored', () => {
    const document = savePotSettings(household(), 'spend', { pace: 'steady' })
    expect(potSettings(document, 'spend').pace).toBe('none')
  })
  it('moves a chosen kind with the older carries-over setting', () => {
    let document = savePotKind(household(), 'groceries', 'tracked')
    document = savePotSettings(document, 'groceries', { carriesOver: true })
    expect(potKind(document, 'groceries')).toBe('carries-over')
    document = savePotSettings(document, 'groceries', { carriesOver: false })
    expect(potKind(document, 'groceries')).toBe('tracked')
  })
  it('is validated like its neighbours', () => {
    const document = savePotKind(household(), 'spend', 'tracked')
    expect(validCardTracker(document.card, document.budget, new Set(['ada', 'ben']))).toBe(true)
    const bad = { ...document.card!, pots: { spend: { kind: 'monthly' } } }
    expect(validCardTracker(bad, document.budget, new Set(['ada', 'ben']))).toBe(false)
  })
})
