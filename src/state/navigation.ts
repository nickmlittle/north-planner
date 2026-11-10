export type PlannerView = 'home' | 'household' | 'budget'
export type BudgetView = 'plan' | 'transfers'
export type PlanDestination = { kind: 'account' | 'direct' | 'pot'; id: string }
/** Where "See items" in the payday steps was opened from, so Back to Transfers lands on the same account. */
export type StepsReturn = { key: string; month: string; accountId: string }
// Origins created in this page load; a reloaded or shared Plan link has none, so it offers View Transfers instead of Back.
const liveTransfersOrigins = new Set<string>()
export function markStepsOrigin(origin: StepsReturn) {
  window.history.replaceState({ ...window.history.state, northStepsReturn: origin }, '')
  liveTransfersOrigins.add(origin.key)
}
export function stepsReturnFromState(): StepsReturn | null {
  const value = window.history.state?.northStepsReturn as StepsReturn | undefined
  return value && typeof value.key === 'string' && typeof value.accountId === 'string' && value.month === parseNavigation(window.location.search).month ? value : null
}
/** History state for a Plan entry opened from Transfers. */
export const transfersOriginState = (origin: { key: string; month: string }, destination: PlanDestination) => ({ northTransfersOrigin: { key: origin.key, month: origin.month, destination } })
export function hasLiveTransfersOrigin(destination: PlanDestination | null): boolean {
  const origin = window.history.state?.northTransfersOrigin as { key: string; month: string; destination: PlanDestination } | undefined
  const current = parseNavigation(window.location.search)
  return !!origin && !!destination && liveTransfersOrigins.has(origin.key) && origin.month === current.month && origin.destination.kind === destination.kind && origin.destination.id === destination.id
}
export type NavigationState = { view: PlannerView; budgetView: BudgetView; month: string; planDestination: PlanDestination | null }

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
  const requested = params.get('budgetView')
  const budgetView: BudgetView = requested === 'transfers' || requested === 'plan' ? requested : lastBudgetView()
  return {
    // Opening the app lands on Home; a link that names a screen (or a Plan/Transfers view) goes straight there.
    view: params.get('view') === 'household' ? 'household' : params.get('view') === 'budget' || params.has('budgetView') ? 'budget' : 'home',
    budgetView,
    month: validMonth(params.get('month')) ? params.get('month')! : currentMonth(),
    planDestination: budgetView === 'plan' ? parsePlanDestination(params.get('planDestination')) : null,
  }
}

const LAST_BUDGET_VIEW_KEY = 'north.budgetView'

/** Plan or Transfers, when a link opens the budget without saying which: the one used last on this device. */
function lastBudgetView(): BudgetView {
  try { return window.localStorage.getItem(LAST_BUDGET_VIEW_KEY) === 'transfers' ? 'transfers' : 'plan' } catch { return 'plan' }
}

function rememberBudgetView(view: BudgetView) {
  try { window.localStorage.setItem(LAST_BUDGET_VIEW_KEY, view) } catch { /* Per-device convenience only. */ }
}

export function navigateTo(next: Partial<NavigationState>, { replace = false, historyState = null }: { replace?: boolean; historyState?: unknown } = {}) {
  const current = parseNavigation(window.location.search)
  const state = { ...current, ...next }
  if (state.view === 'budget') rememberBudgetView(state.budgetView)
  const url = new URL(window.location.href)
  url.searchParams.set('view', state.view)
  if (state.view === 'budget') url.searchParams.set('budgetView', state.budgetView)
  else url.searchParams.delete('budgetView')
  if (next.month !== undefined || url.searchParams.has('month')) url.searchParams.set('month', state.month)
  else url.searchParams.delete('month')
  // The destination detail screen is gone; old links simply land on the step list.
  url.searchParams.delete('transferAccount')
  if (state.view === 'budget' && state.budgetView === 'plan' && state.planDestination) url.searchParams.set('planDestination', `${state.planDestination.kind}:${state.planDestination.id}`)
  else url.searchParams.delete('planDestination')
  url.searchParams.delete('section')
  url.searchParams.delete('settings')
  const target = `${url.pathname}${url.search}${url.hash}`
  if (target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
  window.history[replace ? 'replaceState' : 'pushState'](historyState, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
