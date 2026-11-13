import type { ReactNode } from 'react'
import './EmptyState.css'

/** Where a list would be: what's missing, one sentence on why or what next, and one action. */
export function EmptyState({ title, children, action, heading }: { title: string; children?: ReactNode; action?: ReactNode; heading?: 'h2' | 'h3'
}) {
  const Title = heading ?? 'p'
  return <div className="empty-state"><Title className="empty-state-title">{title}</Title>{children && <p className="empty-state-text">{children}</p>}{action && <div className="empty-state-action">{action}</div>}</div>
}
