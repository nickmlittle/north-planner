import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Check, Menu, UserRound, UserRoundGroup, Wallet, X } from 'lucide-react'
import type { BudgetView, PlannerView } from '../state/navigation'

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
    <p className="mobile-utility-status">{status === 'Saved' ? <Check aria-hidden="true" /> : <span aria-hidden="true">{statusMark(status)}</span>}{status}</p>
    {warning && <p role="alert" className="mobile-utility-warning">{warning}</p>}
    {onSignOut && <div className="mobile-utility-account"><p>{email ?? 'Signed in'}</p><button type="button" onClick={() => { onClose(); onSignOut() }}>Sign out</button></div>}
  </section></div>, document.getElementById('root') ?? document.body)
}

/** The header's words for a save status. "Choose a version" is a conflict, not a save. */
function saveStatusLabel(saveStatus: string, warning = '') {
  if (warning || /fail|not saved|error/i.test(saveStatus)) return 'Save failed'
  if (saveStatus === 'Choose a version') return 'Choose a version'
  if (saveStatus === 'Saving…') return 'Saving…'
  if (saveStatus === 'Loading budget…') return 'Loading…'
  if (saveStatus === 'Unsaved changes') return 'Unsaved changes'
  return 'Saved'
}
const statusMark = (status: string) => status === 'Saving…' || status === 'Loading…' || status === 'Unsaved changes' ? '◌' : '!'

export function PlannerHeader({ currentView, budgetView, warning = '', saveStatus = 'Saved', email, onSignOut, onSelectView, onSelectBudgetView, setupComplete }: PlannerHeaderProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [utilityOpen, setUtilityOpen] = useState(false)
  const [desktopExpanded, setDesktopExpanded] = useState(false)
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
    <header className="mobile-app-header"><h1>{pageTitle}</h1><button type="button" className="mobile-utility-trigger" aria-label="Account and save status" aria-haspopup="dialog" aria-expanded={utilityOpen} onClick={() => setUtilityOpen(true)}>{statusIcon}<UserRound size={18} aria-hidden="true" /></button></header>
    {status === 'Save failed' && <p className="mobile-save-alert" role="alert">Save failed. Open account and save status for details.</p>}
    {/* Until setup is done there is nowhere else to go, so no greyed-out promises. */}
    {setupComplete && <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{destinations.map(({ id, label, Icon, action }) => <button key={id} type="button" aria-current={selected === id ? 'page' : undefined} onClick={action}><Icon size={22} strokeWidth={2} aria-hidden="true" /><span>{label}</span></button>)}</nav>}
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
