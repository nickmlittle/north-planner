/**
 * Registers North's service worker in production builds only (audit 3 PR 21). It never replaces a running version
 * by itself: when a new one has installed and is waiting, `onUpdate` gets a `reload` that hands over to it and reloads.
 */
export const UPDATE_READY = 'north:update-ready'
export type UpdateReady = { reload: () => void }

type WorkerLike = { state: string; postMessage: (message: unknown) => void; addEventListener: (type: 'statechange', listener: () => void) => void }
type RegistrationLike = { waiting: WorkerLike | null; installing: WorkerLike | null; addEventListener: (type: 'updatefound', listener: () => void) => void }

/**
 * Calls `onReady` once a new worker is waiting while an old one controls the page: the first install (no controller)
 * isn't an update. `reload` asks the waiting worker to take over; the page reloads when control changes.
 */
export function watchForUpdate(registration: RegistrationLike, hasController: () => boolean, onReady: (worker: WorkerLike) => void) {
  let told = false
  const tell = (worker: WorkerLike | null) => { if (worker && hasController() && !told) { told = true; onReady(worker) } }
  if (registration.waiting) tell(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    if (!worker) return
    worker.addEventListener('statechange', () => { if (worker.state === 'installed') tell(worker) })
  })
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js?v=${__NORTH_BUILD__}`, { scope: base }).then(registration => {
      watchForUpdate(registration, () => !!navigator.serviceWorker.controller, worker => {
        const reload = () => {
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
          worker.postMessage({ type: 'skip-waiting' })
        }
        window.dispatchEvent(new CustomEvent<UpdateReady>(UPDATE_READY, { detail: { reload } }))
      })
    }).catch(() => { /* Offline support is an extra; the app works without it. */ })
  })
}
