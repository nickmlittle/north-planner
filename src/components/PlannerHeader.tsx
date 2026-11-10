import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Menu, UserRound, UserRoundGroup, Wallet, X } from 'lucide-react'
import { AccountStatusPanel } from './AccountStatusPanel'
import { saveStatusLabel, statusMark } from './saveStatus'
import type { BudgetView, PlannerView } from '../state/navigation'
import { MOBILE_QUERY } from '../breakpoints'

/** The pinned bar's row under the safe area, in px; styles.css draws it as --page-bar-row. */
const MOBILE_BAR_ROW = 48

export interface PlannerHeaderProps {
  currentView: PlannerView
  budgetView: BudgetView
  warning?: string
  saveStatus?: string
  email?: string
  onSignOut?: () => void
  onSelectView: (view: PlannerView) => void
  onSelectBudgetView: (view: BudgetView) => void
  setupComplete: boolean
}

function AnimatedSidebarText({ text }: { text: string }) {
  return <>
    <span className="sidebar-animated-text" aria-hidden="true">{Array.from(text).map((character, index) => <span key={`${index}-${character}`} className="sidebar-animated-char" style={{ '--sidebar-char-delay': `${index * 9}ms` } as CSSProperties}>{character === ' ' ? '\u00a0' : character}</span>)}</span>
    <span className="visually-hidden">{text}</span>
  </>
}

function UtilitySheet({ status, warning, email, onSignOut, onClose }: { status: string; warning: string; email?: string; onSignOut?: () => void; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  useEffect(() => {
    const sheet = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const background: { element: Element; inert: boolean }[] = []
    for (let branch: Element = sheet; branch.parentElement; branch = branch.parentElement) {
      background.push(...[...branch.parentElement.children].filter(element => element !== branch).map(element => ({ element, inert: element.hasAttribute('inert') })))
      if (branch.parentElement === document.body) break
    }
    background.forEach(({ element }) => element.setAttribute('inert', ''))
    const keepFocus = (event: FocusEvent) => { if (event.target instanceof Node && !sheet.contains(event.target)) sheet.querySelector<HTMLButtonElement>('button')?.focus() }
    document.addEventListener('focusin', keepFocus)
    sheet.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      document.removeEventListener('focusin', keepFocus)
      background.forEach(({ element, inert }) => { if (!inert) element.removeAttribute('inert') })
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(<div className="mobile-utility-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section ref={ref} className="mobile-utility-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>
    <header><h2 id={titleId}>Account and save status</h2><button type="button" aria-label="Close account and save status" onClick={onClose}><X aria-hidden="true" /></button></header>
    <AccountStatusPanel status={status} warning={warning} email={email} onSignOut={onSignOut} onBeforeSignOut={onClose} />
  </section></div>, document.getElementById('root') ?? document.body)
}


export function PlannerHeader({ currentView, budgetView, warning = '', saveStatus = 'Saved', email, onSignOut, onSelectView, onSelectBudgetView, setupComplete }: PlannerHeaderProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [utilityOpen, setUtilityOpen] = useState(false)
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null)
  const frozenHeight = useRef<number | null>(null)
  useEffect(() => {
    const header = headerRef.current
    const bar = header?.firstElementChild as HTMLElement | null | undefined
    if (!header || !bar) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const phone = !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches
        const height = frozenHeight.current ?? header.offsetHeight
        // The pinned bar is the safe area plus one row; it takes over once the rows above that line have scrolled under it.
        const pinnedHeight = parseFloat(getComputedStyle(bar).paddingTop) + MOBILE_BAR_ROW
        const collapse = phone && height > 0 && window.scrollY > height - pinnedHeight
        if (collapse === (frozenHeight.current !== null)) return
        frozenHeight.current = collapse ? header.offsetHeight : null
        setCollapsedHeight(frozenHeight.current)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [currentView, budgetView])
  const status = saveStatusLabel(saveStatus, warning)
  // Saved is the quiet default: only show a status when there is something to know.
  const statusIcon = status === 'Saved' ? null : <span aria-hidden="true">{statusMark(status)}</span>
  const selected = currentView === 'household' ? 'household' : budgetView
  const pageTitle = selected === 'plan' ? 'Plan' : selected === 'transfers' ? 'Transfers' : 'Household'
  const destinations = [
    { id: 'plan', label: 'Plan', Icon: Wallet, action: () => onSelectBudgetView('plan') },
    { id: 'transfers', label: 'Transfers', Icon: ArrowLeftRight, action: () => onSelectBudgetView('transfers') },
    { id: 'household', label: 'Household', Icon: UserRoundGroup, action: () => onSelectView('household') },
  ] as const
  return <>
    {/* Pine, from under the status bar. Once its rows scroll away, the bar alone stays pinned to the top; the header keeps its height so nothing jumps. */}
    <header ref={headerRef} className={`mobile-app-header${collapsedHeight === null ? '' : ' is-collapsed'}`} style={collapsedHeight === null ? undefined : { height: collapsedHeight }}>
      <div className="mobile-header-bar">
        <span className="mobile-header-brand" aria-hidden="true">north.</span>
        <h1>{pageTitle}</h1>
        {/* Plan and Transfers put their month, ⋯ and budget note here; the title then stays for screen readers only. */}
        <div id="mobile-header-page-slot" className="mobile-header-slot" />
        <button type="button" className="mobile-utility-trigger" aria-label="Account and save status" aria-haspopup="dialog" aria-expanded={utilityOpen} onClick={() => setUtilityOpen(true)}>{statusIcon}<UserRound size={20} aria-hidden="true" /></button>
      </div>
    </header>
    {status === 'Save failed' && <p className="mobile-save-alert" role="alert">Save failed. Open account and save status for details.</p>}
    {/* Until setup is done there is nowhere else to go, so no greyed-out promises. */}
    {setupComplete && <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{destinations.map(({ id, label, Icon, action }) => <button key={id} type="button" aria-current={selected === id ? 'page' : undefined} onClick={action}><span className="mobile-nav-icon" aria-hidden="true"><Icon size={22} strokeWidth={2} /></span><span>{label}</span></button>)}</nav>}
    <aside className={`planner-sidebar is-compact${desktopExpanded ? ' desktop-expanded' : ''}`} aria-label="Application navigation">
      <div className="sidebar-rail">
        <div className="desktop-sidebar-header"><button type="button" className="desktop-sidebar-toggle" aria-label={desktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={desktopExpanded} aria-controls="desktop-navigation" onClick={() => setDesktopExpanded(value => !value)}><Menu size={24} strokeWidth={2} aria-hidden="true" /></button><span className="desktop-sidebar-brand" aria-hidden="true"><AnimatedSidebarText text="north." /></span></div>
        {/* The same three destinations as the phone, so a Plan or Transfers link means one screen everywhere. */}
        <nav id="desktop-navigation" className="sidebar-icon-nav" aria-label="Main navigation">{destinations.filter(destination => setupComplete || destination.id === 'household').map(({ id, label, Icon, action }) => <button key={id} type="button" className="sidebar-link" aria-current={selected === id ? 'page' : undefined} aria-label={label} title={label} onClick={action}><span className="sidebar-icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span><span className="sidebar-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={label} /></span></button>)}</nav>
        <div className="sidebar-rail-utility">
          {warning && <div className="sidebar-warning-control"><button type="button" className="sidebar-warning-icon" aria-label="Storage warning" aria-expanded={warningOpen} title="Storage warning" onClick={() => setWarningOpen(value => !value)}>!</button>{warningOpen && <div className="sidebar-warning-panel" role="status">{warning}</div>}</div>}
          {onSignOut && <div className="sidebar-account"><button type="button" className="account-button" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button><span className="sidebar-account-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={email ?? 'Account'} /></span>{accountOpen && <div className="account-menu"><span className="account-menu-email">{email ?? 'Signed in'}</span><button type="button" onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
          {status !== 'Saved' && <span className="save-icon sidebar-status" title={status} aria-label={status}>{statusIcon}<span className="sidebar-status-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={status} /></span></span>}
        </div>
      </div>
    </aside>
    {utilityOpen && <UtilitySheet status={status} warning={warning} email={email} onSignOut={onSignOut} onClose={() => setUtilityOpen(false)} />}
  </>
}
