import type { ReactNode, RefObject } from 'react'

/** Shared page shell. Its named regions stay direct children so existing page layouts remain intact. */
export function PageFrame({ title, description, eyebrow, headerActions, summary, pageControls, headingRef, headingClass = 'route-heading', className = '', contentWidth = 'wide', beforeHeading, afterSummary, children }: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  headerActions?: ReactNode
  summary?: ReactNode
  /** Persistent page-level controls, placed with the heading and summary outside the scrolling body. */
  pageControls?: ReactNode
  headingRef?: RefObject<HTMLHeadingElement | null>
  headingClass?: string
  className?: string
  contentWidth?: 'wide' | 'narrow'
  beforeHeading?: ReactNode
  afterSummary?: ReactNode
  children: ReactNode
}) {
  return <div className={`page-frame ${className}`.trim()}>
    {beforeHeading}
    <div className={`page-frame-heading ${headingClass}`}><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 ref={headingRef} tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{headerActions}</div>
    {summary && <div className="page-frame-summary">{summary}</div>}
    {pageControls && <div className="page-frame-controls">{pageControls}</div>}
    {afterSummary}
    <div className={`page-frame-body page-frame-body--${contentWidth}`}>{children}</div>
  </div>
}
