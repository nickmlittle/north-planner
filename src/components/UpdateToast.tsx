import { useEffect } from 'react'
import { useToast } from './ui'
import { UPDATE_READY, type UpdateReady } from '../registerServiceWorker'

/** "A new version of North is ready · Reload", once, when a new build has installed. Nothing reloads by itself. */
export function UpdateToast() {
  const { show, toast } = useToast()
  useEffect(() => {
    const ready = (event: Event) => show('A new version of North is ready', { label: 'Reload', onClick: (event as CustomEvent<UpdateReady>).detail.reload })
    window.addEventListener(UPDATE_READY, ready)
    return () => window.removeEventListener(UPDATE_READY, ready)
  })
  return toast
}
