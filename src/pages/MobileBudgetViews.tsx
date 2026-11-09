import type { ReactNode } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import { Info } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { balanceLabel, formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

export function BudgetInfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <ModalDialog title={title} onClose={onClose}>{children}</ModalDialog>
}

type Adults = BudgetDocument['household']['adults']
export type TransferPersonChoice = { adults: Adults; selection: string | 'both' | null; onSelect: (value: string) => void; plan?: { name: string; fundingPence: number; stepCount: number }; reviewCount?: number }

/** Ada · Ben · Both. Unchosen, it asks once; afterwards it is a plain switch. */
function TransferPersonSwitch({ adults, selection, onSelect }: TransferPersonChoice) {
  const options = [...adults.map(adult => ({ value: adult.id, label: adult.name })), { value: 'both', label: 'Both' }]
  const group = <div className="transfer-view-switch transfer-person-switch" role="group" aria-label="Whose transfers">{options.map(option => <button type="button" key={option.value} aria-pressed={selection === option.value} onClick={() => onSelect(option.value)}>{option.label}</button>)}</div>
  if (selection) return group
  return <div className="transfer-person-prompt"><p><strong>Who’s moving money on this phone?</strong></p>{group}</div>
}

export function MobileBudgetSummary({ view, available, planned, allocated, hasItems, incomplete, onDetails, person }: {
  view: 'plan' | 'transfers'; available: number; planned: number; allocated: number; hasItems: boolean; incomplete: boolean; onDetails: () => void; person?: TransferPersonChoice
}) {
  const plan = view === 'plan', balance = available - planned
  const balanceText = balanceLabel(balance)
  const personal = !plan ? person?.plan : undefined
  const review = person?.reviewCount ? `${person.reviewCount} ${person.reviewCount === 1 ? 'account needs' : 'accounts need'} review` : incomplete ? 'Some accounts need review' : ''
  const transfersStatus = personal ? [`${personal.stepCount} ${personal.stepCount === 1 ? 'step' : 'steps'}`, review].filter(Boolean).join(' · ') : review || (hasItems ? 'All items funded' : '')
  return <section className={`budget-mobile-summary${plan ? balance < 0 ? ' is-deficit' : balance > 0 ? ' is-surplus' : ' is-balanced' : ''}`} aria-label={`${plan ? 'Plan' : 'Transfers'} summary`}>
    {!plan && person && person.adults.length > 1 && <TransferPersonSwitch {...person}/>}
    <div className="budget-mobile-summary-heading"><h2>{plan ? 'Plan' : personal ? `${personal.name}’s funding` : 'Funding'}</h2><button type="button" aria-label={`${plan ? 'Plan' : 'Transfers'} summary details`} onClick={onDetails}>{plan && <span className="budget-plan-details-label">Details</span>}<Info aria-hidden="true"/></button></div>
    <p className="budget-mobile-summary-value">{plan ? balance < 0 ? <><span className="budget-mobile-summary-context">Planned {pounds(planned)} of {pounds(available)}</span><span className="budget-balance-over">{balanceText}</span></> : balanceText : pounds(personal ? personal.fundingPence : allocated)}</p>
    {plan ? <dl className="budget-mobile-summary-support"><div><dt>Available</dt><dd>{pounds(available)}</dd></div><div><dt>Planned</dt><dd>{pounds(planned)}</dd></div></dl>
      : transfersStatus && <p className={`budget-mobile-allocation-status${incomplete ? ' budget-allocation-incomplete' : ''}`}>{transfersStatus}</p>}
  </section>
}
