import './Toast.css'

/** A short, polite confirmation ("Copied £2,215.45", "Saved"). Top right on desktop, above the tab bar on phones. Empty, it shows nothing. */
export function Toast({ message }: { message: string }) {
  return <p className="toast" role="status">{message}</p>
}
