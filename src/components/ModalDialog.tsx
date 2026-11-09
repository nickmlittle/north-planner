import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Modal shell: portals to #root, makes the rest of the page inert, traps Tab, closes on Escape and
 * restores focus. Focus starts on a `[data-autofocus]` control when there is one, else the first button.
 */
export function ModalDialog({ title, onClose, children, className = '', returnFocusTo }: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** Where focus goes on close when the opener is gone or hidden (e.g. a menu item that closed with its menu). */
  returnFocusTo?: () => HTMLElement | null | undefined
}) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const background: { element: Element; inert: boolean }[] = []
    for (let branch: Element = dialog; branch.parentElement; branch = branch.parentElement) {
      background.push(...[...branch.parentElement.children].filter(element => element !== branch)
        .map(element => ({ element, inert: element.hasAttribute('inert') })))
      if (branch.parentElement === document.body) break
    }
    background.forEach(({ element }) => element.setAttribute('inert', ''))
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) dialog.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('focusin', keepFocus)
    ;(dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLButtonElement>('button'))?.focus()
    return () => {
      document.removeEventListener('focusin', keepFocus)
      background.forEach(({ element, inert }) => { if (!inert) element.removeAttribute('inert') })
      document.body.style.overflow = overflow
      // A closed menu leaves its item connected but hidden; fall back to returnFocusTo then.
      const inClosedDetails = (element: HTMLElement) => { const details = element.closest('details:not([open])'); return !!details && !details.querySelector(':scope > summary')?.contains(element) }
      const visible = (element: HTMLElement | null) => !!element?.isConnected && element !== document.body && !inClosedDetails(element) && (element.checkVisibility?.() ?? true)
      const target = visible(previous) ? previous : returnFocusTo?.()
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
    // Runs once per open; returnFocusTo is the one passed when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(<div className="budget-info-overlay"><section ref={ref} className={`budget-info-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}><X aria-hidden="true"/></button></header>
    <div className="budget-info-content">{children}</div>
  </section></div>, document.getElementById('root') ?? document.body)
}
