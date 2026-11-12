// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { currentMonth, hasLegacyParams, navigateTo, parseNavigation, rewriteLegacyLink } from './navigation'

afterEach(() => window.history.replaceState(null, '', '/'))

const none = { section: null, pot: null, statement: null, close: false, planDestination: null }

it('parses each destination and its details', () => {
  expect(parseNavigation('?view=month&month=2026-02')).toEqual({ ...none, view: 'month', month: '2026-02' })
  expect(parseNavigation('?view=month&month=2026-10&close=1')).toMatchObject({ view: 'month', close: true })
  expect(parseNavigation('?view=month&pot=groceries')).toMatchObject({ view: 'month', pot: 'groceries' })
  expect(parseNavigation('?view=plan&planDestination=pot%3Abills')).toMatchObject({ view: 'plan', planDestination: { kind: 'pot', id: 'bills' } })
  expect(parseNavigation('?view=spending')).toMatchObject({ view: 'spending', section: 'sort' })
  expect(parseNavigation('?view=spending&section=nope')).toMatchObject({ view: 'spending', section: 'sort' })
  expect(parseNavigation('?view=spending&section=statements&statement=amex%3A2026-11-24')).toMatchObject({ section: 'statements', statement: 'amex:2026-11-24' })
  expect(parseNavigation('?view=spending&section=sort&statement=amex%3A2026-11-24').statement).toBeNull()
  expect(parseNavigation('?view=settings')).toMatchObject({ view: 'settings', section: null })
  expect(parseNavigation('?view=settings&section=cards')).toMatchObject({ view: 'settings', section: 'cards' })
  expect(parseNavigation('?view=month&month=2026-13').month).toBe(currentMonth())
})

it('opens on Home unless the link names a screen', () => {
  expect(parseNavigation('').view).toBe('home')
  expect(parseNavigation('?month=2026-11').view).toBe('home')
  expect(parseNavigation('?view=home').view).toBe('home')
  expect(parseNavigation('?view=nope').view).toBe('home')
})

it.each([
  ['?view=budget&budgetView=plan&month=2026-11', { view: 'plan', month: '2026-11' }],
  ['?budgetView=plan', { view: 'plan' }],
  ['?view=budget', { view: 'plan' }],
  ['?view=dashboard&budgetView=unknown', { view: 'plan' }],
  ['?view=budget&budgetView=plan&planDestination=account%3Ajoint', { view: 'plan', planDestination: { kind: 'account', id: 'joint' } }],
  ['?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1', { view: 'month', month: '2026-02', planDestination: null }],
  ['?budgetView=transfers', { view: 'month' }],
  ['?view=spending&spendingView=month&month=2026-11', { view: 'month', pot: null, close: false }],
  ['?view=spending&spendingView=month&spendingPot=groceries', { view: 'month', pot: 'groceries' }],
  ['?view=spending&spendingView=month&month=2026-10&spendingClose=1', { view: 'month', month: '2026-10', close: true }],
  ['?view=spending&spendingView=sort', { view: 'spending', section: 'sort' }],
  ['?view=spending&spendingView=all', { view: 'spending', section: 'transactions' }],
  ['?view=spending&spendingView=statements', { view: 'spending', section: 'statements', statement: null }],
  ['?view=spending&spendingView=statements&spendingStatement=amex%3A2026-11-24', { view: 'spending', section: 'statements', statement: 'amex:2026-11-24' }],
  ['?spendingView=rules', { view: 'settings', section: 'rules' }],
  ['?view=spending&spendingView=nope', { view: 'spending', section: 'sort' }],
  ['?view=household', { view: 'settings', section: 'household' }],
])('maps the legacy link %s to the new destination', (search, expected) => {
  expect(parseNavigation(search)).toMatchObject(expected)
  expect(hasLegacyParams(search)).toBe(true)
})

it('rewrites a legacy link in place, keeping its history state and unrelated params', () => {
  window.history.replaceState({ northReviewPerson: 'ada' }, '', '/?view=budget&budgetView=transfers&month=2026-02&custom=keep')
  const length = window.history.length
  rewriteLegacyLink()
  expect(window.location.search).toBe('?custom=keep&view=month&month=2026-02')
  expect(window.history.length).toBe(length)
  expect(window.history.state).toEqual({ northReviewPerson: 'ada' })
  window.history.replaceState(null, '', '/?view=spending&spendingView=statements&spendingStatement=amex%3A2026-11-24')
  rewriteLegacyLink()
  expect(window.location.search).toBe('?view=spending&section=statements&statement=amex%3A2026-11-24')
  window.history.replaceState(null, '', '/?view=household')
  rewriteLegacyLink()
  expect(window.location.search).toBe('?view=settings&section=household')
  window.history.replaceState(null, '', '/?view=plan&month=2026-11')
  rewriteLegacyLink()
  expect(window.location.search).toBe('?view=plan&month=2026-11')
})

it('starts a new screen fresh, and keeps details on the same screen', () => {
  window.history.replaceState(null, '', '/?view=plan&month=2026-11&planDestination=pot%3Abills')
  navigateTo({ view: 'month' })
  expect(window.location.search).toBe('?view=month&month=2026-11')
  navigateTo({ pot: 'groceries' })
  expect(window.location.search).toContain('pot=groceries')
  navigateTo({ month: '2026-12' })
  expect(window.location.search).toContain('pot=groceries')
  navigateTo({ view: 'spending' })
  expect(window.location.search).toBe('?view=spending&month=2026-12&section=sort')
  navigateTo({ section: 'statements', statement: 'amex:2026-11-24' })
  expect(parseNavigation(window.location.search).statement).toBe('amex:2026-11-24')
  navigateTo({ section: 'sort' })
  expect(window.location.search).not.toContain('statement=')
  navigateTo({ view: 'plan', planDestination: { kind: 'pot', id: 'bills:main' } })
  expect(parseNavigation(window.location.search).planDestination).toEqual({ kind: 'pot', id: 'bills:main' })
  navigateTo({ view: 'month' })
  expect(window.location.search).not.toContain('planDestination')
})

it('opens Close <Month> on Month, and Settings at a section', () => {
  window.history.replaceState(null, '', '/?view=month&month=2026-10')
  navigateTo({ close: true })
  expect(window.location.search).toContain('close=1')
  navigateTo({ close: false })
  expect(window.location.search).not.toContain('close')
  navigateTo({ view: 'settings', section: 'rules' })
  expect(window.location.search).toContain('view=settings&month=2026-10&section=rules')
  navigateTo({ view: 'home' })
  expect(window.location.search).toBe('?view=home&month=2026-10')
})
