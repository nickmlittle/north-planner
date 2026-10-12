import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../state/supabase'

function supportsPasskeys() {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window
}

export function AccountAccess() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [showEmail, setShowEmail] = useState(false)

  async function signInWithPasskey() {
    if (!supabase) return
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPasskey()
      setMessage(error ? error.message : '')
    } catch {
      setMessage('Passkey sign-in could not be completed. Try again or use another sign-in option.')
    } finally {
      setBusy(false)
    }
  }

  async function continueWithGoogle() {
    if (!supabase) return
    setBusy(true); setMessage('')
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
      if (error) setMessage(error.message)
    } catch {
      setMessage('Google sign-in could not be started. Try again or use another sign-in option.')
    } finally {
      setBusy(false)
    }
  }

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage('')
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
      setMessage(error ? error.message : 'Check your email for a sign-in link. You can safely close this page.')
    } catch {
      setMessage('The sign-in link could not be sent. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="account-screen">
    <p className="eyebrow">North Planner</p><h1>Save your household</h1>
    <p className="page-description">Sign in with a passkey to access your household on any device.</p>
    <div className="account-options">
      <button className="primary-button" type="button" onClick={() => void signInWithPasskey()} disabled={busy || !supportsPasskeys()}>
        {busy ? 'Please wait…' : 'Sign in with a passkey'}
      </button>
      {!supportsPasskeys() && <p className="account-hint">Passkeys aren’t supported in this browser. Continue with Google or use an email link.</p>}
      <button className="secondary-button" type="button" onClick={() => void continueWithGoogle()} disabled={busy}>
        Continue with Google
      </button>
      <p className="account-hint">New here? Continue with Google, then add a passkey to make future sign-ins faster.</p>
      <button className="text-button" type="button" onClick={() => { setShowEmail(value => !value); setMessage('') }} aria-expanded={showEmail}>
        {showEmail ? 'Hide email sign-in' : 'Use an email sign-in link'}
      </button>
    </div>
    {showEmail && <form className="account-form" onSubmit={sendLink}>
      <label htmlFor="account-email">Email address</label>
      <input id="account-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
      <button className="secondary-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
    </form>}
    {message && <p role="status" className="context-note">{message}</p>}
  </main>
}
