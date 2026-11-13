import { useEffect, useId, useRef, type FocusEvent, type KeyboardEvent } from 'react'
import { useShortcut } from './shortcuts'
import './useListNavigation.css'

/**
 * Keyboard on a list (audit 3 PR 18), the same everywhere: the list is one Tab stop (roving tabindex), J/↓ and K/↑
 * move, Home and End jump, ↵ opens, Esc leaves to the list, and a few letters act on the focused row.
 *
 * Rows are elements marked `data-list-row` inside the container that gets `listProps`. What a key does is the row's
 * own control, found by data attribute and clicked, so every action stays a visible, clickable button:
 * `data-list-open` (↵; a row that is itself a button opens natively), `data-list-tick` (X), `data-list-copy` (C),
 * `data-list-edit` (E), `data-list-duplicate` (D) and `data-list-remove` (⌫ or Delete). Controls inside a row leave
 * the Tab order, because the keys reach them.
 */
export type ListKey = 'x' | 'c' | 'e' | 'd' | 'delete'
const ACTIONS: Record<string, { attribute: string; key: ListKey }> = {
  x: { attribute: 'data-list-tick', key: 'x' }, c: { attribute: 'data-list-copy', key: 'c' }, e: { attribute: 'data-list-edit', key: 'e' },
  d: { attribute: 'data-list-duplicate', key: 'd' }, Delete: { attribute: 'data-list-remove', key: 'delete' }, Backspace: { attribute: 'data-list-remove', key: 'delete' },
}
const KEY_NAMES: Record<ListKey, string> = { x: 'X', c: 'C', e: 'E', d: 'D', delete: 'Delete' }

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select'))
const rowsIn = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-list-row]')].filter(row => row.closest('[data-list]') === container)

/** Make `row` the list's one Tab stop. */
function rove(container: HTMLElement, row: HTMLElement) {
  for (const other of rowsIn(container)) other.tabIndex = other === row ? 0 : -1
}

export function useListNavigation({ label, keys = {}, enabled = true }: {
  /** What the list is, for the hint ("To do"). */
  label: string
  /** The extra keys this list honours, as the ? sheet and the hint describe them ("Tick or untick"). */
  keys?: Partial<Record<ListKey | 'enter', string>>
  enabled?: boolean
}) {
  const ref = useRef<HTMLElement | null>(null)
  const last = useRef<HTMLElement | null>(null)
  const hintId = useId()

  // After every render: rows' own controls leave the Tab order, and one row (the last focused, else the first) is the stop.
  useEffect(() => {
    const container = ref.current
    if (!container || !enabled) return
    const rows = rowsIn(container)
    for (const row of rows) for (const control of row.querySelectorAll<HTMLElement>('button, a[href], summary, input, select')) if (control !== row && !control.closest('[data-list-keep-tab]')) control.tabIndex = -1
    // Exactly one stop: the last focused row while it's still here, else the first.
    const stop = last.current && rows.includes(last.current) ? last.current : rows[0]
    if (stop && (stop.tabIndex !== 0 || rows.filter(row => row.tabIndex === 0).length !== 1)) rove(container, stop)
  })

  // Show the keys in ? while the list is on screen. They're handled here, not by the global listener.
  const described = Object.entries(keys) as Array<[ListKey | 'enter', string]>
  useShortcut(enabled ? { keys: 'j / ↓', description: 'Next row in a list', group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled ? { keys: 'k / ↑', description: 'Previous row in a list', group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled && keys.enter ? { keys: 'Enter', description: keys.enter, group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled && keys.x ? { keys: 'x', description: keys.x, group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled && keys.c ? { keys: 'c', description: keys.c, group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled && keys.e ? { keys: 'e', description: keys.e, group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled && keys.d ? { keys: 'd', description: keys.d, group: 'Lists', run: () => {}, display: true } : null)
  useShortcut(enabled && keys.delete ? { keys: 'Delete', description: keys.delete, group: 'Lists', run: () => {}, display: true } : null)

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const container = ref.current
    if (!container || !enabled || event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || isTyping(event.target)) return
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-list-row]')
    if (!row || row.closest('[data-list]') !== container) return
    const rows = rowsIn(container)
    const at = rows.indexOf(row)
    const go = (index: number) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, index))]
      if (!next) return
      event.preventDefault()
      rove(container, next)
      last.current = next
      next.focus({ preventScroll: true })
      next.scrollIntoView?.({ block: 'nearest' })
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (key === 'j' || key === 'ArrowDown') return go(at + 1)
    if (key === 'k' || key === 'ArrowUp') return go(at - 1)
    if (key === 'Home') return go(0)
    if (key === 'End') return go(rows.length - 1)
    if (key === 'Escape') { event.preventDefault(); container.focus({ preventScroll: true }); return }
    if (key === 'Enter' && event.target === row) {
      // A row that is itself a button or link opens natively; any other row clicks its open control (or itself).
      if (row.matches('button, a[href]')) return
      const open = row.matches('[data-list-open]') ? row : row.querySelector<HTMLElement>('[data-list-open]')
      if (open) { event.preventDefault(); open.click() }
      return
    }
    if (event.shiftKey) return
    const action = ACTIONS[key]
    const control = action && row.querySelector<HTMLElement>(`[${action.attribute}]`)
    if (control && !(control as HTMLButtonElement).disabled) { event.preventDefault(); control.click() }
  }

  const hint = `${label}: use J and K to move${keys.enter ? ', Enter to open' : ''}${described.filter(([key]) => key !== 'enter').map(([key, text]) => `, ${KEY_NAMES[key as ListKey]} to ${text.charAt(0).toLowerCase()}${text.slice(1)}`).join('')}.`
  return {
    /** Spread on the list's container. */
    listProps: enabled ? {
      ref: (element: HTMLElement | null) => { ref.current = element },
      'data-list': '',
      tabIndex: -1,
      'aria-describedby': hintId,
      onKeyDown,
      onFocus: (event: FocusEvent<HTMLElement>) => { const row = (event.target as HTMLElement).closest<HTMLElement>('[data-list-row]'); if (row && ref.current && row.closest('[data-list]') === ref.current) { last.current = row; rove(ref.current, row) } },
    } : {},
    /** A visually hidden sentence the container points at, read once on entering the list. Render it inside the list's section. */
    hint: enabled ? <span id={hintId} className="visually-hidden">{hint}</span> : null,
  }
}
