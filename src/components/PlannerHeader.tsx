import { useEffect, useRef, useState } from 'react'
import { navigateToSettings, settingsSections } from '../state/navigation'
import type { SettingsSection } from '../state/navigation'

const links = [['dashboard', 'Dashboard'], ['household', 'Household'], ['budget', 'Budget']] as const

export function PlannerHeader({ step, go, warning, replaceSavedDraft, downloadOriginal, recoveryOriginal = '', accountBacked = false, saveStatus, email, onSignOut, settingsSection = 'planning', onSelectSettings, currentView, onSelectView }: {
  step: number; go: (step: number) => void; warning: string; replaceSavedDraft: () => void; downloadOriginal?: () => void; recoveryOriginal?: string; accountBacked?: boolean; saveStatus?: string; email?: string; onSignOut?: () => void
  settingsSection?: SettingsSection; onSelectSettings?: (section: SettingsSection) => void; currentView?: 'dashboard' | 'household' | 'budget'; onSelectView?: (view: 'dashboard' | 'household' | 'budget') => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const accountButton = useRef<HTMLButtonElement>(null)
  const accountMenu = useRef<HTMLDivElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settingsMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!accountOpen) return
    accountMenu.current?.querySelector('button')?.focus()
    const onPointer = (event: PointerEvent) => { if (!accountMenu.current?.contains(event.target as Node) && !accountButton.current?.contains(event.target as Node)) setAccountOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setAccountOpen(false); accountButton.current?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [accountOpen])
  useEffect(() => {
    if (!settingsOpen) return
    const onPointer = (event: PointerEvent) => { if (!settingsMenu.current?.contains(event.target as Node) && !settingsButton.current?.contains(event.target as Node)) setSettingsOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSettingsOpen(false); settingsButton.current?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [settingsOpen])
  const status = warning ? 'Save failed' : saveStatus === 'Saving…' ? 'Saving…' : saveStatus && /fail|not saved|error/i.test(saveStatus) ? 'Save failed' : saveStatus === 'Unsaved changes' ? 'Unsaved changes' : 'Saved'
  const nav = <nav className="app-nav" aria-label="Main navigation">
    {links.map(([view, label]) => <button key={view} aria-current={currentView === view ? 'page' : undefined} onClick={() => { if (onSelectView) onSelectView(view); else go(view === 'dashboard' ? 9 : 8); setMobileOpen(false); setSettingsOpen(false) }}>{label}</button>)}
    <div className="settings-nav-item" onMouseEnter={() => setSettingsOpen(true)} onMouseLeave={() => setSettingsOpen(false)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSettingsOpen(false) }}>
      <button ref={settingsButton} type="button" aria-current={step === 10 ? 'page' : undefined} aria-haspopup="menu" aria-expanded={settingsOpen} onFocus={() => setSettingsOpen(true)} onClick={() => setSettingsOpen(true)}>Plan settings <span aria-hidden="true">⌄</span></button>
      {settingsOpen && <div ref={settingsMenu} className="settings-dropdown" role="menu" aria-label="Plan settings pages">{settingsSections.map(section => <button key={section.id} type="button" role="menuitem" aria-current={step === 10 && settingsSection === section.id ? 'page' : undefined} onClick={() => { if (onSelectSettings) onSelectSettings(section.id); else navigateToSettings(section.id); setSettingsOpen(false); setMobileOpen(false) }}>{section.label}</button>)}</div>}
    </div>
  </nav>
  return <><header className="north-header"><div className="header-inner dashboard-container">
    <button className="brand brand-button" onClick={() => onSelectView ? onSelectView('dashboard') : go(9)} aria-label="North dashboard"><span>north.</span></button>
    {nav}
    <span className={`save-status ${status === 'Save failed' ? 'save-error' : ''}`} aria-live="polite"><span className="save-icon" aria-hidden="true">{status === 'Saved' ? '✓' : status === 'Saving…' ? '◌' : '!'}</span>{status}</span>
    {onSignOut && <div className="account-control"><button ref={accountButton} className="account-button" aria-label="Account menu" aria-haspopup="true" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button>
      {accountOpen && <div ref={accountMenu} className="account-menu" aria-label="Account options"><span className="account-menu-label">Signed in as</span><span className="account-menu-email">{email ?? 'Signed in'}</span><button onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
    <button className="mobile-menu-button" aria-expanded={mobileOpen} aria-controls="mobile-header-menu" onClick={() => setMobileOpen(value => !value)}><span className="menu-glyph" aria-hidden="true">{mobileOpen ? '×' : '☰'}</span>{mobileOpen ? 'Close menu' : 'Menu'}</button>
  </div>{mobileOpen && <div id="mobile-header-menu" className="mobile-header-menu">{nav}<div className="mobile-header-actions"><span className={`save-status ${status === 'Save failed' ? 'save-error' : ''}`} aria-live="polite"><span className="save-icon" aria-hidden="true">{status === 'Saved' ? '✓' : status === 'Saving…' ? '◌' : '!'}</span>{status}</span>{onSignOut && <><span className="mobile-account-email">{email ?? 'Signed in'}</span><button className="mobile-signout" onClick={() => { setMobileOpen(false); onSignOut() }}>Sign out</button></>}</div></div>}</header>
    {warning && !accountBacked && <aside className="storage-warning" role="status">{warning}{recoveryOriginal && <><button type="button" onClick={downloadOriginal}>Download original JSON</button><button type="button" onClick={replaceSavedDraft}>Replace saved data with this draft</button></>}</aside>}
    {warning && accountBacked && warning.startsWith('Saved data') && <aside className="storage-warning" role="status">{warning}{recoveryOriginal && <><button type="button" onClick={downloadOriginal}>Download original JSON</button><button type="button" onClick={replaceSavedDraft}>Replace saved data with this draft</button></>}</aside>}
  </>
}
