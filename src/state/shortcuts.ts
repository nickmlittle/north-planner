import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

/**
 * Keyboard shortcuts (audit 3 PR 07): one registry and one `keydown` listener on window. A component registers its
 * shortcuts with `useShortcut` while it's mounted; the ? sheet lists them with `useShortcuts`. Shortcuts are an
 * enhancement: every action they run stays clickable.
 *
 * `keys` is one key ('/', 'n', '[', '?', ','), `mod+` and a key ('mod+\\': ⌘ on macOS, Ctrl elsewhere), or a
 * sequence of two ('g h': G, then H within a second). Nothing fires while typing in a field, during IME composition,
 * while a modal dialog is open, or when a component has already handled the key (`preventDefault`).
 */
export type ShortcutGroup = 'Go to' | 'This page' | 'Lists' | 'General'
/** `display`: listed in ? but handled elsewhere (a list's own keys), so the global listener ignores it. */
export type Shortcut = { keys: string; description: string; group: ShortcutGroup; run: () => void; when?: () => boolean; display?: boolean }

/** How long the second key of a sequence ("g", then "m") has to arrive. */
export const SEQUENCE_MS = 1000

type Entry = { shortcut: () => Shortcut }
const entries: Entry[] = []
let snapshot: Shortcut[] = []
const listeners = new Set<() => void>()
let pending: { prefix: string; timer: ReturnType<typeof setTimeout> } | null = null
const pendingListeners = new Set<() => void>()

const notify = () => { snapshot = entries.map(entry => entry.shortcut()); listeners.forEach(listener => listener()) }
const setPending = (prefix: string | null) => {
  if (pending) clearTimeout(pending.timer)
  pending = prefix ? { prefix, timer: setTimeout(() => setPending(null), SEQUENCE_MS) } : null
  pendingListeners.forEach(listener => listener())
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Typing somewhere: a field, a select, or editable text. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

/** The key as `keys` spells it: 'n', '/', '?', 'mod+\\'. Shift only counts as part of a symbol ('?'), never with a letter. */
function eventKey(event: KeyboardEvent): string | null {
  const mod = isMac() ? event.metaKey : event.ctrlKey
  const otherModifier = isMac() ? event.ctrlKey : event.metaKey
  if (event.altKey || otherModifier) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (event.shiftKey && /^[a-z]$/.test(key)) return null
  return mod ? `mod+${key}` : key
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key === 'Process') return
  const key = eventKey(event)
  if (!key) return
  if (isTyping(event.target) && !key.startsWith('mod+')) return
  if (window.document.querySelector('[aria-modal="true"]')) return
  const active = entries.map(entry => entry.shortcut()).filter(shortcut => !shortcut.display && (!shortcut.when || shortcut.when()))
  // The newest registration wins, so a page can take a key from the shell.
  const find = (keys: string) => [...active].reverse().find(shortcut => shortcut.keys === keys)
  const sequence = pending ? `${pending.prefix} ${key}` : null
  if (pending) setPending(null)
  const match = (sequence && find(sequence)) || (!sequence ? find(key) : undefined)
  if (match) { event.preventDefault(); match.run(); return }
  if (!sequence && active.some(shortcut => shortcut.keys.startsWith(`${key} `))) { event.preventDefault(); setPending(key) }
}

let listening = false
const listen = () => { if (listening || typeof window === 'undefined') return; window.addEventListener('keydown', onKeyDown); listening = true }

/** Registers `shortcut` while the component is mounted (pass null to register nothing). The latest `run` is always used. */
export function useShortcut(shortcut: Shortcut | null) {
  const latest = useRef(shortcut)
  useLayoutEffect(() => { latest.current = shortcut })
  const keys = shortcut?.keys
  useEffect(() => {
    if (!keys) return
    const entry: Entry = { shortcut: () => latest.current! }
    entries.push(entry)
    listen()
    notify()
    return () => { entries.splice(entries.indexOf(entry), 1); notify() }
  }, [keys])
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
/** Every shortcut registered right now, in registration order (for the ? sheet). */
export function useShortcuts(): Shortcut[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

const subscribePending = (listener: () => void) => { pendingListeners.add(listener); return () => { pendingListeners.delete(listener) } }
/** The first key of a sequence while the second is awaited ('g'), else null. */
export function usePendingSequence(): string | null {
  return useSyncExternalStore(subscribePending, () => pending?.prefix ?? null, () => null)
}

/** The keys as they're shown: 'g h' → ['G', 'H'], 'mod+\\' → ['⌘', '\\'] (Ctrl elsewhere). */
export function keyLabels(keys: string): string[] {
  return keys.split(' ').flatMap(part => part.startsWith('mod+') ? [isMac() ? '⌘' : 'Ctrl', part.slice(4)] : [part]).map(part => part.length === 1 ? part.toUpperCase() : part)
}
