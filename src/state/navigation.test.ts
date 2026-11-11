// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { currentMonth, navigateTo, parseNavigation } from './navigation'

afterEach(() => window.history.replaceState(null, '', '/'))

it('parses direct, legacy and invalid navigation URLs', () => {
  expect(parseNavigation('?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')).toEqual({
    view: 'budget', budgetView: 'transfers', month: '2026-02', planDestination: null, spendingView: 'sort', spendingPot: null, spendingStatement: null, spendingClose: false,
  })
  expect(parseNavigation('?view=dashboard&budgetView=unknown&month=2026-13')).toEqual({
    view: 'budget', budgetView: 'plan', month: currentMonth(), planDestination: null, spendingView: 'sort', spendingPot: null, spendingStatement: null, spendingClose: false,
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

it('keeps a pot open on This month, and drops it elsewhere', () => {
  expect(parseNavigation('?view=spending&spendingView=month&spendingPot=groceries').spendingPot).toBe('groceries')
  expect(parseNavigation('?view=spending&spendingView=sort&spendingPot=groceries').spendingPot).toBeNull()
  window.history.replaceState(null, '', '/?view=spending&spendingView=month')
  navigateTo({ spendingPot: 'groceries' })
  expect(window.location.search).toContain('spendingPot=groceries')
  navigateTo({ spendingView: 'sort' })
  expect(window.location.search).not.toContain('spendingPot')
})

it('keeps a statement open on Statements', () => {
  expect(parseNavigation('?view=spending&spendingView=statements&spendingStatement=amex%3A2026-11-24').spendingStatement).toBe('amex:2026-11-24')
  window.history.replaceState(null, '', '/?view=spending&spendingView=statements')
  navigateTo({ spendingStatement: 'amex:2026-11-24' })
  expect(parseNavigation(window.location.search).spendingStatement).toBe('amex:2026-11-24')
  navigateTo({ spendingView: 'month' })
  expect(window.location.search).not.toContain('spendingStatement')
})

it('opens Close <Month> on This month', () => {
  expect(parseNavigation('?view=spending&spendingView=month&month=2026-10&spendingClose=1')).toMatchObject({ spendingClose: true, month: '2026-10' })
  window.history.replaceState(null, '', '/?view=spending&spendingView=month&month=2026-10')
  navigateTo({ spendingClose: true })
  expect(window.location.search).toContain('spendingClose=1')
  navigateTo({ spendingClose: false })
  expect(window.location.search).not.toContain('spendingClose')
})
