import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import type { Session } from '@supabase/supabase-js'
import { householdReady, type BudgetDocument } from './domain/budgetDocument'
import type { BudgetImpact } from './domain/budgetImpact'
import { HouseholdSetup } from './pages/HouseholdSetup'
import { SetupWizard } from './pages/SetupWizard'
import { useBudgetDocument } from './state/useBudgetDocument'
import { useCloudBudget } from './state/useCloudBudget'
import { supabase } from './state/supabase'
import { AccountAccess } from './components/AccountAccess'
import { DocumentConflict } from './components/DocumentConflict'
import { AppLayout } from './components/AppLayout'
import { formatMonth } from './formatting/month'
import { hasLiveTransfersOrigin, markStepsOrigin, navigateTo, parseNavigation, stepsReturnFromState, transfersOriginState, type BudgetView, type PlanDestination, type PlannerView } from './state/navigation'

const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })))
const MonthlyBudget = lazy(() => import('./pages/MonthlyBudget').then(module => ({ default: module.MonthlyBudget })))
const Spending = lazy(() => import('./pages/Spending').then(module => ({ default: module.Spending })))

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
  const navigation = parseNavigation(search)
  const setupComplete = householdReady(document.household) && document.workflow.setupComplete
  const view: PlannerView = !setupComplete || navigation.view === 'household' ? 'household' : navigation.view
  const selectView = (nextView: PlannerView) => { if (nextView !== view) navigateTo({ view: nextView }) }
  const selectBudgetView = (nextView: BudgetView) => {
    if (!setupComplete || (view === 'budget' && navigation.budgetView === nextView)) return
    navigateTo({ view: 'budget', budgetView: nextView })
  }
  /** "See items" in the payday steps: Plan filtered to that account, with Back returning to the same step. */
  const seeTransferItems = (accountId: string) => {
    const origin = { key: crypto.randomUUID(), month: navigation.month, accountId }, destination: PlanDestination = { kind: 'account', id: accountId }
    markStepsOrigin(origin)
    navigateTo({ view: 'budget', budgetView: 'plan', month: navigation.month, planDestination: destination }, { historyState: transfersOriginState(origin, destination) })
  }
  const returnToTransfers = () => {
    if (hasLiveTransfersOrigin(navigation.planDestination)) window.history.back()
    else navigateTo({ view: 'budget', budgetView: 'transfers', month: navigation.month, planDestination: null })
  }
  const clearPlanDestination = () => navigateTo({ planDestination: null })
  const viewAffectedTransfers = (impact: BudgetImpact) => navigateTo({ view: 'budget', budgetView: 'transfers', month: impact.month, planDestination: null }, { historyState: { northAffectedTransfers: impact } })
  const affectedTransfers = navigation.budgetView === 'transfers' && window.history.state?.northAffectedTransfers?.month === navigation.month ? window.history.state.northAffectedTransfers as BudgetImpact : null
  /** "Review Immy's items" from Home: Plan, filtered to that person's accounts once it opens. */
  const reviewPersonOnPlan = (personId: string) => navigateTo({ view: 'budget', budgetView: 'plan', month: navigation.month, planDestination: null }, { historyState: { northReviewPerson: personId } })
  const reviewPersonId = view === 'budget' && navigation.budgetView === 'plan' && typeof window.history.state?.northReviewPerson === 'string' ? window.history.state.northReviewPerson as string : undefined
  return <AppLayout navigation={{ currentView: view, budgetView: navigation.budgetView, warning: error, saveStatus: status, email, onSignOut, onSelectView: selectView, onSelectBudgetView: selectBudgetView, setupComplete, homeTitle: formatMonth(navigation.month) }}>
    {!document.workflow.setupComplete
      ? <SetupWizard document={document} setDocument={setDocument} month={navigation.month} onFinish={() => navigateTo({ view: 'budget', budgetView: 'plan' })} />
      : view === 'household'
      ? <HouseholdSetup document={document} setDocument={setDocument} onContinue={() => { setDocument(current => ({ ...current, workflow: { setupComplete: true } })); navigateTo({ view: 'budget', budgetView: 'plan' }) }} />
      : view === 'spending'
      ? <Suspense fallback={<p className="budget-loading" role="status">Loading…</p>}><Spending document={document} setDocument={setDocument} view={navigation.spendingView} onSelectView={spendingView => navigateTo({ view: 'spending', spendingView })} onOpenHousehold={() => navigateTo({ view: 'household' })}/></Suspense>
      : view === 'home'
      ? <Suspense fallback={<p className="budget-loading" role="status">Loading…</p>}><Home document={document} month={navigation.month} onOpenPlan={() => navigateTo({ view: 'budget', budgetView: 'plan', planDestination: null })} onOpenTransfers={() => navigateTo({ view: 'budget', budgetView: 'transfers', planDestination: null })} onReviewPerson={reviewPersonOnPlan}/></Suspense>
      : <Suspense fallback={<p className="budget-loading" role="status">Loading budget…</p>}><MonthlyBudget reviewPersonId={reviewPersonId} document={document} setDocument={setDocument} saveStatus={status} warning={error} email={email} onSignOut={onSignOut} accountBacked={!!onSignOut} mobileBudgetView={navigation.budgetView} month={navigation.month} onMonthChange={month => navigateTo({ month })} onSeeTransferItems={seeTransferItems} planDestination={navigation.planDestination} onClearPlanDestination={clearPlanDestination} onViewAffectedTransfers={viewAffectedTransfers} affectedTransfers={affectedTransfers} stepsReturn={navigation.budgetView === 'transfers' ? stepsReturnFromState() : null} onReturnToTransfers={returnToTransfers} onOpenPlan={() => navigateTo({ view: 'budget', budgetView: 'plan', planDestination: null })} hasTransfersOrigin={hasLiveTransfersOrigin(navigation.planDestination)} planItemId={navigation.budgetView === 'plan' && typeof window.history.state?.northPlanItem === 'string' ? window.history.state.northPlanItem : undefined} /></Suspense>}
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
