export function PlannerHeader({ step, go, warning, replaceSavedDraft, accountBacked = false, saveStatus }: {
  step: number; go: (step: number) => void; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string
}) {
  return <><header className="north-header"><button className="brand brand-button" onClick={() => go(9)} aria-label="North dashboard"><svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/><path d="M20 6 11 21h6l-4 8 7-5 7 5-4-8h6L20 6Z"/><path d="M20 24v9"/></svg><span>north</span><span className="brand-dot">.</span></button>
    <nav className="app-nav" aria-label="Main navigation">{[[9, 'Dashboard'], [8, 'Household'], [10, 'Plan settings']].map(([n, label]) => <button key={n} aria-current={step === n ? 'page' : undefined} onClick={() => go(Number(n))}>{label}</button>)}</nav>
    <span className="save-status">{warning ? 'Save needs attention' : saveStatus ?? (accountBacked ? 'Saved to your account' : 'Saved in this browser')}</span></header>
    {warning && <aside className="storage-warning" role="status">{warning}{warning.startsWith('Saved data') && <button onClick={replaceSavedDraft}>Replace saved data with this draft</button>}</aside>}</>
}
