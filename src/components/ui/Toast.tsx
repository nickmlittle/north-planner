import './Toast.css'

export type ToastAction = { label: string; onClick: () => void }

/**
 * A short, polite confirmation ("Copied £2,215.45", "Groceries saved"), with at most one follow-up action
 * ("View affected Payday steps"). Bottom right on desktop, above the tab bar on phones. Empty, it shows nothing.
 */
export function Toast({ message, action }: { message: string; action?: ToastAction }) {
  return <div className={`toast${action && message ? ' has-action' : ''}`} role="status">{message}{action && message && <button type="button" className="toast-action" onClick={action.onClick}>{action.label}</button>}</div>
}
