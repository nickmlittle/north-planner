import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Info, X } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { budgetTransfers } from '../domain/budgetTransfers'
import { formatGBPSummary } from '../formatting/money'

const pounds = (pence: number) => formatGBPSummary(pence / 100)
type Transfers = ReturnType<typeof budgetTransfers>
type PersonAmount = { personId: string; amountPence: number }

export function BudgetInfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const background: { element: Element; inert: boolean }[] = []
    for (let branch: Element = dialog; branch.parentElement; branch = branch.parentElement) {
      background.push(...[...branch.parentElement.children].filter(element => element !== branch)
        .map(element => ({ element, inert: element.hasAttribute('inert') })))
      if (branch.parentElement === document.body) break
    }
    background.forEach(({ element }) => element.setAttribute('inert', ''))
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) dialog.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('focusin', keepFocus)
    dialog.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      document.removeEventListener('focusin', keepFocus)
      background.forEach(({ element, inert }) => { if (!inert) element.removeAttribute('inert') })
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(<div className="budget-info-overlay"><section ref={ref} className="budget-info-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose}><X aria-hidden="true"/></button></header>
    <div className="budget-info-content">{children}</div>
  </section></div>, document.getElementById('root') ?? document.body)
}

export function MobileBudgetSummary({ view, available, planned, allocated, hasItems, incomplete, onDetails }: {
  view: 'plan' | 'transfers'; available: number; planned: number; allocated: number; hasItems: boolean; incomplete: boolean; onDetails: () => void
}) {
  const plan = view === 'plan', balance = available - planned
  const balanceText = balance === 0 ? 'Budget balanced' : `${pounds(Math.abs(balance))} ${balance < 0 ? 'over budget' : 'remaining'}`
  return <section className={`budget-mobile-summary${plan && balance < 0 ? ' is-deficit' : ''}`} aria-label={`${plan ? 'Plan' : 'Transfers'} summary`}>
    <div className="budget-mobile-summary-heading"><h2>{plan ? 'Budget balance' : 'Allocated total'}</h2><button type="button" aria-label={`${plan ? 'Plan' : 'Transfers'} summary details`} onClick={onDetails}><Info aria-hidden="true"/></button></div>
    <p className="budget-mobile-summary-value">{plan ? balanceText : pounds(allocated)}</p>
    {plan ? <dl className="budget-mobile-summary-support"><div><dt>Available income</dt><dd>{pounds(available)}</dd></div><div><dt>Planned budget</dt><dd>{pounds(planned)}</dd></div></dl>
      : <p className={`budget-mobile-allocation-status${incomplete ? ' budget-allocation-incomplete' : ''}`}>{incomplete ? 'Allocation needs attention' : hasItems ? 'All items allocated' : 'No allocations yet'}</p>}
  </section>
}

function Contributions({ people, adults }: { people: PersonAmount[]; adults: BudgetDocument['household']['adults'] }) {
  return <dl className="budget-contributions">{people.map(person => <div key={person.personId}><dt>{adults.find(adult => adult.id === person.personId)?.name ?? 'Person'}</dt><dd>{pounds(person.amountPence)}</dd></div>)}</dl>
}

export type MobileTransferGroup = { key: string; label: string; accounts: Transfers['accounts'] }

export function MobileTransferOverview({ groups, labels, adults, accountPeople, onOpen }: {
  groups: MobileTransferGroup[]
  labels: Map<string, string>
  adults: BudgetDocument['household']['adults']
  accountPeople: (account: Transfers['accounts'][number]) => PersonAmount[]
  onOpen: (accountId: string) => void
}) {
  return <div className="budget-mobile-destinations" role="region" aria-label="Transfers by account owner">
    {groups.filter(group => group.accounts.length > 0).map(group => <section className="budget-destination-group" key={group.key} aria-label={`${group.label} destinations`}>
      <h3>{group.label}</h3>
      <ul>{group.accounts.map(account => {
        const label = labels.get(account.accountId) ?? 'Account'
        const nonzeroPeople = accountPeople(account).filter(person => person.amountPence !== 0)
        return <li key={account.accountId}><button type="button" className="budget-destination-row" aria-label={`${group.label} · ${label}, ${pounds(account.amountPence)} allocated, ${account.items.length} ${account.items.length === 1 ? 'item' : 'items'}${account.incomplete ? ', incomplete allocation' : ''}`} onClick={() => onOpen(account.accountId)}>
          <span className="budget-destination-main"><span className="budget-destination-name">{label}</span><strong className="budget-destination-total">{pounds(account.amountPence)}</strong></span>
          <span className="budget-destination-contribution-line">{nonzeroPeople.length ? nonzeroPeople.map((person, index) => <span key={person.personId}>{index > 0 && <span aria-hidden="true"> · </span>}{adults.find(adult => adult.id === person.personId)?.name ?? 'Person'} {pounds(person.amountPence)}</span>) : 'No contribution allocated'}</span>
          <span className="budget-destination-meta"><span>{account.items.length} {account.items.length === 1 ? 'item' : 'items'}{account.incomplete && <span className="budget-allocation-incomplete"> · Incomplete allocation</span>}</span><ChevronRight size={18} aria-hidden="true" /></span>
        </button></li>
      })}</ul>
    </section>)}
  </div>
}

/** Keeps the existing breakdown available until the full-screen detail flow is added. */
export function MobileTransferPreview({ account, document, accountPeople }: {
  account: Transfers['accounts'][number]; document: BudgetDocument; accountPeople: PersonAmount[]
}) {
  return <div className="budget-destination-preview">
    <p><strong>Allocated total {pounds(account.amountPence)}</strong>{account.incomplete && <span className="budget-allocation-incomplete"> · Incomplete allocation</span>}</p>
    <Contributions people={accountPeople} adults={document.household.adults}/>
    <h3>Allocation breakdown</h3>
    <div className="budget-destination-allocations">
      {account.hasDirect && <section className="budget-destination-allocation" aria-label="Direct to account">
        <header><h4>Direct to account</h4><strong>{pounds(account.directAmountPence)}</strong></header>
        <Contributions people={account.directByPerson} adults={document.household.adults}/>
      </section>}
      {account.pots.map(pot => <section className="budget-destination-allocation" aria-label={document.budget.pots.find(row => row.id === pot.potId)?.name ?? 'Pot'} key={pot.potId}>
        <header><h4>{document.budget.pots.find(row => row.id === pot.potId)?.name ?? 'Pot'}</h4><strong>{pounds(pot.amountPence)}</strong></header>
        <Contributions people={pot.byPerson} adults={document.household.adults}/>
      </section>)}
    </div>
    <p className="budget-destination-rounding">Amounts are rounded to whole pounds and may not add up exactly.</p>
  </div>
}
