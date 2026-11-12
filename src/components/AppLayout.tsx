import { useState, type ReactNode } from 'react'
import { PlannerHeader, type PlannerHeaderProps } from './PlannerHeader'
import { Kbd } from './ui/Kbd'
import { ShortcutsSheet } from './ui/ShortcutsSheet'
import { usePendingSequence, useShortcut } from '../state/shortcuts'
import type { PlannerView } from '../state/navigation'

/** To sort's own table keys (SortTable), listed on Spending until PR 18 moves them onto the registry. */
const SORT_TABLE_KEYS = [
  { keys: '↑ / ↓', description: 'Move between rows (To sort)', group: 'Lists' as const },
  { keys: '/', description: 'Choose a pot (To sort row)', group: 'Lists' as const },
  { keys: 'Enter', description: 'Place it', group: 'Lists' as const },
  { keys: 'a', description: 'Always put it there', group: 'Lists' as const },
  { keys: 's', description: 'Split it', group: 'Lists' as const },
]

/** The go-to keys: G, then the destination's letter (plan §2.3). */
const GO_TO: Array<[string, PlannerView, string]> = [['g h', 'home', 'Home'], ['g m', 'month', 'Month'], ['g p', 'plan', 'Plan'], ['g s', 'spending', 'Spending'], ['g ,', 'settings', 'Settings']]

function GoTo({ keys, view, label, onSelectView }: { keys: string; view: PlannerView; label: string; onSelectView: (view: PlannerView) => void }) {
  useShortcut({ keys, description: label, group: 'Go to', run: () => onSelectView(view) })
  return null
}

export function AppLayout({ children, navigation }: { children: ReactNode; navigation: PlannerHeaderProps }) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const pending = usePendingSequence()
  useShortcut({ keys: '/', description: 'Search', group: 'This page', when: () => !!window.document.querySelector('[data-shortcut="search"]'), run: () => window.document.querySelector<HTMLElement>('[data-shortcut="search"]')?.focus() })
  useShortcut({ keys: '?', description: 'Keyboard shortcuts', group: 'General', run: () => setShortcutsOpen(true) })
  const focusContent = () => window.document.getElementById('content')?.focus()
  return <div className="planner-app-shell">
    {/* The first stop on every screen: past the navigation to the page. */}
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); focusContent() }}>Skip to content</a>
    {navigation.setupComplete && GO_TO.map(([keys, view, label]) => <GoTo key={keys} keys={keys} view={view} label={label} onSelectView={navigation.onSelectView}/>)}
    <PlannerHeader {...navigation} />
    <main id="content" tabIndex={-1} className="planner-app-content" data-layout-contract="viewport-page">{children}</main>
    {pending && <div className="shortcut-pending" aria-hidden="true"><Kbd>{pending.toUpperCase()}</Kbd><span>…</span></div>}
    {shortcutsOpen && <ShortcutsSheet extra={navigation.currentView === 'spending' ? SORT_TABLE_KEYS : []} onClose={() => setShortcutsOpen(false)}/>}
  </div>
}
