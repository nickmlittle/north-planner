import type { ReactNode } from 'react'
import { AlertTriangle, Info, XCircle } from 'lucide-react'
import './Notice.css'

export type NoticeTone = 'neutral' | 'warning' | 'critical'
const icons = { neutral: Info, warning: AlertTriangle, critical: XCircle }

/**
 * One line of news about the page as a whole: a save that failed, an import that didn't read. An icon, the sentence
 * and up to two actions. Critical notices are alerts, announced once when they appear.
 */
export function Notice({ tone = 'neutral', children, actions }: { tone?: NoticeTone; children: ReactNode; actions?: ReactNode }) {
  const Icon = icons[tone]
  return <div className={`notice is-${tone}`} role={tone === 'critical' ? 'alert' : 'status'}>
    <Icon className="notice-icon" aria-hidden="true"/>
    <p className="notice-text">{children}</p>
    {actions && <div className="notice-actions">{actions}</div>}
  </div>
}
