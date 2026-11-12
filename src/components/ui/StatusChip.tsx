import type { ReactNode } from 'react'
import './StatusChip.css'

/** "In progress · 18 days left", "Ahead of pace", "Needs review". Always words; the tone only supports them. */
export function StatusChip({ tone = 'neutral', dot = false, children }: { tone?: 'neutral' | 'positive' | 'warning' | 'critical'; dot?: boolean; children: ReactNode }) {
  return <span className={`status-chip is-${tone}`}>{dot && <span className="status-chip-dot" aria-hidden="true"/>}{children}</span>
}
