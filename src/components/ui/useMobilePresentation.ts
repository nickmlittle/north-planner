import { useSyncExternalStore } from 'react'
import { MOBILE_QUERY } from '../../breakpoints'

const subscribe = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getSnapshot = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches

/** Whether the phone presentation is showing (MOBILE_QUERY). jsdom has no matchMedia, so tests get phones. */
export function useMobilePresentation() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
