import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { HouseholdJourney } from './pages/HouseholdJourney'
import { HouseholdDashboard } from './pages/HouseholdDashboard'
import { HouseholdPlanner } from './pages/HouseholdPlanner'
import { MonthlyBudget } from './pages/MonthlyBudget'
import { useAppDocument } from './state/useAppDocument'
import { useCloudDocument } from './state/useCloudDocument'
import { supabase } from './state/supabase'
import { AccountAccess } from './components/AccountAccess'
import { DocumentConflict } from './components/DocumentConflict'
import { isSettingsSection, navigateToBudget, navigateToDashboard, navigateToHousehold, navigateToSettings } from './state/navigation'

function subscribeLocation(callback: () => void) { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback) }
function getLocationSearch() { return window.location.search }

function PlannerApp() {
  const state = useAppDocument()
  const search = useSyncExternalStore(subscribeLocation, getLocationSearch, () => '')
  const params = new URLSearchParams(search)
  const route = params.get('settings')
  const view = params.get('view')
  const settingsSection = isSettingsSection(route) ? route : 'planning'
  const chooseSettings = (section: typeof settingsSection) => {
    navigateToSettings(section)
  }
  const chooseView = (target: 'dashboard' | 'household' | 'budget') => target === 'dashboard' ? navigateToDashboard() : target === 'budget' ? navigateToBudget() : navigateToHousehold()
  if (view === 'budget') return <MonthlyBudget document={state.document} setDocument={state.setDocument} warning={state.warning} onSelectSettings={chooseSettings} onSelectView={chooseView} />
  if (view === 'household') return <HouseholdJourney {...state} standalone householdSection={Number(params.get('section')) || 8} onSelectHouseholdSection={navigateToHousehold} onSelectView={chooseView} />
  if (view === 'settings' && isSettingsSection(route)) return <HouseholdPlanner {...state} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" />
  if (view === 'dashboard') return <HouseholdDashboard {...state} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" />
  return state.document.step === 9 ? <HouseholdDashboard {...state} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" /> : state.document.step === 10 ? <HouseholdPlanner {...state} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" /> : <HouseholdJourney {...state} onSelectView={chooseView} />
}

function CloudPlanner({ session }: { session: Session }) {
  const state = useCloudDocument(session.user)
  const search = useSyncExternalStore(subscribeLocation, getLocationSearch, () => '')
  async function signOut() { await supabase?.auth.signOut() }
  if (state.needsChoice) return <DocumentConflict onChoose={choice => void state.chooseConflict(choice)} />
  if (!state.document) return <main className="account-screen"><h1>{state.status || 'Household unavailable'}</h1>{state.error && <p role="alert" className="error-summary">{state.error}</p>}<div className="button-row">{state.recoveryOriginal && <><button className="secondary-button" onClick={state.downloadOriginal}>Download original JSON</button><button className="danger-button" onClick={() => void state.replaceUnreadableWithFreshDraft()}>Replace unreadable save with a fresh household</button></>}<button className="secondary-button" onClick={() => window.location.reload()}>Try again</button><button className="text-button" onClick={() => void signOut()}>Sign out</button></div></main>
  const document = state.document
  const props = { ...state, document, warning: state.error, saveStatus: state.status, replaceSavedDraft: () => {}, accountBacked: true, email: session.user.email ?? undefined, onSignOut: () => void signOut() }
  const params = new URLSearchParams(search)
  const route = params.get('settings')
  const view = params.get('view')
  const settingsSection = isSettingsSection(route) ? route : 'planning'
  const chooseSettings = (section: typeof settingsSection) => {
    navigateToSettings(section)
  }
  const chooseView = (target: 'dashboard' | 'household' | 'budget') => target === 'dashboard' ? navigateToDashboard() : target === 'budget' ? navigateToBudget() : navigateToHousehold()
  if (view === 'budget') return <><MonthlyBudget document={document} setDocument={state.setDocument} warning={state.error} saveStatus={state.status} onSelectSettings={chooseSettings} onSelectView={chooseView} />{state.error && <aside className="storage-warning cloud-warning" role="alert">{state.error}</aside>}</>
  if (view === 'household') return <><HouseholdJourney {...props} standalone householdSection={Number(params.get('section')) || 8} onSelectHouseholdSection={navigateToHousehold} onSelectView={chooseView} />{state.error && <aside className="storage-warning cloud-warning" role="alert">{state.error}</aside>}</>
  return <>
    {view === 'settings' && isSettingsSection(route) ? <HouseholdPlanner {...props} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" /> : view === 'dashboard' ? <HouseholdDashboard {...props} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" /> : document.step === 9 ? <HouseholdDashboard {...props} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" /> : document.step === 10 ? <HouseholdPlanner {...props} settingsSection={settingsSection} onSelectSettings={chooseSettings} onSelectView={chooseView} currentView="dashboard" /> : <HouseholdJourney {...props} onSelectView={chooseView} />}
    {state.error && <aside className="storage-warning cloud-warning" role="alert">{state.error}</aside>}
  </>
}

function AccountApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setLoading(false) })
    void supabase.auth.getSession().then(({ data, error }) => { if (!error) setSession(data.session); setLoading(false) })
    return () => subscription.unsubscribe()
  }, [])
  if (!supabase) return <PlannerApp />
  if (loading) return <main className="account-screen"><p role="status">Checking your account…</p></main>
  return session ? <CloudPlanner key={session.user.id} session={session} /> : <AccountAccess />
}

export default function App() {
  return <AccountApp />
}
