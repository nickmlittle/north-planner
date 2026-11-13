import './PageSkeleton.css'

/** While a page's code loads: its header's height and three muted rows, so nothing jumps when it arrives. */
export function PageSkeleton() {
  return <div className="page-skeleton" role="status" aria-label="Loading">
    <span className="page-skeleton-title"/>
    <span className="page-skeleton-row"/><span className="page-skeleton-row"/><span className="page-skeleton-row"/>
  </div>
}
