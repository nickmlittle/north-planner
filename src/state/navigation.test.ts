// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { currentMonth, navigateTo, parseNavigation } from './navigation'

afterEach(() => window.history.replaceState(null, '', '/'))

it('parses direct, legacy and invalid navigation URLs', () => {
  expect(parseNavigation('?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')).toEqual({
    view: 'budget', budgetView: 'transfers', month: '2026-02', planDestination: null, spendingView: 'sort',
  })
  expect(parseNavigation('?view=dashboard&budgetView=unknown&month=2026-13')).toEqual({
    view: 'budget', budgetView: 'plan', month: currentMonth(), planDestination: null, spendingView: 'sort',
  })
  expect(parseNavigation('?view=budget').budgetView).toBe('plan')
})

it('updates tab and month without discarding unrelated query parameters, and drops retired detail links', () => {
  window.history.replaceState(null, '', '/?view=budget&custom=keep&transferAccount=joint')
  navigateTo({ budgetView: 'transfers', month: '2026-04' })
  expect(window.location.search).toContain('budgetView=transfers')
  expect(window.location.search).toContain('month=2026-04')
  expect(window.location.search).toContain('custom=keep')
  expect(window.location.search).not.toContain('transferAccount')
})

it('round-trips a selected-month destination filter and clears it outside Plan', () => {
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-11')
  navigateTo({ budgetView: 'plan', planDestination: { kind: 'pot', id: 'bills:main' } })
  expect(parseNavigation(window.location.search).planDestination).toEqual({ kind: 'pot', id: 'bills:main' })
  expect(window.location.search).toContain('month=2026-11')
  navigateTo({ budgetView: 'transfers' })
  expect(window.location.search).not.toContain('planDestination')
  expect(parseNavigation('?budgetView=plan&planDestination=unknown%3A123').planDestination).toBeNull()
})

it('opens on Home unless the link names a screen', () => {
  expect(parseNavigation('').view).toBe('home')
  expect(parseNavigation('?month=2026-11').view).toBe('home')
  expect(parseNavigation('?view=home').view).toBe('home')
  expect(parseNavigation('?budgetView=transfers').view).toBe('budget')
  expect(parseNavigation('?view=budget&budgetView=plan').view).toBe('budget')
  expect(parseNavigation('?view=household').view).toBe('household')
})

it('opens Spending and keeps its section in the link', () => {
  expect(parseNavigation('?view=spending')).toMatchObject({ view: 'spending', spendingView: 'sort' })
  expect(parseNavigation('?spendingView=rules')).toMatchObject({ view: 'spending', spendingView: 'rules' })
  expect(parseNavigation('?view=spending&spendingView=nope').spendingView).toBe('sort')
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-11')
  navigateTo({ view: 'spending', spendingView: 'month' })
  expect(window.location.search).toContain('view=spending')
  expect(window.location.search).toContain('spendingView=month')
  expect(window.location.search).not.toContain('budgetView')
  navigateTo({ view: 'budget', budgetView: 'transfers' })
  expect(window.location.search).not.toContain('spendingView')
})
