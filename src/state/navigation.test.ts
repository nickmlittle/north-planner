// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { currentMonth, navigateTo, parseNavigation } from './navigation'

afterEach(() => window.history.replaceState(null, '', '/'))

it('parses direct, legacy and invalid navigation URLs', () => {
  expect(parseNavigation('?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')).toEqual({
    view: 'budget', budgetView: 'transfers', month: '2026-02', transferAccount: 'account-1',
  })
  expect(parseNavigation('?view=dashboard&budgetView=unknown&month=2026-13')).toEqual({
    view: 'budget', budgetView: 'plan', month: currentMonth(), transferAccount: null,
  })
  expect(parseNavigation('?view=budget').budgetView).toBe('plan')
})

it('updates tab, month and detail without discarding unrelated query parameters', () => {
  window.history.replaceState(null, '', '/?view=budget&custom=keep')
  navigateTo({ budgetView: 'transfers', month: '2026-04', transferAccount: 'joint' })
  expect(window.location.search).toContain('budgetView=transfers')
  expect(window.location.search).toContain('month=2026-04')
  expect(window.location.search).toContain('transferAccount=joint')
  expect(window.location.search).toContain('custom=keep')
  navigateTo({ view: 'household' })
  expect(window.location.search).not.toContain('transferAccount')
})
