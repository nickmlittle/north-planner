import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument } from '../domain/budgetDocument'
import { resolveBudget, type BudgetItem } from '../domain/monthlyBudget'
import { shortAccountLabels } from './budgetLabels'
import { groupPlanItems, matchesPlanDestination, planDestinationLabel, planItemLabels } from './planRows'

const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))!
const adults = document.household.adults
const items = resolveBudget(document.budget, '2026-11').items
const short = shortAccountLabels(document.budget.accounts, adults)
const labels = planItemLabels(document, short)
const all = { query: '', owner: 'All', category: 'All' }
const itemTo = (accountId: string, potId?: string) => items.find(item => potId ? item.destination.kind === 'pot' && item.destination.potId === potId : item.destination.kind === 'account' && item.destination.accountId === accountId)!

it('bands rows by category only, in first-appearance order, at every screen size', () => {
  const { groups, matching } = groupPlanItems(items, all, labels)
  expect(groups.map(group => group.key)).toEqual(groups.map(group => `category:${group.items[0]!.categoryId}`))
  expect(new Set(groups.map(group => group.name)).size).toBe(groups.length)
  expect(groups.flatMap(group => group.items)).toHaveLength(items.length)
  expect(matching).toHaveLength(items.length)
})

it('puts items whose category has gone in one Uncategorised group', () => {
  const orphans = [{ ...items[0]!, id: 'x', categoryId: 'gone-1' }, { ...items[1]!, id: 'y', categoryId: 'gone-2' }]
  const { groups } = groupPlanItems(orphans, all, labels)
  expect(groups.map(group => [group.name, group.items.length])).toEqual([['Uncategorised', 2]])
})

it('applies search, Owner and Category together, and returns nothing when none match', () => {
  const ada = groupPlanItems(items, { ...all, owner: 'Ada' }, labels)
  expect(ada.matching.length).toBeGreaterThan(0)
  expect(ada.matching.every(item => labels.ownerGroup(item) === 'Ada')).toBe(true)
  const home = groupPlanItems(items, { ...all, category: 'c0' }, labels)
  expect(home.groups.map(group => group.name)).toEqual(['Home'])
  expect(groupPlanItems(items, { ...all, query: 'zzzz' }, labels)).toEqual({ groups: [], matching: [] })
})

it('searches account bank and pot names, ignoring case and surrounding space', () => {
  const holidays = itemTo('joint', 'holidays')
  expect(labels.matchesSearch(holidays, '  HOLIDAYS ')).toBe(true)
  expect(labels.matchesSearch(holidays, 'monzo')).toBe(true)
  expect(labels.matchesSearch(itemTo('ben', 'ben-spend'), 'nationwide')).toBe(true)
  expect(labels.matchesSearch(itemTo('ben', 'ben-spend'), 'starling')).toBe(false)
  expect(labels.matchesSearch(itemTo('ben', 'ben-spend'), 'ben')).toBe(true)
})

it('labels every destination one way: the pot, then the short account name', () => {
  const bills = itemTo('joint', 'bills')
  expect(labels.destinationLabel(bills)).toBe('Bills · Monzo Joint')
  expect(labels.destinationLabel(itemTo('joint'))).toBe('Monzo Joint')
  expect(labels.destinationLabel(itemTo('ben', 'ben-spend'))).toMatch(/^.+ · Nationwide Ben$/)
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
  const pot = { kind: 'pot' as const, id: 'bills' }, direct = { kind: 'direct' as const, id: 'joint' }, account = { kind: 'account' as const, id: 'joint' }
  expect(items.filter(item => matchesPlanDestination(item, pot, labels)).every(item => item.destination.kind === 'pot' && item.destination.potId === 'bills')).toBe(true)
  expect(items.filter(item => matchesPlanDestination(item, direct, labels)).every(item => item.destination.kind === 'account')).toBe(true)
  expect(items.filter(item => matchesPlanDestination(item, account, labels)).length).toBeGreaterThan(items.filter(item => matchesPlanDestination(item, direct, labels)).length)
  expect(planDestinationLabel(document, pot, short)).toBe('Bills · Monzo Joint')
  expect(planDestinationLabel(document, direct, short)).toBe('Direct to account · Monzo Joint')
  expect(planDestinationLabel(document, { kind: 'pot', id: 'missing' }, short)).toBe('Destination no longer available')
  expect(planDestinationLabel(document, null, short)).toBe('')
})

