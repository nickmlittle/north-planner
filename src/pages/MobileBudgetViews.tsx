import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronRight, Info, X } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { budgetTransfers } from '../domain/budgetTransfers'
import type { BudgetItem } from '../domain/monthlyBudget'
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
      : <div className="budget-mobile-summary-support"><div><span className={incomplete ? 'budget-allocation-incomplete' : undefined}>{incomplete ? 'Allocation needs attention' : hasItems ? 'All items allocated' : 'No allocations yet'}</span><span className="budget-mobile-summary-note">Planned contributions{incomplete ? ' · Incomplete total' : ''}</span></div></div>}
  </section>
}

function Contributions({ people, adults }: { people: PersonAmount[]; adults: BudgetDocument['household']['adults'] }) {
  return <dl className="budget-contributions">{people.map(person => <div key={person.personId}><dt>{adults.find(adult => adult.id === person.personId)?.name ?? 'Person'}</dt><dd>{pounds(person.amountPence)}</dd></div>)}</dl>
}

export function MobileTransferCards({ groups, labels, document, items, collapsed, onToggle }: {
  groups: { key: string; label: string; accounts: Transfers['accounts'] }[]
  labels: Map<string, string>; document: BudgetDocument; items: BudgetItem[]; collapsed: Record<string, boolean>; onToggle: (id: string) => void
}) {
  const prefix = useId()
  return <div className="budget-mobile-destinations" role="region" aria-label="Transfers by account owner">
    {groups.filter(group => group.accounts.length > 0).map(group => <section className="budget-destination-group" key={group.key} aria-label={`${group.label} destinations`}>
      <h3>{group.label}</h3>
      {group.accounts.map(account => {
        const label = labels.get(account.accountId) ?? 'Account', open = collapsed[account.accountId] === false
        const detailsId = `${prefix}-${account.accountId}`
        const people = account.directByPerson.map(person => ({ personId: person.personId, amountPence: person.amountPence + account.pots.reduce((sum, pot) => sum + (pot.byPerson.find(row => row.personId === person.personId)?.amountPence ?? 0), 0) }))
        return <article className="budget-destination-card" aria-label={label} key={account.accountId}>
          <header><h4>{label}</h4><div className="budget-destination-amount"><span>Allocated total</span><strong>{pounds(account.amountPence)}</strong>{account.incomplete && <small className="budget-allocation-incomplete">Incomplete allocation</small>}</div></header>
          <Contributions people={people} adults={document.household.adults}/>
          <button type="button" className="budget-destination-disclosure" aria-label={`${open ? 'Hide' : 'View'} budget items for ${label}`} aria-expanded={open} aria-controls={detailsId} onClick={() => onToggle(account.accountId)}>{open ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}{open ? 'Hide budget items' : 'View budget items'}<span>{account.items.length}</span></button>
          {open && <div id={detailsId} className="budget-destination-items">{account.items.map(item => {
            const destination = items.find(row => row.id === item.id)?.destination
            const potName = destination?.kind === 'pot' ? document.budget.pots.find(pot => pot.id === destination.potId)?.name ?? 'Pot' : 'Direct to account'
            return <section className="budget-destination-item" aria-label={item.name} key={item.id}>
              <header><div><h5>{item.name}</h5><p>{potName}</p></div><div className="budget-destination-amount"><span>Item total</span><strong>{pounds(item.amountPence)}</strong>{item.incomplete && <small className="budget-allocation-incomplete">Incomplete allocation</small>}</div></header>
              <Contributions people={item.byPerson} adults={document.household.adults}/>
            </section>
          })}</div>}
        </article>
      })}
    </section>)}
  </div>
}
