import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowLeft, Check, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { allSettleSteps, paymentMatchingPay, setSettleTick, settleStepDone, settleSteps, settleWithoutFinal, shareSteps, statementKeys, statementShares, statementSummary, type SettleAccount, type SettleStep, type StatementSummary } from '../domain/cardStatements'
import { setAsideStatements } from '../domain/potBalances'
import { potPhrase } from '../domain/setAside'
import { MoveToPotSheet } from './MoveToPotSheet'
import { cardTracker } from '../domain/cardTracker'
import { stepStatus } from '../domain/transferTicks'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { copyHintSeen, copyText, rememberCopyHint } from './copyHint'
import { dayOf, plural, pounds, signedPounds, statementName, statementStatus } from './spendingFormat'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  today: string
  statementKey: string | null
  onOpenStatement: (key: string | null) => void
  onSort: () => void
  onBringIn: () => void
  headingExtra?: ReactNode
  now?: () => Date
}

/** Statements: each one's total and state; open one for its detail and to settle up (board 5). */
export function StatementsPanel({ document, setDocument, today, statementKey, onOpenStatement, onSort, onBringIn, headingExtra, now = () => new Date() }: Props) {
  const tracker = cardTracker(document)
  if (statementKey && statementSummary(document, statementKey, today)) return <StatementDetail document={document} setDocument={setDocument} today={today} statementKey={statementKey} onBack={() => onOpenStatement(null)} onSort={onSort} onBringIn={onBringIn} now={now}/>
  const summaries = statementKeys(tracker).map(key => statementSummary(document, key, today)).filter((row): row is StatementSummary => !!row)
  return <>
    <div className="spending-section-heading"><h2 id="spending-statements-title">Statements</h2><span>{summaries.length ? plural(summaries.length, 'statement') : ''}</span>{headingExtra}</div>
    {!summaries.length ? <p className="spending-none">No statements yet. Bring in transactions to start.</p>
      : <ul className="spending-list statements-list">{summaries.map(summary => {
        const status = statementStatus(summary)
        return <li key={summary.key}><button type="button" className="statement-row" onClick={() => onOpenStatement(summary.key)}>
          <span className="spending-row-main"><span className="spending-row-title">{statementName(summary.closeDate)}</span><span className="spending-row-amount">{signedPounds(summary.totalPence)}</span></span>
          <span className="spending-row-meta"><span>{shortDate(summary.from)} – {shortDate(summary.closeDate)} · due {dayDate(summary.dueDate)}</span><span className={`statement-status is-${status.tone}`}>{status.text}</span></span>
          <ChevronRight className="spending-pot-chevron" aria-hidden="true"/>
        </button></li>
      })}</ul>}
  </>
}

function StatementDetail({ document, setDocument, today, statementKey, onBack, onSort, onBringIn, now }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; today: string; statementKey: string; onBack: () => void; onSort: () => void; onBringIn: () => void; now: () => Date }) {
  const [settling, setSettling] = useState(false)
  const [moving, setMoving] = useState(false)
  const summary = statementSummary(document, statementKey, today)!
  const plan = settleSteps(document, statementKey)
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === summary.cardId)!
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const name = destinationNamer(document)
  const shares = statementShares(tracker, statementKey)
  const matchingPayment = paymentMatchingPay(summary, plan)
  const title = statementName(summary.closeDate)
  const moveSheet = moving && <MoveToPotSheet document={document} setDocument={setDocument} cardId={card.id} statementKey={statementKey} onClose={() => setMoving(false)} onMoved={() => setMoving(false)} now={now}/>
  if (settling && plan) return <><SettleUp document={document} setDocument={setDocument} summary={summary} plan={plan} title={title} onBack={() => setSettling(false)} onMove={() => setMoving(true)} now={now}/>{moveSheet}</>
  // Paid from the Amex pot: shares are still shown by account, gathered where the pot is.
  const shareAccounts = plan?.setAside ? shareSteps(document, shares.values(), plan.payFromAccountId) : plan?.accounts ?? []
  const setAsidePot = plan?.setAside && document.budget.pots.find(pot => pot.id === plan.setAside!.potId)
  const inPot = plan?.setAside && setAsideStatements(document, card.id).find(row => row.statementKey === statementKey)
  const potShares = (account: SettleAccount) => [...shares.values()].filter(row => row.destination.kind === 'pot' && document.budget.pots.find(pot => pot.id === (row.destination as { potId: string }).potId)?.accountId === account.accountId && row.pence !== 0)
  const summaryText = summary.summaryCheck ? summary.summaryCheck.matches ? 'Matches Amex’s summary' : [summary.summaryCheck.missingChargesPence ? `${pounds(Math.abs(summary.summaryCheck.missingChargesPence))} of charges ${summary.summaryCheck.missingChargesPence > 0 ? 'in Amex’s summary aren’t here' : 'here aren’t in Amex’s summary'}` : '', summary.summaryCheck.missingCreditsPence ? `${pounds(Math.abs(summary.summaryCheck.missingCreditsPence))} of payments and credits ${summary.summaryCheck.missingCreditsPence < 0 ? 'in Amex’s summary aren’t here' : 'here aren’t in Amex’s summary'}` : ''].filter(Boolean).join(', and ') : 'No summary from Amex yet'

  return <div className="statement-detail">
    <button type="button" className="text-button spending-back" onClick={onBack}><ArrowLeft aria-hidden="true"/>All statements</button>
    <div className="statement-heading"><h2 id="spending-statement-title">{title}</h2><p className="spending-facts">{shortDate(summary.from)} – {shortDate(summary.closeDate)} · due {dayDate(summary.dueDate)}</p></div>
    <section className="spending-month-summary" aria-labelledby="statement-total">
      <p className="spending-eyebrow" id="statement-total">{summary.settled ? `Paid to ${card.name}` : `To pay ${card.name}`}</p>
      <p className="spending-big">{signedPounds(summary.totalPence)}</p>
      <ul className="statement-checks">
        <li className={summary.toSort ? 'is-todo' : 'is-ok'}>{summary.toSort ? <TriangleAlert aria-hidden="true"/> : <Check aria-hidden="true"/>}<span>{summary.toSort ? `${summary.toSort} to sort` : `All ${plural(summary.transactions, 'transaction')} sorted`}</span>{summary.toSort > 0 && <button type="button" className="text-button" onClick={onSort}>Sort them</button>}</li>
        <li className={summary.summaryCheck?.matches ? 'is-ok' : summary.summaryCheck ? 'is-todo' : ''}>{summary.summaryCheck?.matches ? <Check aria-hidden="true"/> : <TriangleAlert aria-hidden="true"/>}<span>{summaryText}</span></li>
        {!summary.open && !summary.complete && <li className="is-todo"><TriangleAlert aria-hidden="true"/><span>Bring in the final export for this statement, so North can check it’s all here.</span>
          <button type="button" className="text-button" onClick={onBringIn}>Bring it in</button><button type="button" className="text-button" onClick={() => setDocument(current => settleWithoutFinal(current, statementKey, now()))}>Settle without the final export</button></li>}
        {setAsidePot && inPot && <li className={plan!.setAside!.toMove ? 'is-todo' : 'is-ok'}>{plan!.setAside!.toMove ? <TriangleAlert aria-hidden="true"/> : <Check aria-hidden="true"/>}<span>{signedPounds(inPot.movedPence)} of {signedPounds(inPot.totalPence)} is in {potPhrase(setAsidePot.name)}{plan!.setAside!.toMove ? ` · ${signedPounds(plan!.setAside!.toMovePence)} sorted and still to move` : ''}</span>
          {plan!.setAside!.toMove > 0 && <button type="button" className="text-button" onClick={() => setMoving(true)}>Move it</button>}</li>}
        {summary.payments.map(payment => <li key={payment.id}><span>{card.name} shows a payment of {pounds(-payment.amountPence)} on {shortDate(payment.date)}</span>
          {payment === matchingPayment && plan && <button type="button" className="text-button" onClick={() => setDocument(current => setSettleTick(current, statementKey, plan.pay.key, plan.pay.amountPence, now()))}>Tick Pay {card.name}</button>}</li>)}
      </ul>
    </section>
    {summary.byMonth.length > 0 && <section aria-labelledby="statement-months">
      <h3 id="statement-months" className="spending-group-heading">Which months it counts in</h3>
      <dl className="carry-over-sums statement-months">{summary.byMonth.map(row => <div key={row.month}><dt>Counts in {monthName(row.month)}</dt><dd>{signedPounds(row.pence)}</dd></div>)}</dl>
    </section>}
    {shareAccounts.length > 0 && <section aria-labelledby="statement-shares">
      <h3 id="statement-shares" className="spending-group-heading">Shares</h3>
      <div className="spending-month-groups">{shareAccounts.map(account => <section key={account.accountId} className="spending-month-group" aria-label={labels.get(account.accountId)}>
        <p className="statement-share-head"><span>{labels.get(account.accountId)} · {owners(document, account.ownerPersonIds)}</span><b>{signedPounds(account.sharePence)}</b></p>
        <ul className="statement-share-list">
          {potShares(account).map(row => <li key={name(row.destination)}><span>{name(row.destination)}</span><span>{signedPounds(row.pence)}</span></li>)}
          {account.oneOffsPence !== 0 && <li><span>One-offs, already in {labels.get(account.accountId)}</span><span>{signedPounds(account.oneOffsPence)}</span></li>}
        </ul>
      </section>)}</div>
    </section>}
    <div className="statement-settle">
      {summary.ready || summary.settled || summary.done ? <button type="button" className="primary-button" onClick={() => setSettling(true)}>{summary.settled ? 'See the settle-up steps' : 'Settle up'}</button>
        : summary.open ? <p className="spending-facts">You can settle up once it closes on {dayDate(summary.closeDate)}.</p>
        : summary.toSort ? <button type="button" className="primary-button" onClick={onSort}>Sort {summary.toSort} first</button>
        : null}
    </div>
    {moveSheet}
  </div>
}

/** "Either of you" for a joint account, else the owner's name. */
function owners(document: BudgetDocument, ownerPersonIds: readonly string[]) {
  if (ownerPersonIds.length > 1) return 'Either of you'
  return document.household.adults.find(person => person.id === ownerPersonIds[0])?.name ?? 'Needs an owner'
}

/** Settle up, ticked like Transfers: steps per account, tap an amount to copy it, then pay the card (board 5, screen 3). */
function SettleUp({ document, setDocument, summary, plan, title, onBack, onMove, now }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; summary: StatementSummary; plan: NonNullable<ReturnType<typeof settleSteps>>; title: string; onBack: () => void; onMove: () => void; now: () => Date }) {
  const card = cardTracker(document).cards.find(row => row.id === summary.cardId)!
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const potName = (potId?: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
  const ticks = summary.record?.ticks
  const steps = allSettleSteps(plan)
  const done = steps.filter(step => settleStepDone(plan, ticks, step)).length
  const setAsidePot = plan.setAside && document.budget.pots.find(pot => pot.id === plan.setAside!.potId)
  const [copied, setCopied] = useState('')
  const [hintSeen, setHintSeen] = useState(copyHintSeen)
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clear.current), [])
  const copy = async (pence: number) => {
    let message = `Copied ${pounds(pence)}`
    try { await navigator.clipboard.writeText(copyText(pence)) } catch { message = 'Couldn’t copy' }
    setCopied(message)
    if (!hintSeen) { rememberCopyHint(); setHintSeen(true) }
    clearTimeout(clear.current)
    clear.current = setTimeout(() => setCopied(''), 2500)
  }
  const stepLabel = (step: SettleStep) => step.kind === 'out' ? `Out of ${potName(step.potId)}` : step.kind === 'into' ? `Into ${potName(step.potId)}`
    : step.kind === 'send' ? `Send to ${label(plan.payFromAccountId)}` : step.kind === 'return' ? `Send to ${label(plan.accounts.find(account => account.steps.includes(step))?.accountId ?? '')} from ${label(plan.payFromAccountId)}`
    : `Pay ${card.name} from ${setAsidePot ? potPhrase(setAsidePot.name) : label(plan.payFromAccountId)}`
  const row = (step: SettleStep, caption?: string) => {
    const status = stepStatus(ticks, step.key, step.amountPence)
    const shown = status.state === 'changed' ? Math.abs(status.differencePence) : step.amountPence
    const text = stepLabel(step)
    return <li key={step.key} className={`payday-step is-${status.state}${step.kind === 'out' || step.kind === 'into' ? ' is-pot-move' : ''}`}>
      <button type="button" className={`payday-tick is-${status.state}`} aria-pressed={status.state === 'done'} aria-label={status.state === 'changed' ? `${text}: mark the change done` : `${text} done`} onClick={() => setDocument(current => setSettleTick(current, summary.key, step.key, status.state === 'done' ? null : step.amountPence, now()))}>
        <span className="payday-tick-dot" aria-hidden="true">{status.state === 'done' && <Check/>}{status.state === 'changed' && <RefreshCw/>}</span>
      </button>
      <div className="payday-step-body">
        <p className="payday-step-main"><span className="payday-step-label">{text}</span><button type="button" className="payday-step-amount" aria-label={`Copy ${pounds(shown)}`} onClick={() => void copy(shown)}>{status.state === 'changed' ? `${status.differencePence > 0 ? '+' : '−'}${pounds(shown)}` : pounds(shown)}</button></p>
        {status.state === 'changed' && <p className="payday-step-changed">Changed since ticked: it was {pounds(status.tickedPence!)}, it’s now {pounds(step.amountPence)}. {status.differencePence > 0 ? `Move ${pounds(status.differencePence)} more.` : `${pounds(-status.differencePence)} less is needed.`}</p>}
        {status.state === 'done' && ticks?.[step.key] && <p className="payday-step-caption">Ticked {dayOf(ticks[step.key]!.at)}</p>}
        {caption && <p className="payday-step-caption">{caption}</p>}
      </div>
    </li>
  }
  const payFrom = plan.accounts.find(account => account.accountId === plan.payFromAccountId)
  return <div className="statement-detail">
    <button type="button" className="text-button spending-back" onClick={onBack}><ArrowLeft aria-hidden="true"/>Back to the {title}</button>
    <section className="spending-month-summary" aria-labelledby="settle-title">
      <h2 className="spending-eyebrow" id="settle-title">Settle up · {title}</h2>
      <p className="spending-big">{pounds(plan.totalPence)} <small>to {card.name} by {dayDate(summary.dueDate)}</small></p>
      <p className="settle-progress"><span>{done} of {steps.length} done</span></p>
      <span className="transfer-progress-track" aria-hidden="true"><span style={{ width: `${steps.length ? done / steps.length * 100 : 0}%` }}/></span>
    </section>
    {steps.length > 0 && done === steps.length && <div className="transfer-done-banner" role="status"><span className="transfer-done-icon" aria-hidden="true"><Check/></span><span><strong>The {title} is settled</strong><span>Every step is ticked. A late change will show here as a top-up.</span></span></div>}
    <div className="payday settle-up" role="region" aria-label="Settle-up steps">
      <p className="payday-copied" role="status">{copied}</p>
      {!hintSeen && done < steps.length && <p className="payday-copy-hint">Tap an amount to copy it for your banking app.</p>}
      {plan.setAside && setAsidePot && <section className="payday-person settle-account" aria-label={`Move to ${potPhrase(setAsidePot.name)}`}>
        <h3 className="payday-person-heading"><span>Into {potPhrase(setAsidePot.name)}</span><span>{owners(document, document.budget.accounts.find(account => account.id === plan.payFromAccountId)?.ownerPersonIds ?? [])}</span></h3>
        <ol className="payday-steps"><li className={`payday-step is-${plan.setAside.toMove ? 'todo' : 'done'}`}>
          <span className={`payday-tick is-${plan.setAside.toMove ? 'todo' : 'done'}`} aria-hidden="true"><span className="payday-tick-dot">{!plan.setAside.toMove && <Check/>}</span></span>
          <div className="payday-step-body">
            <p className="payday-step-main"><span className="payday-step-label">{plan.setAside.toMove ? `Move the rest to ${potPhrase(setAsidePot.name)}` : `Everything is in ${potPhrase(setAsidePot.name)}`}</span>{plan.setAside.toMove > 0 && <span className="payday-step-amount">{signedPounds(plan.setAside.toMovePence)}</span>}</p>
            {plan.setAside.toMove > 0 && <p className="payday-step-caption">{plural(plan.setAside.toMove, 'transaction')} not moved yet. <button type="button" className="text-button" onClick={onMove}>Move them</button></p>}
          </div>
        </li></ol>
      </section>}
      {plan.accounts.filter(account => account.steps.length).map(account => <section key={account.accountId} className="payday-person settle-account" aria-label={`${label(account.accountId)} steps`}>
        <h3 className="payday-person-heading"><span>{label(account.accountId)}</span><span>{owners(document, account.ownerPersonIds)}</span></h3>
        <ol className="payday-steps">{account.steps.map(step => row(step))}</ol>
      </section>)}
      {plan.totalPence > 0 && <section className="payday-person settle-account" aria-label={`Pay ${card.name}`}>
        <h3 className="payday-person-heading"><span>{label(plan.payFromAccountId)}</span><span>{owners(document, payFrom?.ownerPersonIds ?? document.budget.accounts.find(account => account.id === plan.payFromAccountId)?.ownerPersonIds ?? [])}</span></h3>
        <ol className="payday-steps">{row(plan.pay, payFrom?.oneOffsPence ? `Includes ${pounds(payFrom.oneOffsPence)} of one-offs already in ${label(plan.payFromAccountId)}` : undefined)}</ol>
      </section>}
    </div>
  </div>
}
