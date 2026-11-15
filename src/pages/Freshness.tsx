import { ChevronRight } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { freshness } from './spendingFormat'
import './Freshness.css'

/** The freshness line, with "3 to sort ›" opening Spending's To sort. Nothing without a card. */
export function FreshnessLine({ document, onSort }: { document: Pick<BudgetDocument, 'card'>; onSort?: () => void }) {
  const fresh = freshness(document)
  if (!fresh) return null
  return <span className="freshness">{fresh.lead}{fresh.broughtIn && <>{' · '}{fresh.toSort > 0
    ? onSort ? <button type="button" className="text-button freshness-sort" onClick={onSort}>{fresh.toSort} to sort<ChevronRight aria-hidden="true"/></button> : `${fresh.toSort} to sort`
    : 'all sorted'}</>}</span>
}
