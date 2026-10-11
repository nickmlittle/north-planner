import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../state/supabase'

export function AccountAccess() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage('')
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    setBusy(false)
    setMessage(error ? error.message : 'Check your email for a sign-in link. You can safely close this page.')
  }
  return <main className="account-screen">
    <p className="eyebrow">North Planner</p><h1>Save your household</h1>
    <p className="page-description">Sign in with an email link to access your household on any device.</p>
    <form className="account-form" onSubmit={sendLink}>
      <label htmlFor="account-email">Email address</label>
      <input id="account-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
    </form>
    {message && <p role="status" className="context-note">{message}</p>}
  </main>
}
