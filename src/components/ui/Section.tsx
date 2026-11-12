import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import './Section.css'

/**
 * A titled block of a page: "Payday · 9 of 18", with an aside on the right. Collapsed, a finished section folds
 * to one row ("Payday · done") that expands on click.
 */
export function Section({ title, count, aside, collapsed, id, children }: {
  title: string
  count?: ReactNode
  aside?: ReactNode
  collapsed?: { summary: ReactNode; onExpand: () => void }
  id?: string
  children?: ReactNode
}) {
  const headingId = useId()
  if (collapsed) return <section className="ui-section is-collapsed" id={id} aria-labelledby={headingId}>
    <h2 id={headingId} className="ui-section-heading"><button type="button" className="ui-section-expand" aria-expanded="false" onClick={collapsed.onExpand}>
      <span className="ui-section-title">{title}</span><span className="ui-section-summary">{collapsed.summary}</span><ChevronDown aria-hidden="true"/>
    </button></h2>
  </section>
  return <section className="ui-section" id={id} aria-labelledby={headingId}>
    <div className="ui-section-head">
      <h2 id={headingId} className="ui-section-heading"><span className="ui-section-title">{title}</span>{count !== undefined && <span className="ui-section-count">{count}</span>}</h2>
      {aside && <div className="ui-section-aside">{aside}</div>}
    </div>
    {children}
  </section>
}
