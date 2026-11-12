import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import type { Session } from '@supabase/supabase-js'
import { householdReady, type BudgetDocument } from './domain/budgetDocument'
import type { BudgetImpact } from './domain/budgetImpact'
import type { HomeTarget } from './domain/homeInbox'
import { SetupWizard } from './pages/SetupWizard'
import { useBudgetDocument } from './state/useBudgetDocument'
import { useCloudBudget } from './state/useCloudBudget'
import { supabase } from './state/supabase'
import { AccountAccess } from './components/AccountAccess'
import { DocumentConflict } from './components/DocumentConflict'
import { AppLayout } from './components/AppLayout'
import { formatMonth } from './formatting/month'
import { documentTitle } from './state/documentTitle'
import { useNavCounts } from './state/navCounts'
import { hasLiveTransfersOrigin, markStepsOrigin, navigateTo, parseNavigation, rewriteLegacyLink, spendingSection, stepsReturnFromState, transfersOriginState, type PlanDestination, type PlannerView, type SettingsSection } from './state/navigation'

const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })))
const MonthlyBudget = lazy(() => import('./pages/MonthlyBudget').then(module => ({ default: module.MonthlyBudget })))
const Spending = lazy(() => import('./pages/Spending').then(module => ({ default: module.Spending })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(module => ({ default: module.SettingsPage })))
/** Dev builds only (?view=ui-gallery): the shared UI parts. The production build drops it. */
const UiGallery = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery')) : null

function subscribeLocation(callback: () => void) { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback) }
function getLocationSearch() { return window.location.search }

function BudgetApp({ document, setDocument, status, error, email, onSignOut }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  status: string
  error: string
  email?: string
  onSignOut?: () => void
}) {
  const search = useSyncExternalStore(subscribeLocation, getLocationSearch, () => '')
  // An old link (Transfers, This month, Household…) is rewritten in place to the screen it now names.
  useEffect(() => rewriteLegacyLink(), [search])
  const navigation = parseNavigation(search)
  const setupComplete = householdReady(document.household) && document.workflow.setupComplete
  // Until the household is set up, Settings (its Household section) is the only screen.
  const view: PlannerView = setupComplete ? navigation.view : 'settings'
  useEffect(() => { window.document.title = documentTitle(navigation, document, document.workflow.setupComplete) })
  const counts = useNavCounts(document)
  const selectView = (nextView: PlannerView) => { if (nextView !== view && (setupComplete || nextView === 'settings')) navigateTo({ view: nextView }) }
  /** "See items" in the payday steps: Plan filtered to that account, with Back returning to the same step. */
  const seeTransferItems = (accountId: string) => {
    const origin = { key: crypto.randomUUID(), month: navigation.month, accountId }, destination: PlanDestination = { kind: 'account', id: accountId }
    markStepsOrigin(origin)
    navigateTo({ view: 'plan', month: navigation.month, planDestination: destination }, { historyState: transfersOriginState(origin, destination) })
  }
  const returnToMonth = () => {
    if (hasLiveTransfersOrigin(navigation.planDestination)) window.history.back()
    else navigateTo({ view: 'month', month: navigation.month })
  }
  const clearPlanDestination = () => navigateTo({ planDestination: null })
  const viewAffectedTransfers = (impact: BudgetImpact) => navigateTo({ view: 'month', month: impact.month }, { historyState: { northAffectedTransfers: impact } })
  const affectedTransfers = view === 'month' && window.history.state?.northAffectedTransfers?.month === navigation.month ? window.history.state.northAffectedTransfers as BudgetImpact : null
  /** "Review Immy's items" from Home: Plan, filtered to that person's accounts once it opens. */
  const reviewPersonOnPlan = (personId: string) => navigateTo({ view: 'plan', month: navigation.month }, { historyState: { northReviewPerson: personId } })
  const reviewPersonId = view === 'plan' && typeof window.history.state?.northReviewPerson === 'string' ? window.history.state.northReviewPerson as string : undefined
  /** Home's rows and figures: each names where it opens. Bring in opens Spending with its sheet up. */
  const openFromHome = (target: HomeTarget) => {
    if (target.view === 'plan') { if (target.reviewPersonId) reviewPersonOnPlan(target.reviewPersonId); else navigateTo({ view: 'plan' }); return }
    if (target.view === 'month') { navigateTo({ view: 'month', month: target.month, pot: target.potId ?? null, close: !!target.close }); return }
    if (target.view === 'settings') { navigateTo({ view: 'settings', section: target.section }); return }
    navigateTo({ view: 'spending', section: target.section, statement: target.statementKey ?? null }, target.bringIn ? { historyState: { northBringIn: true } } : {})
  }
  const loading = (text = 'Loading…') => <p className="budget-loading" role="status">{text}</p>
  return <AppLayout navigation={{ currentView: view, warning: error, saveStatus: status, email, onSignOut, onSelectView: selectView, setupComplete, counts, homeTitle: formatMonth(navigation.month) }}>
    {UiGallery && new URLSearchParams(search).get('view') === 'ui-gallery'
      ? <Suspense fallback={null}><UiGallery/></Suspense>
      : !document.workflow.setupComplete
      ? <SetupWizard document={document} setDocument={setDocument} month={navigation.month} onFinish={() => navigateTo({ view: 'home' })} />
      : view === 'settings'
      ? <Suspense fallback={loading()}><SettingsPage document={document} setDocument={setDocument} month={navigation.month} section={setupComplete ? navigation.section as SettingsSection | null : 'household'} onSelectSection={section => navigateTo({ view: 'settings', section })} onMonthChange={month => navigateTo({ month })} setupComplete={setupComplete} status={status} warning={error} email={email} onSignOut={onSignOut}/></Suspense>
      : view === 'spending'
      ? <Suspense fallback={loading()}><Spending document={document} setDocument={setDocument} view={spendingSection(navigation)} onSelectView={section => navigateTo({ view: 'spending', section, statement: null })} onOpenCardSettings={() => navigateTo({ view: 'settings', section: 'cards' })} onOpenRules={() => navigateTo({ view: 'settings', section: 'rules' })} onOpenMonth={pot => navigateTo({ view: 'month', pot: pot ?? null })} statementKey={navigation.statement} onOpenStatement={statement => navigateTo({ view: 'spending', section: 'statements', statement })}/></Suspense>
      : view === 'home'
      ? <Suspense fallback={loading()}><Home document={document} month={navigation.month} onOpen={openFromHome}/></Suspense>
      : <Suspense fallback={loading('Loading budget…')}><MonthlyBudget reviewPersonId={reviewPersonId} document={document} setDocument={setDocument} saveStatus={status} accountBacked={!!onSignOut} view={view === 'month' ? 'month' : 'plan'} month={navigation.month} onMonthChange={month => navigateTo({ month, pot: null, close: false })} onSeeTransferItems={seeTransferItems} planDestination={navigation.planDestination} onClearPlanDestination={clearPlanDestination} onViewAffectedTransfers={viewAffectedTransfers} affectedTransfers={affectedTransfers} stepsReturn={view === 'month' ? stepsReturnFromState() : null} onReturnToTransfers={returnToMonth} onOpenPlan={() => navigateTo({ view: 'plan' })} hasTransfersOrigin={hasLiveTransfersOrigin(navigation.planDestination)} planItemId={view === 'plan' && typeof window.history.state?.northPlanItem === 'string' ? window.history.state.northPlanItem : undefined}
          potId={navigation.pot} closing={navigation.close} onOpenPot={pot => navigateTo({ view: 'month', pot, close: false })} onOpenClose={close => navigateTo({ view: 'month', close, pot: null })} onOpenSort={() => navigateTo({ view: 'spending', section: 'sort' })} onOpenSettings={section => navigateTo({ view: 'settings', section, month: navigation.month })}/></Suspense>}
  </AppLayout>
}

function LocalApp() {
  const state = useBudgetDocument()
  return <BudgetApp {...state} />
}

function CloudApp({ session }: { session: Session }) {
  const state = useCloudBudget(session.user)
  const signOut = () => { void supabase?.auth.signOut() }
  if (state.conflict) return <DocumentConflict onChoose={state.chooseConflict} />
  if (!state.document) return <main className="account-screen"><h1>{state.status || 'Budget unavailable'}</h1>{state.error && <p role="alert" className="error-summary">{state.error}</p>}<div className="button-row"><button className="secondary-button" onClick={() => window.location.reload()}>Try again</button><button className="text-button" onClick={signOut}>Sign out</button></div></main>
  return <BudgetApp document={state.document} setDocument={state.setDocument} status={state.status} error={state.error} email={session.user.email ?? undefined} onSignOut={signOut} />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    void supabase.auth.getSession().then(({ data, error }) => { if (!error) setSession(data.session); setLoading(false) })
    return () => subscription.unsubscribe()
  }, [])
  if (!supabase) return <LocalApp />
  if (loading) return <main className="account-screen"><p role="status">Checking your account…</p></main>
  return session ? <CloudApp key={session.user.id} session={session} /> : <AccountAccess />
}
