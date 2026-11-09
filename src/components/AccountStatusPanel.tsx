import { Check } from 'lucide-react'
import { statusMark } from './saveStatus'

/** Save status, any storage warning, and the signed-in account with Sign out. Shared by the phone's account sheets. */
export function AccountStatusPanel({ status, warning, email, onSignOut, onBeforeSignOut }: { status: string; warning: string; email?: string; onSignOut?: () => void; onBeforeSignOut?: () => void }) {
  return <>
    <p className="mobile-utility-status">{status === 'Saved' ? <Check aria-hidden="true" /> : <span aria-hidden="true">{statusMark(status)}</span>}{status}</p>
    {warning && <p role="alert" className="mobile-utility-warning">{warning}</p>}
    {onSignOut && <div className="mobile-utility-account"><p>{email ?? 'Signed in'}</p><button type="button" onClick={() => { onBeforeSignOut?.(); onSignOut() }}>Sign out</button></div>}
  </>
}
