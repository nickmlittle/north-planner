import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import './ListRow.css'

export type ListRowTone = 'neutral' | 'warning' | 'critical' | 'done'

/**
 * One row of a list (Home's To do, Settings, statements): icon, title, meta, and an amount or chip on the right.
 * A button with onOpen, a link with href, else plain. 44px on desktop, 56px on phones. `focused` marks the row
 * keyboard list navigation is on (J/K, PR 18). With no icon (Settings lists) or no chevron, those columns go.
 */
export function ListRow({ icon, tone = 'neutral', title, meta, trailing, trailingMeta, onOpen, href, chevron, focused, label }: {
  icon?: ReactNode
  tone?: ListRowTone
  title: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  trailingMeta?: ReactNode
  onOpen?: () => void
  href?: string
  /** Defaults to true when the row opens something. */
  chevron?: boolean
  focused?: boolean
  /** The row's name when its text reads poorly run together ("TESCO, £62.40, Tue 10 Nov"). */
  label?: string
}) {
  const showChevron = chevron ?? !!(onOpen || href)
  const body = <>
    {icon !== undefined && <span className="list-row-icon" aria-hidden="true">{icon}</span>}
    <span className="list-row-text"><span className="list-row-title">{title}</span>{meta && <span className="list-row-meta">{meta}</span>}</span>
    <span className="list-row-trailing">{trailing}{trailingMeta && <span className="list-row-meta">{trailingMeta}</span>}</span>
    {showChevron && <ChevronRight className="list-row-chevron" aria-hidden="true"/>}
  </>
  const className = `list-row is-${tone}${icon === undefined ? ' no-icon' : ''}${showChevron ? '' : ' no-chevron'}`
  const state = { ...focused ? { 'data-focused': '' } : {}, ...label ? { 'aria-label': label } : {} }
  if (href) return <a className={className} href={href} {...state}>{body}</a>
  if (onOpen) return <button type="button" className={className} onClick={onOpen} {...state}>{body}</button>
  return <div className={className} {...state}>{body}</div>
}
