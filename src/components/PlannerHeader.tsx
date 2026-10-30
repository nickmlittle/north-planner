import { useEffect, useState } from 'react'
import { House, Menu, Settings, UserRoundGroup, Wallet } from 'lucide-react'
import { navigateToBudget, navigateToDashboard, navigateToHousehold, navigateToSettings, primaryDestinations } from '../state/navigation'
import type { SettingsSection } from '../state/navigation'

export type PlannerView = 'dashboard' | 'household' | 'budget'
export interface PlannerHeaderProps {
  step: number; go: (step: number) => void; warning: string; replaceSavedDraft: () => void
  downloadOriginal?: () => void; recoveryOriginal?: string; accountBacked?: boolean; saveStatus?: string
  email?: string; onSignOut?: () => void; settingsSection?: SettingsSection
  onSelectSettings?: (section: SettingsSection) => void; currentView?: PlannerView
  onSelectView?: (view: PlannerView) => void; onSelectBudgetView?: (view: 'planning' | 'amex') => void
}

export function PlannerHeader({ step, warning, replaceSavedDraft, downloadOriginal, recoveryOriginal = '', accountBacked = false, saveStatus, email, onSignOut, onSelectSettings, currentView, onSelectView }: PlannerHeaderProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [warningOpen, setWarningOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  useEffect(() => {
    if (!mobileOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])
  const status = warning ? 'Save failed' : saveStatus === 'Saving…' ? 'Saving…' : saveStatus && /fail|not saved|error/i.test(saveStatus) ? 'Save failed' : saveStatus === 'Unsaved changes' ? 'Unsaved changes' : 'Saved'
  const selectView = (view: PlannerView) => {
    if (onSelectView) onSelectView(view)
    else if (view === 'dashboard') navigateToDashboard()
    else if (view === 'household') navigateToHousehold()
    else navigateToBudget('planning')
  }
  const selectSettings = (section: SettingsSection) => { if (onSelectSettings) onSelectSettings(section); else navigateToSettings(section) }
  const selectMobileView = (view: PlannerView) => { selectView(view); setMobileOpen(false) }
  const selectMobileSettings = (section: SettingsSection) => { selectSettings(section); setMobileOpen(false) }
  return <>
    <div className="mobile-nav-bar"><button type="button" className="mobile-nav-trigger" aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileOpen} aria-controls="mobile-navigation-panel" onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? <span className="mobile-menu-close" aria-hidden="true">×</span> : <Menu size={24} strokeWidth={2} aria-hidden="true" />}</button></div>
    <aside className={`planner-sidebar is-compact${mobileOpen ? ' mobile-open' : ''}${desktopExpanded ? ' desktop-expanded' : ''}`} aria-label="Application navigation">
      <div className="sidebar-rail">
        <button type="button" className="desktop-sidebar-toggle" aria-label={desktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={desktopExpanded} aria-controls="desktop-navigation" onClick={() => setDesktopExpanded(value => !value)}><Menu size={24} strokeWidth={2} aria-hidden="true" /></button>
        <nav id="desktop-navigation" className="sidebar-icon-nav" aria-label="Main navigation">
          {primaryDestinations.map(destination => {
            const Icon = destination.id === 'dashboard' ? House : destination.id === 'household' ? UserRoundGroup : Wallet
            return <button key={destination.id} type="button" className="sidebar-link" aria-current={currentView === destination.id ? 'page' : undefined} aria-label={destination.label} title={destination.label} onClick={() => selectView(destination.id)}><span className="sidebar-icon" aria-hidden="true"><Icon size={24} strokeWidth={2} /></span><span className="sidebar-label" aria-hidden={!desktopExpanded}>{destination.label}</span></button>
          })}
        </nav>
        <div className="sidebar-rail-utility">
          <button type="button" className="sidebar-link rail-settings-link" aria-current={step === 10 ? 'page' : undefined} aria-label="Plan settings" title="Plan settings" onClick={() => selectSettings('planning')}><span className="sidebar-icon" aria-hidden="true"><Settings size={24} strokeWidth={2} /></span><span className="sidebar-label" aria-hidden={!desktopExpanded}>Plan settings</span></button>
          {warning && (!accountBacked || warning.startsWith('Saved data')) && <div className="sidebar-warning-control"><button type="button" className="sidebar-warning-icon" aria-label="Storage warning" aria-expanded={warningOpen} title="Storage warning" onClick={() => setWarningOpen(value => !value)}>!</button>{warningOpen && <div className="sidebar-warning-panel" role="status"><span>{warning}</span>{recoveryOriginal && <><button type="button" onClick={downloadOriginal}>Download original JSON</button><button type="button" onClick={replaceSavedDraft}>Replace saved data with this draft</button></>}</div>}</div>}
          {onSignOut && <div className="sidebar-account"><button className="account-button" aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button><span className="sidebar-account-label" aria-hidden={!desktopExpanded}>{email ?? 'Account'}</span>{accountOpen && <div className="account-menu"><span className="account-menu-email">{email ?? 'Signed in'}</span><button onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
          <span className="save-icon sidebar-status" title={status} aria-label={status}><span aria-hidden="true">{status === 'Saved' ? '✓' : status === 'Saving…' ? '◌' : '!'}</span><span className="sidebar-status-label" aria-hidden={!desktopExpanded}>{status}</span></span>
        </div>
      </div>
      {mobileOpen && <>
        <button type="button" className="mobile-sidebar-scrim" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)} />
        <div id="mobile-navigation-panel" className="mobile-sidebar-panel">
          <div className="mobile-sidebar-brand" aria-hidden="true">north.</div>
          <nav className="mobile-sidebar-navigation" aria-label="Navigation menu">
            {primaryDestinations.map(destination => {
              const Icon = destination.id === 'dashboard' ? House : destination.id === 'household' ? UserRoundGroup : Wallet
              return <button key={destination.id} type="button" className="mobile-sidebar-link" aria-current={currentView === destination.id ? 'page' : undefined} onClick={() => selectMobileView(destination.id)}><Icon size={22} strokeWidth={2} /><span>{destination.label}</span></button>
            })}
          </nav>
          <div className="mobile-sidebar-utility">
            <button type="button" className="mobile-sidebar-link" aria-current={step === 10 ? 'page' : undefined} onClick={() => selectMobileSettings('planning')}><Settings size={22} strokeWidth={2} /><span>Plan settings</span></button>
            {warning && (!accountBacked || warning.startsWith('Saved data')) && <div className="mobile-sidebar-warning" role="status"><p>{warning}</p>{recoveryOriginal && <><button type="button" onClick={downloadOriginal}>Download original JSON</button><button type="button" onClick={replaceSavedDraft}>Replace saved data with this draft</button></>}</div>}
            {onSignOut && <div className="mobile-sidebar-account"><span>{email ?? 'Account'}</span><button type="button" onClick={onSignOut}>Sign out</button></div>}
            <span className="mobile-sidebar-status" aria-label={status}>{status === 'Saved' ? '✓' : status === 'Saving…' ? '◌' : '!'} {status}</span>
          </div>
        </div>
      </>}
    </aside>
  </>
}
