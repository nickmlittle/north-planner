import { useEffect, useRef, useState } from 'react'
import { Toast } from './Toast'

/** Show a message in a Toast for 2.5s. Render `toast` once where the page's status line belongs. */
export function useToast() {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (text: string) => {
    setMessage(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), 2500)
  }
  return { show, toast: <Toast message={message}/> }
}
