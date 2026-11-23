import { ChevronRight } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { freshness } from './spendingFormat'
import './Freshness.css'

/**
 * The freshness line, with "3 to sort · 6 waiting ›" opening Spending's To sort, where the Waiting section sits under
 * To sort (W12). "all sorted" only once nothing is to sort or waiting. Nothing without a card.
 */
export function FreshnessLine({ document, onSort }: { document: Pick<BudgetDocument, 'card'>; onSort?: () => void }) {
  const fresh = freshness(document)
  if (!fresh) return null
  const open = [fresh.toSort ? `${fresh.toSort} to sort` : '', fresh.waiting ? `${fresh.waiting} waiting` : ''].filter(Boolean).join(' · ')
  return <span className="freshness">{fresh.lead}{fresh.broughtIn && <>{' · '}{open
    ? onSort ? <button type="button" className="text-button freshness-sort" onClick={onSort}>{open}<ChevronRight aria-hidden="true"/></button> : open
    : 'all sorted'}</>}</span>
}
