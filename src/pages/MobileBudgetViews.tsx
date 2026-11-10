import type { ReactNode } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import { Check, Info } from 'lucide-react'
import type { PersonProgress } from '../domain/transferTicks'
import type { BudgetDocument } from '../domain/budgetDocument'
import { formatGBP } from '../formatting/money'
import { stepSummary } from './budgetLabels'

const pounds = (pence: number) => formatGBP(pence / 100)

export function BudgetInfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <ModalDialog title={title} onClose={onClose}>{children}</ModalDialog>
}

type Adults = BudgetDocument['household']['adults']
export type TransferPersonChoice = {
  adults: Adults; selection: string | 'both' | null; onSelect: (value: string) => void
  plan?: { name: string; fundingPence: number; fundCount: number; moveCount: number }; reviewCount?: number
  /** Tick-off progress by person, and the month it is for ("November"). */
  progress?: Record<string, PersonProgress>; monthName?: string
}

/** Ada · Ben · Both. Unchosen, it asks once; afterwards it is a plain switch. */
function TransferPersonSwitch({ adults, selection, onSelect, progress }: TransferPersonChoice) {
  const count = (personId: string) => { const row = progress?.[personId]; return !row?.total ? '' : row.complete ? '✓' : `${row.done}/${row.total}` }
  const options = [...adults.map(adult => ({ value: adult.id, label: adult.name, count: count(adult.id) })), { value: 'both', label: 'Both', count: '' }]
  const group = <div className="transfer-view-switch transfer-person-switch" role="group" aria-label="Whose transfers">{options.map(option => <button type="button" key={option.value} aria-pressed={selection === option.value} onClick={() => onSelect(option.value)}>{option.label}{option.count && <small aria-hidden="true">{option.count}</small>}</button>)}</div>
  if (selection) return group
  return <div className="transfer-person-prompt"><p><strong>Who’s moving money on this phone?</strong></p>{group}</div>
}

/** Transfers on phones: whose funding, its total and status, with a details button. (Plan uses the allocation meter.) */
export function MobileBudgetSummary({ allocated, hasItems, incomplete, onDetails, person }: {
  allocated: number; hasItems: boolean; incomplete: boolean; onDetails: () => void; person?: TransferPersonChoice
}) {
  const personal = person?.plan
  const review = person?.reviewCount ? `${person.reviewCount} ${person.reviewCount === 1 ? 'account needs' : 'accounts need'} review` : incomplete ? 'Some accounts need review' : ''
  const transfersStatus = personal ? [stepSummary(personal), review].filter(Boolean).join(' · ') : review || (hasItems ? 'All items funded' : '')
  // Progress for the person shown, or everyone together under Both.
  const shownIds = person?.selection && person.selection !== 'both' ? [person.selection] : person?.adults.map(adult => adult.id) ?? []
  const rows = shownIds.map(id => person?.progress?.[id]).filter((row): row is PersonProgress => !!row && row.total > 0)
  const tally = person?.progress ? { total: rows.reduce((sum, row) => sum + row.total, 0), done: rows.reduce((sum, row) => sum + row.done, 0), complete: rows.length > 0 && rows.every(row => row.complete) } : null
  const month = person?.monthName ?? 'this month'
  const doneTitle = personal ? `${personal.name} is up to date for ${month}` : shownIds.length === 2 ? `You’re both up to date for ${month}` : `Everyone is up to date for ${month}`
  return <section className="budget-mobile-summary" aria-label="Transfers summary">
    {person && person.adults.length > 1 && <TransferPersonSwitch {...person}/>}
    <div className="budget-mobile-summary-heading"><h2>{personal ? `${personal.name}’s funding` : 'Funding'}</h2><button type="button" aria-label="Transfers summary details" onClick={onDetails}><Info aria-hidden="true"/></button></div>
    <p className="budget-mobile-summary-value">{pounds(personal ? personal.fundingPence : allocated)}</p>
    {transfersStatus && <p className={`budget-mobile-allocation-status${incomplete ? ' budget-allocation-incomplete' : ''}`}>{transfersStatus}</p>}
    {tally && tally.total > 0 && (tally.complete
      ? <div className="transfer-done-banner" role="status"><span className="transfer-done-icon" aria-hidden="true"><Check/></span><span><strong>{doneTitle}</strong><span>All {tally.total} steps ticked.</span></span></div>
      : <div className="transfer-progress"><p><span>Ticked off</span><strong>{tally.done} of {tally.total} done</strong></p><span className="transfer-progress-track" aria-hidden="true"><span style={{ width: `${tally.done / tally.total * 100}%` }}/></span></div>)}
  </section>
}
