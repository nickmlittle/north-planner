import { describe, expect, it, vi } from 'vitest'
import { watchForUpdate } from './registerServiceWorker'

function fakeWorker(state = 'installing') {
  const listeners: Array<() => void> = []
  return { state, postMessage: vi.fn(), addEventListener: (_type: 'statechange', listener: () => void) => { listeners.push(listener) }, become(next: string) { this.state = next; listeners.forEach(listener => listener()) } }
}
function fakeRegistration(waiting: ReturnType<typeof fakeWorker> | null = null) {
  const listeners: Array<() => void> = []
  return { waiting, installing: null as ReturnType<typeof fakeWorker> | null, addEventListener: (_type: 'updatefound', listener: () => void) => { listeners.push(listener) }, found(worker: ReturnType<typeof fakeWorker>) { this.installing = worker; listeners.forEach(listener => listener()) } }
}

describe('service worker updates', () => {
  it('says a new version is ready once it has installed while an old one controls the page', () => {
    const registration = fakeRegistration(), ready = vi.fn()
    watchForUpdate(registration, () => true, ready)
    const worker = fakeWorker()
    registration.found(worker)
    expect(ready).not.toHaveBeenCalled()
    worker.become('installed')
    expect(ready).toHaveBeenCalledWith(worker)
    worker.become('installed')
    expect(ready).toHaveBeenCalledOnce()
  })

  it('says nothing on the first install, when no worker controls the page yet', () => {
    const registration = fakeRegistration(), ready = vi.fn()
    watchForUpdate(registration, () => false, ready)
    const worker = fakeWorker()
    registration.found(worker)
    worker.become('installed')
    expect(ready).not.toHaveBeenCalled()
  })

  it('picks up a version already waiting when the page loads', () => {
    const waiting = fakeWorker('installed'), ready = vi.fn()
    watchForUpdate(fakeRegistration(waiting), () => true, ready)
    expect(ready).toHaveBeenCalledWith(waiting)
  })
})
