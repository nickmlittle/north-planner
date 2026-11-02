import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Menu, X } from 'lucide-react'
import { navigateTo, type PlannerDestination, type PlannerView } from '../state/navigation'

export interface PlannerHeaderProps {
  currentView: PlannerView
  destinations: PlannerDestination[]
  warning?: string
  saveStatus?: string
  email?: string
  onSignOut?: () => void
  onSelectView?: (view: PlannerView) => void
  mobileBudgetView?: 'transfers' | 'plan'
  onMobileBudgetViewChange?: (view: 'transfers' | 'plan') => void
}

function AnimatedSidebarText({ text }: { text: string }) {
  return <>
    <span className="sidebar-animated-text" aria-hidden="true">{Array.from(text).map((character, index) => <span key={`${index}-${character}`} className="sidebar-animated-char" style={{ '--sidebar-char-delay': `${index * 9}ms` } as CSSProperties}>{character === ' ' ? '\u00a0' : character}</span>)}</span>
    <span className="visually-hidden">{text}</span>
  </>
}

export function PlannerHeader({ currentView, destinations, warning = '', saveStatus = 'Saved', email, onSignOut, onSelectView, mobileBudgetView = 'plan', onMobileBudgetViewChange }: PlannerHeaderProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const mobileOpenButton = useRef<HTMLButtonElement>(null)
  const mobileCloseButton = useRef<HTMLButtonElement>(null)
  const mobileWasOpen = useRef(false)
  const mobileKeyboardOpen = useRef(false)
  useEffect(() => {
    if (mobileOpen && mobileKeyboardOpen.current) mobileCloseButton.current?.focus({ preventScroll: true })
    else if (!mobileOpen && mobileWasOpen.current && mobileKeyboardOpen.current) mobileOpenButton.current?.focus({ preventScroll: true })
    mobileWasOpen.current = mobileOpen
  }, [mobileOpen])
  useEffect(() => {
    if (!mobileOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])
  const status = warning || /fail|not saved|error/i.test(saveStatus) ? 'Save failed' : saveStatus === 'Saving…' ? 'Saving…' : saveStatus === 'Unsaved changes' ? 'Unsaved changes' : 'Saved'
  const select = (view: PlannerView) => { (onSelectView ?? navigateTo)(view); setMobileOpen(false) }
  const statusIcon = status === 'Saved' ? <Check size={24} strokeWidth={2} aria-hidden="true" /> : <span aria-hidden="true">{status === 'Saving…' ? '◌' : '!'}</span>
  return <>
    <div className={`mobile-nav-bar${mobileOpen ? ' is-open' : ''}`}><button ref={mobileOpenButton} type="button" className="mobile-nav-trigger" aria-label="Open navigation menu" aria-expanded={false} aria-controls="mobile-navigation-panel" hidden={mobileOpen} onClick={event => { mobileKeyboardOpen.current = event.detail === 0; setMobileOpen(true) }}><Menu size={24} strokeWidth={2} aria-hidden="true" /></button>{currentView === 'budget' && <div className="budget-v3-mobile-view-switch budget-v3-header-switch" role="group" aria-label="Budget view" aria-hidden={mobileOpen || undefined} inert={mobileOpen || undefined}><button type="button" aria-pressed={mobileBudgetView === 'transfers'} aria-controls="budget-transfers-panel" onClick={() => onMobileBudgetViewChange?.('transfers')}>Transfers</button><button type="button" aria-pressed={mobileBudgetView === 'plan'} aria-controls="budget-plan-panel" onClick={() => onMobileBudgetViewChange?.('plan')}>Plan</button></div>}</div>
    <aside className={`planner-sidebar is-compact${mobileOpen ? ' mobile-open' : ''}${desktopExpanded ? ' desktop-expanded' : ''}`} aria-label="Application navigation">
      <div className="sidebar-rail">
        <div className="desktop-sidebar-header"><button type="button" className="desktop-sidebar-toggle" aria-label={desktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={desktopExpanded} aria-controls="desktop-navigation" onClick={() => setDesktopExpanded(value => !value)}><Menu size={24} strokeWidth={2} aria-hidden="true" /></button><span className="desktop-sidebar-brand" aria-hidden="true"><AnimatedSidebarText text="north." /></span></div>
        <nav id="desktop-navigation" className="sidebar-icon-nav" aria-label="Main navigation">{destinations.map(destination => {
          const Icon = destination.Icon
          return <button key={destination.id} type="button" className="sidebar-link" aria-current={currentView === destination.id ? 'page' : undefined} aria-label={destination.label} title={destination.label} onClick={() => select(destination.id)}><span className="sidebar-icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span><span className="sidebar-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={destination.label} /></span></button>
        })}</nav>
        <div className="sidebar-rail-utility">
          {warning && <div className="sidebar-warning-control"><button type="button" className="sidebar-warning-icon" aria-label="Storage warning" aria-expanded={warningOpen} title="Storage warning" onClick={() => setWarningOpen(value => !value)}>!</button>{warningOpen && <div className="sidebar-warning-panel" role="status">{warning}</div>}</div>}
          {onSignOut && <div className="sidebar-account"><button type="button" className="account-button" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button><span className="sidebar-account-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={email ?? 'Account'} /></span>{accountOpen && <div className="account-menu"><span className="account-menu-email">{email ?? 'Signed in'}</span><button type="button" onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
          <span className="save-icon sidebar-status" title={status} aria-label={status}>{statusIcon}<span className="sidebar-status-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={status} /></span></span>
        </div>
      </div>
      <button type="button" className="mobile-sidebar-scrim" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)} />
        <div id="mobile-navigation-panel" className="mobile-sidebar-panel" aria-hidden={!mobileOpen}>
        <button ref={mobileCloseButton} type="button" className="mobile-sidebar-close" aria-label="Close navigation menu" aria-expanded={true} aria-controls="mobile-navigation-panel" onClick={() => setMobileOpen(false)}><X size={24} strokeWidth={2} aria-hidden="true" /></button>
        <div className="mobile-sidebar-brand" aria-hidden="true"><AnimatedSidebarText text="north." /></div>
        <nav className="mobile-sidebar-navigation" aria-label="Navigation menu">{destinations.map(destination => {
          const Icon = destination.Icon
          return <button key={destination.id} type="button" className="mobile-sidebar-link" aria-current={currentView === destination.id ? 'page' : undefined} aria-label={destination.label} onClick={() => select(destination.id)}><span className="sidebar-icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span><span><AnimatedSidebarText text={destination.label} /></span></button>
        })}</nav>
        <div className="mobile-sidebar-utility">
          {warning && <div className="mobile-sidebar-warning" role="status">{warning}</div>}
          {onSignOut && <div className="mobile-sidebar-account"><button type="button" className="account-button" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button><span className="mobile-sidebar-account-label"><AnimatedSidebarText text={email ?? 'Account'} /></span>{accountOpen && <div className="account-menu"><span className="account-menu-email">{email ?? 'Signed in'}</span><button type="button" onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
          <span className="mobile-sidebar-status" aria-label={status}>{statusIcon}<span><AnimatedSidebarText text={status} /></span></span>
        </div>
      </div>
    </aside>
  </>
}
