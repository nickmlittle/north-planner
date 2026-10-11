export function PlannerHeader({ step, go, warning, replaceSavedDraft, accountBacked = false, saveStatus }: {
  step: number; go: (step: number) => void; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string
}) {
  return <><header className="north-header"><button className="brand brand-button" onClick={() => go(9)} aria-label="North dashboard"><span className="brand-mark" aria-hidden="true">N</span>north<span className="brand-dot">.</span></button>
    <nav className="app-nav" aria-label="Main navigation">{[[9, 'Dashboard'], [8, 'Household'], [10, 'Plan settings']].map(([n, label]) => <button key={n} aria-current={step === n ? 'page' : undefined} onClick={() => go(Number(n))}>{label}</button>)}</nav>
    <span className="save-status">{warning ? 'Save needs attention' : saveStatus ?? (accountBacked ? 'Saved to your account' : 'Saved in this browser')}</span></header>
    {warning && <aside className="storage-warning" role="status">{warning}{warning.startsWith('Saved data') && <button onClick={replaceSavedDraft}>Replace saved data with this draft</button>}</aside>}</>
}
