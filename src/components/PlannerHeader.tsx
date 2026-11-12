import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { CalendarDays, ChevronRight, CreditCard, House, List, PanelLeftClose, PanelLeftOpen, Settings2, UserRound } from 'lucide-react'
import { AccountStatusPanel } from './AccountStatusPanel'
import { Sheet } from './ui/Sheet'
import { saveStatusLabel, statusMark } from './saveStatus'
import type { PlannerView } from '../state/navigation'
import type { NavCounts } from '../state/navCounts'
import { MOBILE_QUERY, SIDEBAR_WIDE_QUERY } from '../breakpoints'

/** The pinned bar's row under the safe area, in px; styles.css draws it as --page-bar-row. */
const MOBILE_BAR_ROW = 48
/** The desktop sidebar's state, when someone has chosen one on this device; otherwise it follows the window width. */
const SIDEBAR_KEY = 'north.sidebar'

export interface PlannerHeaderProps {
  currentView: PlannerView
  warning?: string
  saveStatus?: string
  email?: string
  onSignOut?: () => void
  onSelectView: (view: PlannerView) => void
  setupComplete: boolean
  /** Home's title on phones: the month it summarises ("November 2026"), under "This month". */
  homeTitle?: string
  /** Beside Home and Spending in the nav. */
  counts?: NavCounts
}

const subscribeWide = (callback: () => void) => { const media = window.matchMedia?.(SIDEBAR_WIDE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getWide = () => !!window.matchMedia?.(SIDEBAR_WIDE_QUERY).matches
function readSidebar(): 'expanded' | 'collapsed' | null {
  try { const value = window.localStorage.getItem(SIDEBAR_KEY); return value === 'expanded' || value === 'collapsed' ? value : null } catch { return null }
}
function rememberSidebar(value: 'expanded' | 'collapsed') {
  try { window.localStorage.setItem(SIDEBAR_KEY, value) } catch { /* Per-device convenience only. */ }
}

function AnimatedSidebarText({ text }: { text: string }) {
  return <>
    <span className="sidebar-animated-text" aria-hidden="true">{Array.from(text).map((character, index) => <span key={`${index}-${character}`} className="sidebar-animated-char" style={{ '--sidebar-char-delay': `${index * 9}ms` } as CSSProperties}>{character === ' ' ? '\u00a0' : character}</span>)}</span>
    <span className="visually-hidden">{text}</span>
  </>
}

/** The account button's sheet on phones: Settings, then save status and Sign out. */
function AccountSheet({ status, warning, email, onSignOut, onOpenSettings, onClose }: { status: string; warning: string; email?: string; onSignOut?: () => void; onOpenSettings: () => void; onClose: () => void }) {
  return <Sheet title="Account and settings" onClose={onClose} className="mobile-utility-sheet" dismissOnScrim>
    <button type="button" className="mobile-utility-settings" onClick={() => { onClose(); onOpenSettings() }}><Settings2 aria-hidden="true"/><span>Settings</span><ChevronRight aria-hidden="true"/></button>
    <AccountStatusPanel status={status} warning={warning} email={email} onSignOut={onSignOut} onBeforeSignOut={onClose} />
  </Sheet>
}

export function PlannerHeader({ currentView, warning = '', saveStatus = 'Saved', email, onSignOut, onSelectView, setupComplete, homeTitle, counts = {} }: PlannerHeaderProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [utilityOpen, setUtilityOpen] = useState(false)
  // Expanded by default on wide windows (≥1280px), collapsed below; a choice made with the toggle sticks on this device.
  const wide = useSyncExternalStore(subscribeWide, getWide, () => false)
  const [chosen, setChosen] = useState(readSidebar)
  const desktopExpanded = (chosen ?? (wide ? 'expanded' : 'collapsed')) === 'expanded'
  const toggleSidebar = () => { const next = desktopExpanded ? 'collapsed' : 'expanded'; rememberSidebar(next); setChosen(next) }
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
        // Never at the top: a page's header can still be filling in (a lazy page, PageHeader's portal) when this first runs.
        const collapse = phone && height > 0 && window.scrollY > 0 && window.scrollY > height - pinnedHeight
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
  }, [currentView])
  const status = saveStatusLabel(saveStatus, warning)
  // Saved is the quiet default: only show a status when there is something to know.
  const statusIcon = status === 'Saved' ? null : <span aria-hidden="true">{statusMark(status)}</span>
  const selected = currentView
  const ownHeading = selected === 'month' || selected === 'settings'
  const pageTitle = selected === 'home' ? homeTitle ?? 'Home' : selected === 'month' ? 'Month' : selected === 'plan' ? 'Plan' : selected === 'spending' ? 'Spending' : 'Settings'
  const destinations = [
    { id: 'home', label: 'Home', Icon: House, count: counts.home, countLabel: 'to do' },
    { id: 'month', label: 'Month', Icon: CalendarDays },
    { id: 'plan', label: 'Plan', Icon: List },
    { id: 'spending', label: 'Spending', Icon: CreditCard, count: counts.spending, countLabel: 'to sort' },
  ] as const
  /** "Spending, 4 to sort": the count is part of the name, since the collapsed rail shows only icons. */
  const accessibleName = (destination: typeof destinations[number]) => 'count' in destination && destination.count ? `${destination.label}, ${destination.count} ${destination.countLabel}` : destination.label
  const sidebarLink = (id: PlannerView, label: string, name: string, icon: ReactNode, count?: number) => <button key={id} type="button" className="sidebar-link" aria-current={selected === id ? 'page' : undefined} aria-label={name} title={name} onClick={() => onSelectView(id)}>
    <span className="sidebar-icon" aria-hidden="true">{icon}{!!count && <span className="sidebar-dot"/>}</span>
    <span className="sidebar-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={label} /></span>
    {!!count && <span className="sidebar-count" aria-hidden="true">{count}</span>}
  </button>
  return <>
    {/* Pine, from under the status bar. Once its rows scroll away, the bar alone stays pinned to the top; the header keeps its height so nothing jumps. */}
    <header ref={headerRef} className={`mobile-app-header${collapsedHeight === null ? '' : ' is-collapsed'}`} style={collapsedHeight === null ? undefined : { height: collapsedHeight }}>
      <div className={`mobile-header-bar${selected === 'home' ? ' has-eyebrow' : ''}`}>
        <span className="mobile-header-brand" aria-hidden="true">north.</span>
        {selected === 'home' && <p className="mobile-header-eyebrow">This month</p>}
        {/* Month and Settings bring their own h1 (PageHeader, in the slot below); the other screens' titles are this one. */}
        {!ownHeading && <h1>{pageTitle}</h1>}
        {/* Month, Plan and Settings put their title (or month), ⋯ and note here. */}
        <div id="mobile-header-page-slot" className="mobile-header-slot" />
        {/* Always the right-most button; a page's own ⋯ sits to its left. */}
        <button type="button" className="mobile-utility-trigger" aria-label="Account and settings" aria-haspopup="dialog" aria-expanded={utilityOpen} onClick={() => setUtilityOpen(true)}>{statusIcon}<UserRound size={20} aria-hidden="true" /></button>
      </div>
    </header>
    {status === 'Save failed' && <p className="mobile-save-alert" role="alert">Save failed. Open Account and settings for details.</p>}
    {/* Until setup is done there is nowhere else to go, so no greyed-out promises. */}
    {setupComplete && <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{destinations.map(destination => <button key={destination.id} type="button" aria-current={selected === destination.id ? 'page' : undefined} aria-label={accessibleName(destination) === destination.label ? undefined : accessibleName(destination)} onClick={() => onSelectView(destination.id)}><span className="mobile-nav-icon" aria-hidden="true"><destination.Icon size={22} strokeWidth={2} />{'count' in destination && !!destination.count && <span className="mobile-nav-dot"/>}</span><span>{destination.label}</span></button>)}</nav>}
    <aside className={`planner-sidebar${desktopExpanded ? ' desktop-expanded' : ' is-compact'}`} aria-label="Application navigation">
      <div className="sidebar-rail">
        <div className="desktop-sidebar-header"><span className="desktop-sidebar-brand" aria-hidden="true"><AnimatedSidebarText text="north." /></span><button type="button" className="desktop-sidebar-toggle" aria-label={desktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'} title={desktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={desktopExpanded} aria-controls="desktop-navigation" onClick={toggleSidebar}>{desktopExpanded ? <PanelLeftClose size={20} strokeWidth={2} aria-hidden="true"/> : <PanelLeftOpen size={20} strokeWidth={2} aria-hidden="true"/>}</button></div>
        {/* The same four destinations as the phone's tab bar; Settings sits at the foot. Until setup is done, Settings is the only one. */}
        <nav id="desktop-navigation" className="sidebar-icon-nav" aria-label="Main navigation">
          {setupComplete && destinations.map(destination => sidebarLink(destination.id, destination.label, accessibleName(destination), <destination.Icon size={22} strokeWidth={2} />, 'count' in destination ? destination.count : undefined))}
          <div className="sidebar-foot-nav">{sidebarLink('settings', 'Settings', 'Settings', <Settings2 size={22} strokeWidth={2} />)}</div>
        </nav>
        <div className="sidebar-rail-utility">
          {warning && <div className="sidebar-warning-control"><button type="button" className="sidebar-warning-icon" aria-label="Storage warning" aria-expanded={warningOpen} title="Storage warning" onClick={() => setWarningOpen(value => !value)}>!</button>{warningOpen && <div className="sidebar-warning-panel" role="status">{warning}</div>}</div>}
          {onSignOut && <div className="sidebar-account"><button type="button" className="account-button" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button><span className="sidebar-account-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={email ?? 'Account'} /></span>{accountOpen && <div className="account-menu"><span className="account-menu-email">{email ?? 'Signed in'}</span><button type="button" onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
          {status !== 'Saved' && <span className="save-icon sidebar-status" title={status} aria-label={status}>{statusIcon}<span className="sidebar-status-label" aria-hidden={!desktopExpanded}><AnimatedSidebarText text={status} /></span></span>}
        </div>
      </div>
    </aside>
    {utilityOpen && <AccountSheet status={status} warning={warning} email={email} onSignOut={onSignOut} onOpenSettings={() => onSelectView('settings')} onClose={() => setUtilityOpen(false)} />}
  </>
}
