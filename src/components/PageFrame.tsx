import type { ReactNode, RefObject } from 'react'

/** Shared page shell. Its named regions stay direct children so existing page layouts remain intact. */
export function PageFrame({ title, description, eyebrow, titleAside, summary, headingRef, headingClass = 'route-heading', className = '', element = 'main', beforeHeading, afterSummary, children }: {
  title?: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  titleAside?: ReactNode
  summary?: ReactNode
  headingRef?: RefObject<HTMLHeadingElement | null>
  headingClass?: string
  className?: string
  element?: 'main' | 'section' | 'div'
  beforeHeading?: ReactNode
  afterSummary?: ReactNode
  children: ReactNode
}) {
  const Root = element
  return <Root className={`page-frame ${className}`.trim()}>
    {beforeHeading}
    {title && <div className={`page-frame-heading ${headingClass}`}><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 ref={headingRef} tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{titleAside}</div>}
    {summary && <div className="page-frame-summary">{summary}</div>}
    {afterSummary}
    {children}
  </Root>
}
