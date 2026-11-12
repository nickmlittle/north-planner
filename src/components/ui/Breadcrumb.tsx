import { ChevronRight } from 'lucide-react'
import './Breadcrumb.css'

export type BreadcrumbItem = { label: string; onClick?: () => void }

/** "Month › Groceries": the way back from a detail page. The last item is the current page, not a link. */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return <nav aria-label="Breadcrumb"><ol className="breadcrumb">
    {items.map((item, index) => index < items.length - 1
      ? <li key={item.label}><button type="button" className="text-button breadcrumb-link" onClick={item.onClick}>{item.label}</button><ChevronRight aria-hidden="true"/></li>
      : <li key={item.label} aria-current="page">{item.label}</li>)}
  </ol></nav>
}
