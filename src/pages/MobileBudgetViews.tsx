import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ModalDialog } from '../components/ModalDialog'
import { ArrowLeft, ChevronRight, Info } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { TransferInstructionAccount } from '../domain/transferInstructions'
import { AccountFundingNote, PotMovementNote } from './TransferCalculationNotes'
import type { budgetTransfers } from '../domain/budgetTransfers'
import type { PersonTransferPlans } from '../domain/personTransfers'
import { formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)
type Transfers = ReturnType<typeof budgetTransfers>
type PersonAmount = { personId: string; amountPence: number }

export function BudgetInfoDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <ModalDialog title={title} onClose={onClose}>{children}</ModalDialog>
}

type Adults = BudgetDocument['household']['adults']
export type TransferPersonChoice = { adults: Adults; selection: string | 'both' | null; onSelect: (value: string) => void; plan?: { name: string; fundingPence: number; stepCount: number } }

/** Ada · Ben · Both. Unchosen, it asks once; afterwards it is a plain switch. */
function TransferPersonSwitch({ adults, selection, onSelect }: TransferPersonChoice) {
  const options = [...adults.map(adult => ({ value: adult.id, label: adult.name })), { value: 'both', label: 'Both' }]
  const group = <div className="transfer-view-switch transfer-person-switch" role="group" aria-label="Whose transfers">{options.map(option => <button type="button" key={option.value} aria-pressed={selection === option.value} onClick={() => onSelect(option.value)}>{option.label}</button>)}</div>
  if (selection) return group
  return <div className="transfer-person-prompt"><p><strong>Who’s moving money on this phone?</strong></p>{group}<p className="transfer-person-hint">You can change this any time.</p></div>
}

export function MobileBudgetSummary({ view, available, planned, allocated, hasItems, incomplete, onDetails, person }: {
  view: 'plan' | 'transfers'; available: number; planned: number; allocated: number; hasItems: boolean; incomplete: boolean; onDetails: () => void; person?: TransferPersonChoice
}) {
  const plan = view === 'plan', balance = available - planned
  const balanceText = balance === 0 ? 'Budget balanced' : `${pounds(Math.abs(balance))} ${balance < 0 ? 'over' : 'left to allocate'}`
  const personal = !plan ? person?.plan : undefined
  const transfersStatus = personal ? `${personal.stepCount} ${personal.stepCount === 1 ? 'step' : 'steps'}${incomplete ? ' · Instructions need review' : ''}` : incomplete ? 'Instructions need review' : hasItems ? 'All items allocated' : 'No allocations yet'
  return <section className={`budget-mobile-summary${plan ? balance < 0 ? ' is-deficit' : balance > 0 ? ' is-surplus' : ' is-balanced' : ''}`} aria-label={`${plan ? 'Plan' : 'Transfers'} summary`}>
    {!plan && person && person.adults.length > 1 && <TransferPersonSwitch {...person}/>}
    <div className="budget-mobile-summary-heading"><h2>{plan ? 'Budget balance' : personal ? `${personal.name} moves` : 'Funding total'}</h2><button type="button" aria-label={`${plan ? 'Plan' : 'Transfers'} summary details`} onClick={onDetails}>{plan && <span className="budget-plan-details-label">Details</span>}<Info aria-hidden="true"/></button></div>
    <p className="budget-mobile-summary-value">{plan ? balance < 0 ? <><span className="budget-mobile-summary-context">Planned {pounds(planned)} of {pounds(available)}</span><span className="budget-balance-over">{balanceText}</span></> : balanceText : pounds(personal ? personal.fundingPence : allocated)}</p>
    {plan ? <dl className="budget-mobile-summary-support"><div><dt>Available income</dt><dd>{pounds(available)}</dd></div><div><dt>Planned budget</dt><dd>{pounds(planned)}</dd></div></dl>
      : <p className={`budget-mobile-allocation-status${incomplete ? ' budget-allocation-incomplete' : ''}`}>{transfersStatus}</p>}
  </section>
}

function Contributions({ people, adults }: { people: PersonAmount[]; adults: BudgetDocument['household']['adults'] }) {
  return <dl className="budget-contributions">{people.map(person => <div key={person.personId}><dt>{adults.find(adult => adult.id === person.personId)?.name ?? 'Person'}</dt><dd>{pounds(person.amountPence)}</dd></div>)}</dl>
}

/** Who pays, not who owns: one group per person (or the chosen one), then anything not calculated. */
export function MobileTransferOverview({ plans, selection, accounts, labels, adults, potName, onOpen, affectedAccounts }: {
  plans: PersonTransferPlans
  selection: string | 'both' | null
  accounts: Transfers['accounts']
  labels: Map<string, string>
  adults: Adults
  potName: (potId: string) => string
  onOpen: (accountId: string, trigger: HTMLButtonElement) => void
  affectedAccounts?: readonly string[]
}) {
  const shown = plans.people.filter(plan => plan.rows.length > 0 && (!selection || selection === 'both' || plan.personId === selection))
  const name = (personId: string) => adults.find(adult => adult.id === personId)?.name ?? 'Person'
  const meta = (account: Transfers['accounts'][number]) => <span className="budget-destination-meta"><span>{account.items.length} {account.items.length === 1 ? 'item' : 'items'}{affectedAccounts?.includes(account.accountId) && <span className="budget-affected-label"> · Changed by recent edit</span>}{account.incomplete && <span className="budget-allocation-incomplete"> · Account instructions need review</span>}</span><ChevronRight size={18} aria-hidden="true" /></span>
  const itemsText = (account: Transfers['accounts'][number]) => `${account.items.length} ${account.items.length === 1 ? 'item' : 'items'}${account.incomplete ? ', account instructions need review' : ''}`
  const notCalculated = plans.notCalculated.flatMap(id => accounts.filter(account => account.accountId === id))
  const chosen = selection && selection !== 'both' ? name(selection) : null
  return <div className="budget-mobile-destinations" role="region" aria-label="Transfers by person">
    {!shown.length && !notCalculated.length && <p className="budget-destination-empty">{chosen ? `${chosen} has nothing to move this month.` : 'Nothing to move this month.'}</p>}
    {shown.map(plan => <section className="budget-destination-group" key={plan.personId} aria-label={`${name(plan.personId)} transfers`}>
      <h3><span>{name(plan.personId)}</span><span className="budget-destination-group-total">{pounds(plan.fundingPence)}</span></h3>
      <ul>{plan.rows.map(row => {
        const account = accounts.find(item => item.accountId === row.accountId)!
        const label = labels.get(row.accountId) ?? 'Account'
        const moved = row.potMoves.reduce((sum, move) => sum + move.amountPence, 0)
        const into = row.potMoves.length === 1 ? potName(row.potMoves[0]!.potId) : `${row.potMoves.length} pots`
        const moveText = row.potMoves.length ? `Then move ${pounds(moved)} into ${into}` : ''
        return <li key={row.accountId}><button type="button" className="budget-destination-row" data-transfer-account={row.accountId} aria-label={`${label}, ${row.fundingPence > 0 ? `${name(plan.personId)} funds ${pounds(row.fundingPence)}` : 'nothing to fund'}${moveText ? `, then moves ${pounds(moved)} into ${into}` : ''}, ${itemsText(account)}`} onClick={event => onOpen(row.accountId, event.currentTarget)}>
          <span className="budget-destination-main"><span className="budget-destination-name">{label}</span>{row.fundingPence > 0 ? <strong className="budget-destination-total">{pounds(row.fundingPence)}</strong> : <span className="budget-destination-nothing">Nothing to fund</span>}</span>
          {moveText && <span className="budget-destination-contribution-line">{moveText}</span>}
          {meta(account)}
        </button></li>
      })}</ul>
    </section>)}
    {notCalculated.length > 0 && <section className="budget-destination-group" aria-label="Needs review destinations">
      <h3><span>Needs review</span></h3>
      <ul>{notCalculated.map(account => {
        const label = labels.get(account.accountId) ?? 'Account'
        return <li key={account.accountId}><button type="button" className="budget-destination-row" data-transfer-account={account.accountId} aria-label={`${label}, funding not calculated, ${itemsText(account)}`} onClick={event => onOpen(account.accountId, event.currentTarget)}>
          <span className="budget-destination-main"><span className="budget-destination-name">{label}</span><strong className="budget-destination-total">—</strong></span>
          <span className="budget-destination-contribution-line"><span className="budget-not-calculated">Not calculated</span></span>
          {meta(account)}
        </button></li>
      })}</ul>
    </section>}
  </div>
}

function MobileTransferBreakdown({ account, instructionAccount, document }: {
  account: Transfers['accounts'][number]; instructionAccount?: TransferInstructionAccount; document: BudgetDocument
}) {
  const ready = instructionAccount?.status === 'ready'
  const personName = (personId: string | null) => document.household.adults.find(adult => adult.id === personId)?.name ?? 'Person'
  const subtotal = (pence: number) => <span className="budget-destination-subtotal">{account.incomplete && pence === 0 ? <span className="budget-not-calculated">Not calculated</span> : `${pounds(pence)} total`}</span>
  return <div className="budget-destination-breakdown">
    <h3>Allocation breakdown</h3><p className="transfer-calculation-note">These allocations are included in the account funding total.</p>
    <div className="budget-destination-allocations">
      {account.hasDirect && <section className="budget-destination-allocation" aria-label="Direct to account">
        <header><h4>Direct to account</h4>{subtotal(account.directAmountPence)}</header>
        <Contributions people={account.directByPerson} adults={document.household.adults}/>
      </section>}
      {account.pots.map(pot => {
        const name = document.budget.pots.find(row => row.id === pot.potId)?.name ?? 'Pot'
        // Stage 2 of the payday model: who moves money into the pot, which can differ from who funded the account.
        const movements = ready ? instructionAccount.potMovements.filter(step => step.destination.kind === 'pot' && step.destination.potId === pot.potId) : []
        return <section className="budget-destination-allocation" aria-label={name} key={pot.potId}>
          <header><h4>{name}</h4>{subtotal(pot.amountPence)}</header>
          {movements.length
            ? <dl className="budget-contributions">{movements.map((step, index) => <div key={step.personId ?? index}><dt>{personName(step.personId)} moves</dt><dd>{pounds(step.amountPence)}</dd></div>)}</dl>
            : <Contributions people={pot.byPerson} adults={document.household.adults}/>}
          {!ready && <PotMovementNote account={instructionAccount}/>}
        </section>
      })}
    </div>
  </div>
}

export function MobileTransferDetail({ account, instructionAccount, document: budgetDocument, month, owner, label, people, returnFocusRef, onClose, affectedAccount }: {
  account: Transfers['accounts'][number]
  instructionAccount?: TransferInstructionAccount
  document: BudgetDocument
  month: string
  owner: string
  label: string
  people: PersonAmount[]
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  affectedAccount?: { beforePence: number; afterPence: number }
}) {
  const ref = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const detail = ref.current!
    const focusTarget = returnFocusRef.current
    const body = document.body
    const scrollY = window.scrollY
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    body.classList.add('has-transfer-detail')
    const background: { element: Element; inert: boolean }[] = []
    for (let branch: Element = detail; branch.parentElement; branch = branch.parentElement) {
      background.push(...[...branch.parentElement.children].filter(element => element !== branch).map(element => ({ element, inert: element.hasAttribute('inert') })))
      if (branch.parentElement === document.body) break
    }
    background.forEach(({ element }) => element.setAttribute('inert', ''))
    const keepFocus = (event: FocusEvent) => { if (event.target instanceof Node && !detail.contains(event.target)) headingRef.current?.focus({ preventScroll: true }) }
    document.addEventListener('focusin', keepFocus)
    headingRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('focusin', keepFocus)
      background.forEach(({ element, inert }) => { if (!inert) element.removeAttribute('inert') })
      body.style.overflow = previous.overflow
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      body.classList.remove('has-transfer-detail')
      if (scrollY) window.scrollTo(0, scrollY)
      const target = focusTarget?.isConnected ? focusTarget : [...document.querySelectorAll<HTMLButtonElement>('[data-transfer-account]')].find(button => button.dataset.transferAccount === account.accountId)
      target?.focus({ preventScroll: true })
    }
  }, [account.accountId, returnFocusRef])
  return createPortal(<div className="budget-destination-detail-overlay"><section ref={ref} className="budget-destination-detail" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const first = controls[0], last = controls.at(-1)
    if (document.activeElement === headingRef.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}>
    <header className="budget-destination-detail-header"><button type="button" onClick={onClose}><ArrowLeft size={20} aria-hidden="true"/>Back to Transfers</button><h2 ref={headingRef} id={titleId} tabIndex={-1}>{label}</h2></header>
    <div className="budget-destination-detail-content"><p className="budget-destination-detail-context">{owner} · {month}</p>{affectedAccount && <p className="budget-affected-banner" role="status">Changed by recent edit: {pounds(affectedAccount.beforePence)} → {pounds(affectedAccount.afterPence)}</p>}<div className="budget-destination-detail-total"><span>Funding total</span><strong>{account.incomplete && account.amountPence === 0 ? <span className="budget-not-calculated">Not calculated</span> : pounds(account.amountPence)}</strong>{account.incomplete && <span className="budget-allocation-incomplete">Account instructions need review</span>}</div><Contributions people={people} adults={budgetDocument.household.adults}/>{!account.incomplete && <AccountFundingNote/>}<MobileTransferBreakdown account={account} instructionAccount={instructionAccount} document={budgetDocument}/></div>
  </section></div>, document.getElementById('root') ?? document.body)
}
