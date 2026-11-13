import { useEffect, useRef, useState } from 'react'
import { Toast, type ToastAction } from './Toast'

/**
 * Show a message in a Toast for 2.5s, or 8s when it carries an action. Render `toast` once where the page's
 * status line belongs.
 */
export function useToast() {
  const [message, setMessage] = useState<{ text: string; action?: ToastAction }>({ text: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const hide = () => { clearTimeout(timer.current); setMessage({ text: '' }) }
  const show = (text: string, action?: ToastAction) => {
    setMessage({ text, action: action && { label: action.label, onClick: () => { hide(); action.onClick() } } })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage({ text: '' }), action ? 8000 : 2500)
  }
  return { show, hide, toast: <Toast message={message.text} action={message.action}/> }
}
