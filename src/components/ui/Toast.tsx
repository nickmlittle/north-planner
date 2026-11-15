import './Toast.css'

export type ToastAction = { label: string; onClick: () => void }

/**
 * A short, polite confirmation ("Copied £2,215.45", "Groceries saved"), with up to two follow-up actions
 * ("Open Groceries", "Undo"). Bottom right on desktop, above the tab bar on phones. Empty, it shows nothing.
 */
export function Toast({ message, action }: { message: string; action?: ToastAction | ToastAction[] }) {
  const actions = message ? [action ?? []].flat() : []
  return <div className={`toast${actions.length ? ' has-action' : ''}`} role="status">{message}{actions.map(row => <button key={row.label} type="button" className="toast-action" onClick={row.onClick}>{row.label}</button>)}</div>
}
