import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { HouseholdJourney } from './pages/HouseholdJourney'
import { HouseholdDashboard } from './pages/HouseholdDashboard'
import { HouseholdPlanner } from './pages/HouseholdPlanner'
import { useAppDocument } from './state/useAppDocument'
import { useCloudDocument } from './state/useCloudDocument'
import { supabase } from './state/supabase'
import { AccountAccess } from './components/AccountAccess'
import { PasskeySetup } from './components/PasskeySetup'
import { DocumentConflict } from './components/DocumentConflict'

function PlannerApp() {
  const state = useAppDocument()
  return state.document.step === 9 ? <HouseholdDashboard {...state} /> : state.document.step === 10 ? <HouseholdPlanner {...state} /> : <HouseholdJourney {...state} />
}

function CloudPlanner({ session }: { session: Session }) {
  const state = useCloudDocument(session.user)
  async function signOut() { await supabase?.auth.signOut() }
  if (state.needsChoice) return <DocumentConflict onChoose={choice => void state.chooseConflict(choice)} />
  if (!state.document) return <main className="account-screen"><h1>{state.status || 'Household unavailable'}</h1>{state.error && <p role="alert" className="error-summary">{state.error}</p>}<div className="button-row"><button className="secondary-button" onClick={() => window.location.reload()}>Try again</button><button className="text-button" onClick={() => void signOut()}>Sign out</button></div></main>
  const document = state.document
  const props = { ...state, document, warning: state.error, saveStatus: state.status, replaceSavedDraft: () => {}, accountBacked: true }
  return <><div className="account-bar"><span>Signed in as {session.user.email ?? 'your account'}</span><span role="status">{state.status}</span><PasskeySetup /><button className="text-button" onClick={() => void signOut()}>Sign out</button></div>
    {document.step === 9 ? <HouseholdDashboard {...props} /> : document.step === 10 ? <HouseholdPlanner {...props} /> : <HouseholdJourney {...props} />}
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
