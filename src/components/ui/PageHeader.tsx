import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Breadcrumb, type BreadcrumbItem } from './Breadcrumb'
import { useMobilePresentation } from './useMobilePresentation'
import './PageHeader.css'

const subscribeNothing = () => () => {}
const findHeaderSlot = () => window.document.getElementById('mobile-header-page-slot')

/**
 * Every page's header and its only h1: title (or a MonthTitle), context, a status chip, a breadcrumb back, and
 * actions (a ⋯ plus at most one primary). It sets the document title. On phones it moves into the pine app header.
 */
export function PageHeader({ title, titleText, monthLabel, context, chip, breadcrumb, actions, portal = true }: {
  /** The visible title. A string is the h1; a control (MonthTitle) shows as is, with titleText as a hidden h1. */
  title: ReactNode
  /** The title in words, for the h1 and the document title. */
  titleText: string
  /** Adds the month to the document title: "Month · November 2026 · North". */
  monthLabel?: string
  context?: ReactNode
  chip?: ReactNode
  breadcrumb?: BreadcrumbItem[]
  actions?: ReactNode
  /** Phones: move into the app header's slot (default). The dev gallery turns it off to show variants. */
  portal?: boolean
}) {
  useEffect(() => {
    const previous = window.document.title
    window.document.title = monthLabel ? `${titleText} · ${monthLabel} · North` : `${titleText} · North`
    return () => { window.document.title = previous }
  }, [titleText, monthLabel])
  const mobile = useMobilePresentation()
  // The app header's slot on phones; absent when a page renders on its own (tests, setup).
  const headerSlot = useSyncExternalStore(subscribeNothing, findHeaderSlot, () => null)
  const heading = typeof title === 'string' ? <h1 className="page-header-title">{title}</h1> : <><h1 className="visually-hidden">{titleText}</h1>{title}</>
  if (portal && mobile && headerSlot) return createPortal(<div className="mobile-header-page page-header-mobile">
    {heading}
    {(context || chip) && <p className="page-header-context">{chip}{context}</p>}
    {actions && <div className="page-header-actions">{actions}</div>}
  </div>, headerSlot)
  return <div className="page-header">
    {breadcrumb && <Breadcrumb items={breadcrumb}/>}
    <div className="page-header-row">
      <div className="page-header-heading">{heading}{chip}</div>
      {context && <div className="page-header-context">{context}</div>}
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  </div>
}
