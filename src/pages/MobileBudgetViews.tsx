import type { ReactNode } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import { Info } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { formatGBP } from '../formatting/money'
import { stepSummary } from './budgetLabels'

const pounds = (pence: number) => formatGBP(pence / 100)

export function BudgetInfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <ModalDialog title={title} onClose={onClose}>{children}</ModalDialog>
}

type Adults = BudgetDocument['household']['adults']
export type TransferPersonChoice = { adults: Adults; selection: string | 'both' | null; onSelect: (value: string) => void; plan?: { name: string; fundingPence: number; fundCount: number; moveCount: number }; reviewCount?: number }

/** Ada · Ben · Both. Unchosen, it asks once; afterwards it is a plain switch. */
function TransferPersonSwitch({ adults, selection, onSelect }: TransferPersonChoice) {
  const options = [...adults.map(adult => ({ value: adult.id, label: adult.name })), { value: 'both', label: 'Both' }]
  const group = <div className="transfer-view-switch transfer-person-switch" role="group" aria-label="Whose transfers">{options.map(option => <button type="button" key={option.value} aria-pressed={selection === option.value} onClick={() => onSelect(option.value)}>{option.label}</button>)}</div>
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
  return <section className="budget-mobile-summary" aria-label="Transfers summary">
    {person && person.adults.length > 1 && <TransferPersonSwitch {...person}/>}
    <div className="budget-mobile-summary-heading"><h2>{personal ? `${personal.name}’s funding` : 'Funding'}</h2><button type="button" aria-label="Transfers summary details" onClick={onDetails}><Info aria-hidden="true"/></button></div>
    <p className="budget-mobile-summary-value">{pounds(personal ? personal.fundingPence : allocated)}</p>
    {transfersStatus && <p className={`budget-mobile-allocation-status${incomplete ? ' budget-allocation-incomplete' : ''}`}>{transfersStatus}</p>}
  </section>
}
