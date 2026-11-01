import { expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, removeAdult, renameAdult } from './budgetDocument'

it('starts with a fresh, generic budget record', () => {
  const document = newBudgetDocument()
  expect(document).toMatchObject({ version: 1, household: { name: '', adults: [] } })
  expect(document.budget.pots).toEqual([])
  expect(document.budget.accounts).toEqual([])
  expect(document.budget.lines).toEqual([])
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
})

it('removes adult income and funding references from base and monthly overrides', () => {
  const document = newBudgetDocument()
  document.household.adults = [{ id: 'alex', name: 'Alex' }, { id: 'sam', name: 'Sam' }]
  document.budget.incomes = [{ personId: 'sam', monthlyNetPence: 200000, mode: 'all-income', liveOnPence: 0, surplusPotId: '' }]
  const line = { id: 'rent', category: 'Living Expenses', ownerName: 'Joint', name: 'Rent', entryAmountPence: 100000, frequency: 'monthly' as const, amountPence: 100000, potId: 'bills', funding: 'single' as const, singleFunderId: 'sam', customShares: { alex: 40, sam: 60 } }
  document.budget.lines = [line]
  document.budget.monthOverrides = { '2026-11': { incomes: [...document.budget.incomes], lines: [line] } }
  const next = removeAdult(document, 'sam')
  expect(next.household.adults).toEqual([{ id: 'alex', name: 'Alex' }])
  expect(next.budget.incomes).toEqual([])
  expect(next.budget.lines[0]).toMatchObject({ funding: 'proportional', customShares: { alex: 40 } })
  expect(next.budget.lines[0]?.singleFunderId).toBeUndefined()
  expect(next.budget.monthOverrides?.['2026-11']?.incomes).toEqual([])
  expect(next.budget.monthOverrides?.['2026-11']?.lines?.[0]?.customShares).toEqual({ alex: 40 })
})

it('rejects invalid budget records', () => {
  expect(decodeBudgetDocument({ version: 1, household: { name: '', adults: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }] }, budget: newBudgetDocument().budget })).toBeNull()
  expect(decodeBudgetDocument({ ...newBudgetDocument(), budget: { pots: [] } })).toBeNull()
})

it('keeps budget owner labels in sync when an adult is renamed', () => {
  const document = newBudgetDocument()
  document.household.adults = [{ id: 'alex', name: 'Alex' }]
  document.budget.pots = [{ id: 'pot', name: 'Savings', kind: 'savings', ownerName: 'Alex' }]
  document.budget.accounts = [{ id: 'account', name: 'Bank', ownerName: 'Alex' }]
  document.budget.lines = [{ id: 'line', category: 'Savings', ownerName: 'Alex', name: 'Save', entryAmountPence: 1000, frequency: 'monthly', amountPence: 1000, potId: 'pot', funding: 'proportional' }]
  const next = renameAdult(document, 'alex', 'Alexandra')
  expect(next.household.adults[0]?.name).toBe('Alexandra')
  expect(next.budget.pots[0]?.ownerName).toBe('Alexandra')
  expect(next.budget.accounts?.[0]?.ownerName).toBe('Alexandra')
  expect(next.budget.lines[0]?.ownerName).toBe('Alexandra')
})
