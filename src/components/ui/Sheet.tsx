import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import './Sheet.css'

export type SheetSize = 'sm' | 'md' | 'lg' | 'xl'

// Sheets can stack (a confirm over an editor) and close together, so the page scroll lock is counted, and a sheet
// that closes records where its focus goes for a sheet opened from inside it.
let scrollLocks = 0, savedOverflow = ''
const closedTargets = new WeakMap<Element, HTMLElement | null | undefined>()

/**
 * Every overlay: a centred dialog on desktop and tablet, a bottom sheet on phones.
 * It portals to #root, makes the rest of the page inert, locks the page scroll, traps Tab, closes on Escape
 * and restores focus. Focus starts on a `[data-autofocus]` control when there is one, else the first button.
 * The body scrolls on its own; `footer` holds the actions (on phones: full width, primary last, nearest the thumb).
 */
export function Sheet({ title, onClose, children, footer, size = 'md', returnFocusTo, className = '', description, dismissOnScrim = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Desktop width: sm 440, md 560, lg 720, xl 1220px. A className can set --sheet-width instead. */
  size?: SheetSize
  /** Where focus goes on close when the opener is gone or hidden (e.g. a menu item that closed with its menu). */
  returnFocusTo?: () => HTMLElement | null | undefined
  className?: string
  description?: ReactNode
  /** Close when the scrim is clicked. Off by default, so a half-filled form isn't lost to a stray tap. */
  dismissOnScrim?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId(), descriptionId = useId()
  useLayoutEffect(() => {
    const dialog = ref.current!
    opener.current = document.activeElement as HTMLElement | null
    if (scrollLocks++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    const background: { element: Element; inert: boolean }[] = []
    for (let branch: Element = dialog; branch.parentElement; branch = branch.parentElement) {
      background.push(...[...branch.parentElement.children].filter(element => element !== branch)
        .map(element => ({ element, inert: element.hasAttribute('inert') })))
      if (branch.parentElement === document.body) break
    }
    background.forEach(({ element }) => element.setAttribute('inert', ''))
    // Focus that leaves for another modal (a confirm opened over this sheet) is that modal's to keep.
    const keepFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || dialog.contains(event.target)) return
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return
      dialog.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('focusin', keepFocus)
    ;(dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLButtonElement>('button'))?.focus()
    return () => {
      document.removeEventListener('focusin', keepFocus)
      background.forEach(({ element, inert }) => { if (!inert) element.removeAttribute('inert') })
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow
      const previous = opener.current
      // A closed menu leaves its item connected but hidden; fall back to returnFocusTo then.
      const inClosedDetails = (element: HTMLElement) => { const details = element.closest('details:not([open])'); return !!details && !details.querySelector(':scope > summary')?.contains(element) }
      const visible = (element: HTMLElement | null) => !!element?.isConnected && element !== document.body && !inClosedDetails(element) && (element.checkVisibility?.() ?? true)
      const own = visible(previous) ? previous : returnFocusTo?.()
      closedTargets.set(dialog, own)
      // Opened from inside a sheet that is closing too: go where that sheet sends focus.
      const from = previous?.closest('.sheet')
      const target = from && closedTargets.has(from) ? closedTargets.get(from) : own
      // Another modal still holds focus: leave it; it restores focus when it closes.
      const active = document.activeElement
      if (active instanceof Element && !dialog.contains(active) && active.closest('[aria-modal="true"]')) return
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
    // Runs once per open; returnFocusTo is the one passed when the sheet opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The same commit can remove what focus went back to (an item removed from its own editor). Once the DOM has
  // settled, lost focus falls back to returnFocusTo.
  useEffect(() => () => {
    if (document.activeElement && document.activeElement !== document.body) return
    const fallback = returnFocusTo?.()
    if (fallback?.isConnected) fallback.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(<div className="sheet-overlay" onMouseDown={dismissOnScrim ? event => { if (event.target === event.currentTarget) onClose() } : undefined}>
    <section ref={ref} className={`sheet ${className}`.trim()} data-size={size} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
      <span className="sheet-handle" aria-hidden="true"/>
      <header className="sheet-header">
        <div className="sheet-heading"><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId} className="sheet-description">{description}</p>}</div>
        <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}><X aria-hidden="true"/></button>
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-footer">{footer}</div>}
    </section>
  </div>, document.getElementById('root') ?? document.body)
}
