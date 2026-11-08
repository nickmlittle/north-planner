export type PlannerView = 'household' | 'budget'
export type BudgetView = 'plan' | 'transfers'
export type PlanDestination = { kind: 'account' | 'direct' | 'pot'; id: string }
export type MatrixReturn = { key: string; month: string; expandedIds: string[]; scrollTop: number; scrollLeft: number; destination: PlanDestination; accountId: string }
const liveMatrixOrigins = new Set<string>()
export function markMatrixOrigin(origin: MatrixReturn) {
  window.history.replaceState({ ...window.history.state, northMatrixReturn: origin }, '')
  liveMatrixOrigins.add(origin.key)
}
export function matrixReturnFromState(): MatrixReturn | null {
  const value = window.history.state?.northMatrixReturn as MatrixReturn | undefined
  return value && value.month === parseNavigation(window.location.search).month && Array.isArray(value.expandedIds)
    && value.expandedIds.every(id => typeof id === 'string') && Number.isFinite(value.scrollTop) && Number.isFinite(value.scrollLeft)
    && typeof value.key === 'string' && typeof value.accountId === 'string' && !!value.destination?.id ? value : null
}
export function hasLiveMatrixOrigin(destination: PlanDestination | null): boolean {
  const origin = window.history.state?.northMatrixOrigin as { key: string; month: string; destination: PlanDestination } | undefined
  const current = parseNavigation(window.location.search)
  return !!origin && !!destination && liveMatrixOrigins.has(origin.key) && origin.month === current.month && origin.destination.kind === destination.kind && origin.destination.id === destination.id
}
export type NavigationState = { view: PlannerView; budgetView: BudgetView; month: string; transferAccount: string | null; planDestination: PlanDestination | null }

function parsePlanDestination(raw: string | null): PlanDestination | null {
  if (!raw) return null
  const separator = raw.indexOf(':')
  if (separator < 0) return null
  const kind = raw.slice(0, separator)
  const id = raw.slice(separator + 1)
  return (kind === 'account' || kind === 'direct' || kind === 'pot') && id ? { kind, id } : null
}

export function currentMonth(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function validMonth(value: string | null): value is string {
  return !!value && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)
}

export function parseNavigation(search: string): NavigationState {
  const params = new URLSearchParams(search)
  const budgetView = params.get('budgetView') === 'transfers' ? 'transfers' : 'plan'
  return {
    view: params.get('view') === 'household' ? 'household' : 'budget',
    budgetView,
    month: validMonth(params.get('month')) ? params.get('month')! : currentMonth(),
    transferAccount: params.get('transferAccount') || null,
    planDestination: budgetView === 'plan' ? parsePlanDestination(params.get('planDestination')) : null,
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
  if (state.view === 'budget' && state.budgetView === 'plan' && state.planDestination) url.searchParams.set('planDestination', `${state.planDestination.kind}:${state.planDestination.id}`)
  else url.searchParams.delete('planDestination')
  url.searchParams.delete('section')
  url.searchParams.delete('settings')
  const target = `${url.pathname}${url.search}${url.hash}`
  if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
  window.history[replace ? 'replaceState' : 'pushState'](historyState, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
