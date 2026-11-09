import { expect, it } from 'vitest'
import type { BudgetAccount } from '../domain/monthlyBudget'
import { destinationLabel, shortAccountLabels, stepSummary } from './budgetLabels'

const adults = [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }]
const account = (id: string, patch: Partial<BudgetAccount>): BudgetAccount => ({ id, name: 'Current account', provider: 'Monzo', accountTypeId: 'current-account', ownerPersonIds: ['ada', 'ben'], ...patch })
const labelsOf = (accounts: BudgetAccount[]) => [...shortAccountLabels(accounts, adults).values()]

it('names an account by bank and owner, or by its nickname', () => {
  expect(labelsOf([
    account('joint', {}),
    account('ada', { provider: 'Starling', ownerPersonIds: ['ada'] }),
    account('house', { name: 'House', ownerPersonIds: ['ben'] }),
  ])).toEqual(['Monzo Joint', 'Starling Ada', 'House'])
})

it('falls back sensibly without a bank or an owner', () => {
  expect(labelsOf([
    account('no-bank', { provider: '  ' }),
    account('no-owner', { ownerPersonIds: [] }),
  ])).toEqual(['Joint · Current account', 'Monzo · Needs owner'])
})

it('keeps a lone current account plain in a clash and gives the others a short type', () => {
  expect(labelsOf([
    account('current', {}),
    account('savings', { name: 'Savings account', accountTypeId: 'savings-account' }),
    account('isa', { name: 'Cash ISA', accountTypeId: 'cash-isa' }),
  ])).toEqual(['Monzo Joint', 'Monzo Joint Savings', 'Monzo Joint Cash ISA'])
})

it('reads the type from a migrated account’s stored name', () => {
  expect(labelsOf([
    account('current', { accountTypeId: undefined }),
    account('savings', { name: 'Savings account', accountTypeId: undefined }),
  ])).toEqual(['Monzo Joint', 'Monzo Joint Savings'])
})

it('numbers accounts that still clash, in a stable order', () => {
  expect(labelsOf([account('a', {}), account('b', {})])).toEqual(['Monzo Joint (Account 1)', 'Monzo Joint (Account 2)'])
  expect(labelsOf([account('a', { name: 'House' }), account('b', { name: 'House', accountTypeId: 'savings-account' })])).toEqual(['House', 'House Savings'])
})

it('puts the pot first, then the account', () => {
  expect(destinationLabel('Monzo Joint', 'Bills')).toBe('Bills · Monzo Joint')
  expect(destinationLabel('Monzo Joint')).toBe('Monzo Joint')
})

it('counts funding and pot moves apart, leaving out zeros', () => {
  expect(stepSummary({ fundCount: 4, moveCount: 4 })).toBe('4 to fund · 4 moves')
  expect(stepSummary({ fundCount: 1, moveCount: 1 })).toBe('1 to fund · 1 move')
  expect(stepSummary({ fundCount: 2, moveCount: 0 })).toBe('2 to fund')
  expect(stepSummary({ fundCount: 0, moveCount: 0 })).toBe('No steps')
})
