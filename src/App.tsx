import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { UserRoundGroup, Wallet } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { BudgetDocument } from './domain/budgetDocument'
import { HouseholdSetup } from './pages/HouseholdSetup'
import { useBudgetDocument } from './state/useBudgetDocument'
import { useCloudBudget } from './state/useCloudBudget'
import { supabase } from './state/supabase'
import { AccountAccess } from './components/AccountAccess'
import { DocumentConflict } from './components/DocumentConflict'
import { AppLayout } from './components/AppLayout'
import { navigateTo, type PlannerDestination, type PlannerView } from './state/navigation'

const MonthlyBudget = lazy(() => import('./pages/MonthlyBudget').then(module => ({ default: module.MonthlyBudget })))

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
  const requested = new URLSearchParams(search).get('view')
  const setupComplete = !!document.household.name.trim() && document.household.adults.length > 0 && document.household.adults.every(person => !!person.name.trim())
  const view: PlannerView = !setupComplete || !document.workflow.setupComplete || requested === 'household' ? 'household' : 'budget'
  const routes: Array<PlannerDestination & { render: () => ReactNode }> = [
    {
      id: 'household', label: 'Household', Icon: UserRoundGroup,
      render: () => <HouseholdSetup document={document} setDocument={setDocument} onContinue={() => { setDocument(current => ({ ...current, workflow: { setupComplete: true } })); navigateTo('budget') }} />,
    },
    {
      id: 'budget', label: 'Budget', Icon: Wallet,
      render: () => <Suspense fallback={<p className="budget-loading" role="status">Loading budget…</p>}><MonthlyBudget document={document} setDocument={setDocument} saveStatus={status} accountBacked={!!onSignOut} /></Suspense>,
    },
  ]
  return <AppLayout navigation={{ currentView: view, destinations: routes, warning: error, saveStatus: status, email, onSignOut, onSelectView: navigateTo }}>
    {routes.find(route => route.id === view)!.render()}
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
