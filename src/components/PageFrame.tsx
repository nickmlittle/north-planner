import type { ReactNode, RefObject } from 'react'

/** Shared page shell. Its named regions stay direct children so existing page layouts remain intact. */
export function PageFrame({ title, eyebrow, headerActions, summary, pageControls, headingRef, headingClass = 'route-heading', className = '', contentWidth = 'wide', beforeHeading, afterHeading, afterSummary, regions, children }: {
  title: ReactNode
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
  afterHeading?: ReactNode
  afterSummary?: ReactNode
  /** A page that switches its content under one heading renders its own regions (see PageFrameRegions) in place of summary…children. */
  regions?: ReactNode
  children?: ReactNode
}) {
  return <div className={`page-frame ${className}`.trim()}>
    {beforeHeading}
    <div className={`page-frame-heading ${headingClass}`}><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 ref={headingRef} tabIndex={-1}>{title}</h1></div>{headerActions}</div>
    {afterHeading}
    {regions ?? <PageFrameRegions summary={summary} pageControls={pageControls} afterSummary={afterSummary} contentWidth={contentWidth}>{children}</PageFrameRegions>}
  </div>
}

/** The frame's regions under the heading. The body is left out when there are no children. */
export function PageFrameRegions({ summary, pageControls, afterSummary, contentWidth = 'wide', children }: { summary?: ReactNode; pageControls?: ReactNode; afterSummary?: ReactNode; contentWidth?: 'wide' | 'narrow'; children?: ReactNode }) {
  return <>
    {summary && <div className="page-frame-summary">{summary}</div>}
    {pageControls && <div className="page-frame-controls">{pageControls}</div>}
    {afterSummary}
    {children !== undefined && <div className={`page-frame-body page-frame-body--${contentWidth}`}>{children}</div>}
  </>
}
