import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument } from '../domain/budgetDocument'
import { resolveBudget, type BudgetItem } from '../domain/monthlyBudget'
import { accountOptionLabels, compactAccountLabels } from './budgetLabels'
import { groupPlanItems, matchesPlanDestination, planDestinationLabel, planItemLabels, planOwnerOrder } from './planRows'

const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))!
const adults = document.household.adults
const items = resolveBudget(document.budget, '2026-11').items
const labels = planItemLabels(document, accountOptionLabels(document.budget.accounts, adults))
const ownerOrder = planOwnerOrder(adults)
const all = { query: '', owner: 'All', category: 'All' }
const itemTo = (accountId: string, potId?: string) => items.find(item => potId ? item.destination.kind === 'pot' && item.destination.potId === potId : item.destination.kind === 'account' && item.destination.accountId === accountId)!

it('bands phone rows by owner in household order, then by category', () => {
  const { owners, matching } = groupPlanItems(items, all, false, ownerOrder, labels)
  expect(owners.map(owner => owner.name)).toEqual(['Joint', 'Ada', 'Ben'])
  expect(owners[0]!.key).toBe('owner:Joint')
  expect(owners[0]!.categories[0]!.key).toBe(`Joint:${owners[0]!.categories[0]!.name}`)
  expect(matching).toHaveLength(items.length)
  expect(owners.flatMap(owner => owner.categories.flatMap(category => category.items))).toHaveLength(items.length)
})

it('bands desktop rows by category only, under one "All" group', () => {
  const { owners } = groupPlanItems(items, all, true, ownerOrder, labels)
  expect(owners.map(owner => owner.key)).toEqual(['owner:All'])
  const categories = owners[0]!.categories
  expect(categories.map(category => category.key)).toEqual(categories.map(category => `category:${category.name}`))
  expect(new Set(categories.map(category => category.name)).size).toBe(categories.length)
  expect(categories.flatMap(category => category.items)).toHaveLength(items.length)
})

it('applies search, Owner and Category together, and returns nothing when none match', () => {
  const ada = groupPlanItems(items, { ...all, owner: 'Ada' }, false, ownerOrder, labels)
  expect(ada.owners.map(owner => owner.name)).toEqual(['Ada'])
  expect(ada.matching.every(item => labels.ownerGroup(item) === 'Ada')).toBe(true)
  const home = groupPlanItems(items, { ...all, category: 'c0' }, true, ownerOrder, labels)
  expect(home.owners[0]!.categories.map(category => category.name)).toEqual(['Home'])
  expect(groupPlanItems(items, { ...all, query: 'zzzz' }, true, ownerOrder, labels)).toEqual({ owners: [], matching: [] })
})

it('searches account bank and pot names, ignoring case and surrounding space', () => {
  const holidays = itemTo('joint', 'holidays')
  expect(labels.matchesSearch(holidays, '  HOLIDAYS ')).toBe(true)
  expect(labels.matchesSearch(holidays, 'monzo')).toBe(true)
  expect(labels.matchesSearch(itemTo('ben', 'ben-spend'), 'nationwide')).toBe(true)
  expect(labels.matchesSearch(itemTo('ben', 'ben-spend'), 'starling')).toBe(false)
  expect(labels.matchesSearch(itemTo('ben', 'ben-spend'), 'ben')).toBe(true)
})

it('labels destinations in full on desktop and briefly in the compact row', () => {
  const bills = itemTo('joint', 'bills')
  expect(labels.shortDestinationLabel(bills)).toBe('Bills pot')
  expect(labels.destinationLabel(bills)).toMatch(/^Bills · /)
  expect(labels.shortDestinationLabel(itemTo('joint'))).toBe('Current account')
  expect(labels.destinationLabel(itemTo('joint'))).toBe(accountOptionLabels(document.budget.accounts, adults).get('joint'))
  expect(labels.ownerGroup(itemTo('ada', 'ada-spend'))).toBe('Ada')
  expect(labels.ownerGroup(bills)).toBe('Joint')
})

it('describes funding in words', () => {
  const item = items[0]!
  const as = (patch: Partial<BudgetItem>) => labels.fundingLabel({ ...item, ...patch })
  expect(as({ funding: 'proportional' })).toBe('Income ratio')
  expect(as({ funding: 'equal' })).toBe('Equal split')
  expect(as({ funding: 'single', singleFunderId: adults[1]!.id })).toBe('One person · Ben')
  expect(as({ funding: 'fixed' })).toBe('Fixed amounts')
})

it('narrows to a Transfers destination and names it, or says it has gone', () => {
  const compact = compactAccountLabels(document.budget.accounts, adults)
  const pot = { kind: 'pot' as const, id: 'bills' }, direct = { kind: 'direct' as const, id: 'joint' }, account = { kind: 'account' as const, id: 'joint' }
  expect(items.filter(item => matchesPlanDestination(item, pot, labels)).every(item => item.destination.kind === 'pot' && item.destination.potId === 'bills')).toBe(true)
  expect(items.filter(item => matchesPlanDestination(item, direct, labels)).every(item => item.destination.kind === 'account')).toBe(true)
  expect(items.filter(item => matchesPlanDestination(item, account, labels)).length).toBeGreaterThan(items.filter(item => matchesPlanDestination(item, direct, labels)).length)
  expect(planDestinationLabel(document, pot, compact)).toMatch(/^Bills pot · /)
  expect(planDestinationLabel(document, direct, compact)).toMatch(/^Direct to account · /)
  expect(planDestinationLabel(document, { kind: 'pot', id: 'missing' }, compact)).toBe('Destination no longer available')
  expect(planDestinationLabel(document, null, compact)).toBe('')
})

