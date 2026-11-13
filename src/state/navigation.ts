/** The app's destinations: four in the nav, plus Settings at the sidebar foot (audit 3, plan §2.1). */
export type PlannerView = 'home' | 'month' | 'plan' | 'spending' | 'settings'
/** Spending's tabs. */
export type SpendingSection = 'sort' | 'transactions' | 'statements'
/** Settings' areas; `section` scrolls to one. */
export type SettingsSection = 'household' | 'income' | 'accounts' | 'categories' | 'cards' | 'rules' | 'account'
export type PlanDestination = { kind: 'account' | 'direct' | 'pot'; id: string }
/** Where "See items" in the payday steps was opened from, so Back to Month lands on the same account. */
export type StepsReturn = { key: string; month: string; accountId: string }
// Origins created in this page load; a reloaded or shared Plan link has none, so it offers View Month instead of Back.
const liveTransfersOrigins = new Set<string>()
export function markStepsOrigin(origin: StepsReturn) {
  window.history.replaceState({ ...window.history.state, northStepsReturn: origin }, '')
  liveTransfersOrigins.add(origin.key)
}
export function stepsReturnFromState(): StepsReturn | null {
  const value = window.history.state?.northStepsReturn as StepsReturn | undefined
  return value && typeof value.key === 'string' && typeof value.accountId === 'string' && value.month === parseNavigation(window.location.search).month ? value : null
}
/** History state for a Plan entry opened from Month's payday steps. */
export const transfersOriginState = (origin: { key: string; month: string }, destination: PlanDestination) => ({ northTransfersOrigin: { key: origin.key, month: origin.month, destination } })
export function hasLiveTransfersOrigin(destination: PlanDestination | null): boolean {
  const origin = window.history.state?.northTransfersOrigin as { key: string; month: string; destination: PlanDestination } | undefined
  const current = parseNavigation(window.location.search)
  return !!origin && !!destination && liveTransfersOrigins.has(origin.key) && origin.month === current.month && origin.destination.kind === destination.kind && origin.destination.id === destination.id
}

/**
 * Where the app is. `section`: Spending's tab or a Settings area. `pot` and `close`: a pot's page or Close <Month>,
 * on Month. `statement`: a statement's page, on Spending. `planDestination`: Plan filtered to one destination.
 */
export type NavigationState = { view: PlannerView; month: string; section: SpendingSection | SettingsSection | null; pot: string | null; statement: string | null; close: boolean; planDestination: PlanDestination | null }
const spendingSections: readonly SpendingSection[] = ['sort', 'transactions', 'statements']
const settingsSections: readonly SettingsSection[] = ['household', 'income', 'accounts', 'categories', 'cards', 'rules', 'account']
const views: readonly PlannerView[] = ['home', 'month', 'plan', 'spending', 'settings']

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

/** The parameters only links from before the new navigation use; `navigateTo` rewrites them away. */
const LEGACY_PARAMS = ['budgetView', 'spendingView', 'spendingPot', 'spendingStatement', 'spendingClose', 'transferAccount', 'settings']
export const hasLegacyParams = (search: string) => { const params = new URLSearchParams(search); return LEGACY_PARAMS.some(key => params.has(key)) || params.get('view') === 'budget' || params.get('view') === 'household' }

/** A link's screen and its details, from today's params or any older form (plan §2.1's redirect table). */
function parseLocation(params: URLSearchParams): Omit<NavigationState, 'month'> {
  const none = { section: null, pot: null, statement: null, close: false, planDestination: null }
  const view = params.get('view')
  const spendingView = params.get('spendingView')
  if (view === 'household') return { ...none, view: 'settings', section: 'household' }
  // Spending's old sections: This month moved to Month, Rules to Settings, All transactions became Transactions.
  if (spendingView !== null && (view === 'spending' || view === null)) {
    if (spendingView === 'month') return { ...none, view: 'month', pot: params.get('spendingPot') || null, close: params.get('spendingClose') === '1' }
    if (spendingView === 'rules') return { ...none, view: 'settings', section: 'rules' }
    if (spendingView === 'statements') return { ...none, view: 'spending', section: 'statements', statement: params.get('spendingStatement') || null }
    return { ...none, view: 'spending', section: spendingView === 'all' ? 'transactions' : 'sort' }
  }
  // Plan and Transfers were one "budget" screen; Transfers is Month's payday steps now.
  if (view === 'budget' || params.has('budgetView') && !views.includes(view as PlannerView)) return params.get('budgetView') === 'transfers' ? { ...none, view: 'month' } : { ...none, view: 'plan', planDestination: parsePlanDestination(params.get('planDestination')) }
  const section = params.get('section')
  if (view === 'month') return { ...none, view, pot: params.get('pot') || null, close: params.get('close') === '1' }
  if (view === 'plan') return { ...none, view, planDestination: parsePlanDestination(params.get('planDestination')) }
  if (view === 'spending') {
    const tab = spendingSections.includes(section as SpendingSection) ? section as SpendingSection : 'sort'
    return { ...none, view, section: tab, statement: tab === 'statements' ? params.get('statement') || null : null }
  }
  if (view === 'settings') return { ...none, view, section: settingsSections.includes(section as SettingsSection) ? section as SettingsSection : null }
  // Opening the app lands on Home.
  return { ...none, view: 'home' }
}

export function parseNavigation(search: string): NavigationState {
  const params = new URLSearchParams(search)
  return { ...parseLocation(params), month: validMonth(params.get('month')) ? params.get('month')! : currentMonth() }
}

/** Spending's tab, for a state on Spending. */
export const spendingSection = (state: NavigationState): SpendingSection => spendingSections.includes(state.section as SpendingSection) ? state.section as SpendingSection : 'sort'

/**
 * Go somewhere. Changing `view` starts that screen fresh (no tab, pot, statement or filter carried over) unless
 * `next` sets them. Only today's params are written, so an old link is rewritten the first time it's followed.
 */
export function navigateTo(next: Partial<NavigationState>, { replace = false, historyState = null }: { replace?: boolean; historyState?: unknown } = {}) {
  const current = parseNavigation(window.location.search)
  const fresh = next.view !== undefined && next.view !== current.view
  const state: NavigationState = { ...current, ...fresh ? { section: null, pot: null, statement: null, close: false, planDestination: null } : {}, ...next }
  const url = new URL(window.location.href)
  const keepMonth = next.month !== undefined || url.searchParams.has('month')
  for (const key of [...LEGACY_PARAMS, 'view', 'month', 'section', 'pot', 'statement', 'close', 'planDestination']) url.searchParams.delete(key)
  url.searchParams.set('view', state.view)
  if (keepMonth) url.searchParams.set('month', state.month)
  if (state.view === 'spending') {
    const tab = spendingSection(state)
    url.searchParams.set('section', tab)
    if (tab === 'statements' && state.statement) url.searchParams.set('statement', state.statement)
  }
  if (state.view === 'settings' && state.section && settingsSections.includes(state.section as SettingsSection)) url.searchParams.set('section', state.section)
  if (state.view === 'month' && state.pot) url.searchParams.set('pot', state.pot)
  if (state.view === 'month' && state.close && !state.pot) url.searchParams.set('close', '1')
  if (state.view === 'plan' && state.planDestination) url.searchParams.set('planDestination', `${state.planDestination.kind}:${state.planDestination.id}`)
  const target = `${url.pathname}${url.search}${url.hash}`
  // The same place with history state still moves (⌘K to an item while already on Plan); without, it's a no-op.
  if (target === `${window.location.pathname}${window.location.search}${window.location.hash}` && historyState === null) return
  window.history[replace ? 'replaceState' : 'pushState'](historyState, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** An old link, rewritten in place to today's params; history state (Back to Month, the review person) is kept. */
export function rewriteLegacyLink() {
  if (hasLegacyParams(window.location.search)) navigateTo({}, { replace: true, historyState: window.history.state })
}
