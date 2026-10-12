import { useEffect, useRef, useState } from 'react'

const links = [[9, 'Dashboard'], [8, 'Household'], [10, 'Plan settings']] as const

export function PlannerHeader({ step, go, warning, replaceSavedDraft, accountBacked = false, saveStatus, email, onSignOut }: {
  step: number; go: (step: number) => void; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string; email?: string; onSignOut?: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountButton = useRef<HTMLButtonElement>(null)
  const accountMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!accountOpen) return
    accountMenu.current?.querySelector('button')?.focus()
    const onPointer = (event: PointerEvent) => { if (!accountMenu.current?.contains(event.target as Node) && !accountButton.current?.contains(event.target as Node)) setAccountOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setAccountOpen(false); accountButton.current?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [accountOpen])
  const status = warning ? 'Save failed' : saveStatus === 'Saving…' ? 'Saving…' : saveStatus && /fail|not saved|error/i.test(saveStatus) ? 'Save failed' : saveStatus === 'Unsaved changes' ? 'Unsaved changes' : 'Saved'
  const nav = <nav className="app-nav" aria-label="Main navigation">{links.map(([n, label]) => <button key={n} aria-current={step === n ? 'page' : undefined} onClick={() => { go(n); setMobileOpen(false) }}>{label}</button>)}</nav>
  return <><header className="north-header"><div className="header-inner">
    <button className="brand brand-button" onClick={() => go(9)} aria-label="North dashboard"><span>north.</span></button>
    {nav}
    <span className={`save-status ${status === 'Save failed' ? 'save-error' : ''}`} aria-live="polite"><span className="save-icon" aria-hidden="true">{status === 'Saved' ? '✓' : status === 'Saving…' ? '◌' : '!'}</span>{status}</span>
    {onSignOut && <div className="account-control"><button ref={accountButton} className="account-button" aria-label="Account menu" aria-haspopup="true" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}>{(email?.trim()[0] ?? 'A').toUpperCase()}</button>
      {accountOpen && <div ref={accountMenu} className="account-menu" aria-label="Account options"><span className="account-menu-label">Signed in as</span><span className="account-menu-email">{email ?? 'Signed in'}</span><button onClick={() => { setAccountOpen(false); onSignOut() }}>Sign out</button></div>}</div>}
    <button className="mobile-menu-button" aria-expanded={mobileOpen} aria-controls="mobile-header-menu" onClick={() => setMobileOpen(value => !value)}><span className="menu-glyph" aria-hidden="true">{mobileOpen ? '×' : '☰'}</span>{mobileOpen ? 'Close menu' : 'Menu'}</button>
  </div>{mobileOpen && <div id="mobile-header-menu" className="mobile-header-menu">{nav}<div className="mobile-header-actions"><span className={`save-status ${status === 'Save failed' ? 'save-error' : ''}`} aria-live="polite"><span className="save-icon" aria-hidden="true">{status === 'Saved' ? '✓' : status === 'Saving…' ? '◌' : '!'}</span>{status}</span>{onSignOut && <><span className="mobile-account-email">{email ?? 'Signed in'}</span><button className="mobile-signout" onClick={() => { setMobileOpen(false); onSignOut() }}>Sign out</button></>}</div></div>}</header>
    {warning && !accountBacked && <aside className="storage-warning" role="status">{warning}{warning.startsWith('Saved data') && <button onClick={replaceSavedDraft}>Replace saved data with this draft</button>}</aside>}
    {warning && accountBacked && warning.startsWith('Saved data') && <aside className="storage-warning" role="status">{warning}{<button onClick={replaceSavedDraft}>Replace saved data with this draft</button>}</aside>}
  </>
}
