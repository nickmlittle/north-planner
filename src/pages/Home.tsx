import { useSyncExternalStore } from 'react'
import { ChevronRight } from 'lucide-react'
import { MOBILE_QUERY } from '../breakpoints'
import { AllocationMeter } from '../components/AllocationMeter'
import { PageFrame } from '../components/PageFrame'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { resolveBudget } from '../domain/monthlyBudget'
import { formatMonth } from '../formatting/month'

const subscribeMobile = (callback: () => void) => { const query = window.matchMedia?.(MOBILE_QUERY); query?.addEventListener('change', callback); return () => query?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches

type Props = {
  document: BudgetDocument
  /** The month Home summarises: this month, unless a link says otherwise. */
  month: string
  onOpenPlan: () => void
  onOpenTransfers: () => void
  /** Plan filtered to one person's accounts. */
  onReviewPerson: (personId: string) => void
}

/** Where the app opens: this month at a glance, and what is left to do. */
export function Home({ document, month, onOpenPlan, onOpenTransfers, onReviewPerson }: Props) {
  const compact = useSyncExternalStore(subscribeMobile, getMobile, () => false)
  const adults = document.household.adults
  const items = resolveBudget(document.budget, month).items
  const transfers = budgetTransfers(document.budget, adults.map(person => person.id), month, items)
  const planned = items.reduce((sum, item) => sum + item.amountPence, 0)
  const people = transfers.people.map(row => ({ personId: row.personId, name: adults.find(person => person.id === row.personId)?.name ?? 'Person', availablePence: row.availablePence, plannedPence: row.plannedPence }))
  const monthName = formatMonth(month).split(' ')[0]

  return <PageFrame className="home-page" headingClass="home-heading" eyebrow="This month" title={formatMonth(month)} contentWidth="wide"
    headerActions={<div className="home-heading-actions"><button type="button" className="secondary-button" onClick={onOpenTransfers}>Open Transfers</button><button type="button" className="primary-button" onClick={onOpenPlan}>Open Plan</button></div>}
    summary={<AllocationMeter label="Plan summary" compact={compact} eyebrow={`${monthName} plan`} availablePence={transfers.availablePence} plannedPence={planned} people={people} onReview={onReviewPerson}
      actions={<button type="button" className="allocation-meter-review home-open-plan" onClick={onOpenPlan}>Open Plan<ChevronRight aria-hidden="true"/></button>}/>}>
    <div className="home-sections"/>
  </PageFrame>
}
