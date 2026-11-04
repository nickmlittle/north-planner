export type PlannerView = 'household' | 'budget'
export type BudgetView = 'plan' | 'transfers'
export type NavigationState = { view: PlannerView; budgetView: BudgetView; month: string; transferAccount: string | null }

export function currentMonth(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function validMonth(value: string | null): value is string {
  return !!value && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)
}

export function parseNavigation(search: string): NavigationState {
  const params = new URLSearchParams(search)
  return {
    view: params.get('view') === 'household' ? 'household' : 'budget',
    budgetView: params.get('budgetView') === 'transfers' ? 'transfers' : 'plan',
    month: validMonth(params.get('month')) ? params.get('month')! : currentMonth(),
    transferAccount: params.get('transferAccount') || null,
  }
}

export function navigateTo(next: Partial<NavigationState>, { replace = false, historyState = null }: { replace?: boolean; historyState?: unknown } = {}) {
  const current = parseNavigation(window.location.search)
  const state = { ...current, ...next }
  const url = new URL(window.location.href)
  url.searchParams.set('view', state.view)
  if (state.view === 'budget') url.searchParams.set('budgetView', state.budgetView)
  else url.searchParams.delete('budgetView')
  if (next.month !== undefined || url.searchParams.has('month')) url.searchParams.set('month', state.month)
  else url.searchParams.delete('month')
  if (state.view === 'budget' && state.budgetView === 'transfers' && state.transferAccount) url.searchParams.set('transferAccount', state.transferAccount)
  else url.searchParams.delete('transferAccount')
  url.searchParams.delete('section')
  url.searchParams.delete('settings')
  const target = `${url.pathname}${url.search}${url.hash}`
  if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
  window.history[replace ? 'replaceState' : 'pushState'](historyState, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
