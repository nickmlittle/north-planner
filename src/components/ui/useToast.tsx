import { useEffect, useRef, useState } from 'react'
import { Toast, type ToastAction } from './Toast'

/**
 * Show a message in a Toast for 2.5s, or 8s when it carries an action (or two). Render `toast` once where the page's
 * status line belongs.
 */
export function useToast() {
  const [message, setMessage] = useState<{ text: string; action?: ToastAction[] }>({ text: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const hide = () => { clearTimeout(timer.current); setMessage({ text: '' }) }
  const show = (text: string, action?: ToastAction | ToastAction[]) => {
    const actions = [action ?? []].flat().map(row => ({ label: row.label, onClick: () => { hide(); row.onClick() } }))
    setMessage({ text, ...actions.length ? { action: actions } : {} })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage({ text: '' }), actions.length ? 8000 : 2500)
  }
  return { show, hide, toast: <Toast message={message.text} action={message.action}/> }
}
