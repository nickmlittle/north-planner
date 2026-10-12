import { useEffect, useState } from 'react'
import { supabase } from '../state/supabase'

export function PasskeySetup() {
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function checkPasskeys() {
      if (!supabase) return
      try {
        const { data, error } = await supabase.auth.passkey.list()
        if (!active) return
        if (error) {
          setMessage('We couldn’t check for a passkey. You can still try adding one.')
          setHasPasskey(false)
        } else {
          setHasPasskey(data.length > 0)
        }
      } catch {
        if (!active) return
        setMessage('We couldn’t check for a passkey. You can still try adding one.')
        setHasPasskey(false)
      } finally {
        if (active) setChecking(false)
      }
    }
    void checkPasskeys()
    return () => { active = false }
  }, [])

  async function addPasskey() {
    if (!supabase) return
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.auth.registerPasskey()
      if (error) setMessage(error.message)
      else { setHasPasskey(true); setMessage('Passkey added. You can use it the next time you sign in.') }
    } catch {
      setMessage('Passkey setup could not be completed. Try again or use an email sign-in link.')
    } finally {
      setBusy(false)
    }
  }

  if (checking || (hasPasskey && !message)) return null
  return <div className="passkey-setup">
    {!hasPasskey && <button className="secondary-button" type="button" onClick={() => void addPasskey()} disabled={busy}>
      {busy ? 'Setting up…' : 'Add a passkey'}
    </button>}
    {message && <span role="status">{message}</span>}
  </div>
}
