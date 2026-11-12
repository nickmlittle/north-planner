import type { ReactNode } from 'react'
import './EmptyState.css'

/** Where a list would be: what's missing, one sentence on why or what next, and one action. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><p className="empty-state-title">{title}</p>{children && <p className="empty-state-text">{children}</p>}{action && <div className="empty-state-action">{action}</div>}</div>
}
