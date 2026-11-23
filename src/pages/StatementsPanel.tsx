import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Clock, FileUp, Inbox, PiggyBank } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { allSettleSteps, paymentMatchingPay, setSettleTick, settleStepDone, settleSteps, settleWithoutFinal, shareSteps, statementKeys, statementShares, statementSummary, type SettleAccount, type SettleStep, type StatementSummary } from '../domain/cardStatements'
import { billSum } from '../domain/billSum'
import { potPhrase } from '../domain/setAside'
import { billCover } from '../domain/setAsideCheck'
import { capitalise } from '../formatting/paceLabels'
import { MoveToPotSheet } from './MoveToPotSheet'
import { bufferSource, cardTracker, destinationKey, parseDestinationValue, sameDestination, type CardAccount } from '../domain/cardTracker'
import { statementWaitingGroups, type WaitingGroup } from '../domain/cardSorting'
import { frontOf, frontPence, frontPlan, frontSourceFor, setFrontSource } from '../domain/fronts'
import { startGoThrough, type GoThrough } from '../domain/goThrough'
import { bufferBalance } from '../domain/buffer'
import { potBalance } from '../domain/potBalances'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { GoThroughSheet } from './GoThroughSheet'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { dayDate, destinationGroups, destinationNamer, frontSourceName, shortDate, shortName } from './cardLabels'
import { Breadcrumb, EmptyState, ListRow, Meter, Section, StatusChip } from '../components/ui'
import { useListNavigation } from '../state/useListNavigation'
import { StepCaption, StepGroup, StepRow } from '../components/ui/StepRow'
import { useStepCopy } from '../components/ui/useStepCopy'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { dayOf, plural, pounds, signedPounds, statementName, statementStatus, waitingReason } from './spendingFormat'
import './StatementsPanel.css'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
/** A statement's state as a chip: waiting on something is a warning; open, in progress and settled are neutral. */
const chipTone = (summary: StatementSummary) => { const { tone } = statementStatus(summary); return tone === 'todo' || tone === 'ready' && !summary.done ? 'warning' as const : 'neutral' as const }

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  today: string
  statementKey: string | null
  onOpenStatement: (key: string | null) => void
  onSort: () => void
  onBringIn: () => void
  now?: () => Date
}

/** Statements: each one's total and state, newest first; a statement's page leads with settling it up (board 5). */
export function StatementsPanel({ document, setDocument, today, statementKey, onOpenStatement, onSort, onBringIn, now = () => new Date() }: Props) {
  const tracker = cardTracker(document)
  // Back from a statement lands on its row.
  const opened = useRef<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const statementKeysNav = useListNavigation({ label: 'Statements', keys: { enter: 'Open the statement' } })
  useEffect(() => {
    if (statementKey) { opened.current = statementKey; return }
    if (!opened.current) return
    list.current?.querySelector<HTMLElement>(`[data-statement="${CSS.escape(opened.current)}"] button`)?.focus()
    opened.current = null
  }, [statementKey])
  if (statementKey && statementSummary(document, statementKey, today)) return <StatementDetail document={document} setDocument={setDocument} today={today} statementKey={statementKey} onBack={() => onOpenStatement(null)} onSort={onSort} onBringIn={onBringIn} now={now}/>
  const summaries = statementKeys(tracker).map(key => statementSummary(document, key, today)).filter((row): row is StatementSummary => !!row)
  return <Section title="Statements" count={summaries.length || undefined}>
    {!summaries.length ? <EmptyState title="No statements yet" action={<button type="button" className="secondary-button" onClick={onBringIn}>Bring in</button>}>Bring in transactions and each statement shows here.</EmptyState>
      : <div {...statementKeysNav.listProps}>{statementKeysNav.hint}<ul ref={list} className="statements-list" aria-label="Statements">{summaries.map(summary => <li key={summary.key} data-statement={summary.key}>
        <ListRow listRow title={statementName(summary.closeDate)} meta={`${shortDate(summary.from)} – ${shortDate(summary.closeDate)} · due ${dayDate(summary.dueDate)}`}
          trailing={signedPounds(summary.totalPence)} trailingMeta={<StatusChip tone={chipTone(summary)}>{statementStatus(summary).text}</StatusChip>} onOpen={() => onOpenStatement(summary.key)}/>
      </li>)}</ul></div>}
  </Section>
}

/**
 * A statement's page: the amount and due date with its checks, then either what it's waiting for or the Settle up
 * steps themselves (ticked like payday), with the months and shares folded underneath.
 */
function StatementDetail({ document, setDocument, today, statementKey, onBack, onSort, onBringIn, now }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; today: string; statementKey: string; onBack: () => void; onSort: () => void; onBringIn: () => void; now: () => Date }) {
  const [moving, setMoving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [going, setGoing] = useState<GoThrough | null>(null)
  const [message, setMessage] = useState('')
  const summary = statementSummary(document, statementKey, today)!
  const plan = settleSteps(document, statementKey)
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === summary.cardId)!
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const name = destinationNamer(document)
  const shares = statementShares(tracker, statementKey)
  const matchingPayment = paymentMatchingPay(summary, plan)
  const title = statementName(summary.closeDate)
  const status = statementStatus(summary)
  // Paid from the Amex pot: shares are still shown by account, gathered where the pot is.
  const shareAccounts = plan?.setAside ? shareSteps(document, shares.values(), plan.payFromAccountId) : plan?.accounts ?? []
  const setAsidePot = plan?.setAside && document.budget.pots.find(pot => pot.id === plan.setAside!.potId)
  // Paid from the Amex pot: the bill's sum (D1), In the Amex pot + To move + To sort.
  const inPot = plan?.setAside ? billSum(document, statementKey, today) : null
  const potShares = (account: SettleAccount) => [...shares.values()].filter(row => row.destination.kind === 'pot' && document.budget.pots.find(pot => pot.id === (row.destination as { potId: string }).potId)?.accountId === account.accountId && row.pence !== 0)
  const check = summary.summaryCheck
  const summaryChip = !check ? <StatusChip>No summary from {card.name} yet</StatusChip> : check.matches ? <StatusChip tone="positive">✓ Matches {card.name}’s summary</StatusChip>
    : <StatusChip tone="warning">{[check.missingChargesPence ? `${pounds(Math.abs(check.missingChargesPence))} of charges ${check.missingChargesPence > 0 ? 'missing' : 'extra'}` : '', check.missingCreditsPence ? `${pounds(Math.abs(check.missingCreditsPence))} of credits ${check.missingCreditsPence < 0 ? 'missing' : 'extra'}` : ''].filter(Boolean).join(' · ')}</StatusChip>
  const steps = plan ? allSettleSteps(plan) : []
  const done = plan ? steps.filter(step => settleStepDone(plan, summary.record?.ticks, step)).length : 0
  const canSettle = !!plan && (summary.ready || summary.settled || summary.done > 0)
  const finalExportMissing = !summary.open && !summary.complete
  const settleWithout = () => setDocument(current => settleWithoutFinal(current, statementKey, now()))
  const payment = summary.payments.map(row => ({ row, matches: row === matchingPayment }))
  const waitingGroups = statementWaitingGroups(document, statementKey)
  const paid = !!plan && settleStepDone(plan, summary.record?.ticks, plan.pay)
  const front = frontOf(tracker, statementKey)

  return <div className="statement-detail">
    <Breadcrumb items={[{ label: 'Statements', onClick: onBack }, { label: title }]}/>
    <div className="statement-head">
      <div className="statement-head-title"><h2 id="spending-statement-title">{title}</h2><StatusChip tone={chipTone(summary)}>{status.text}</StatusChip></div>
      <p className="statement-head-context">{shortDate(summary.from)} – {shortDate(summary.closeDate)} · due {dayDate(summary.dueDate)}</p>
      {finalExportMissing && <BudgetOptionsMenu label={`More ${title} options`} options={[{ label: 'Bring in the final export', onSelect: onBringIn }, { label: 'Settle without the final export', onSelect: settleWithout }]}/>}
    </div>
    <section className="statement-summary" aria-labelledby="statement-total">
      <div className="statement-summary-total"><p id="statement-total">{summary.settled ? `Paid to ${card.name}` : `To ${card.name} by ${dayDate(summary.dueDate)}`}</p><p className="statement-summary-amount">{signedPounds(summary.totalPence)}</p></div>
      <div className="statement-summary-checks">
        {summary.toSort ? <StatusChip tone="warning">{summary.toSort} to sort</StatusChip> : !summary.waiting && <StatusChip tone="positive">✓ All {summary.transactions} sorted</StatusChip>}
        {summary.waiting > 0 && <StatusChip tone="warning">{summary.waiting} waiting</StatusChip>}
        {summaryChip}
        {!summary.open && (summary.complete ? <StatusChip tone="positive">✓ Final export in</StatusChip> : <StatusChip tone="warning">Final export missing</StatusChip>)}
      </div>
      {canSettle && steps.length > 0 && <div className="statement-summary-progress"><p>{done} of {steps.length} done</p><Meter label={`Settle up: ${done} of ${steps.length} steps ticked`} value={done} max={steps.length}/></div>}
      {front && paid ? <dl className="statement-summary-parts">
        <div><dt>From {potPhrase(setAsidePot ? setAsidePot.name : 'Amex')}</dt><dd>{signedPounds(summary.totalPence - frontPence(front))}</dd></div>
        <div><dt>From {frontSourceName(document, card, front.source)} for {front.transactions.length} waiting</dt><dd>{signedPounds(frontPence(front))}</dd></div>
      </dl> : inPot && inPot.waiting > 0 && <dl className="statement-summary-parts">
        <div><dt>In {potPhrase(setAsidePot ? setAsidePot.name : 'Amex')}</dt><dd>{signedPounds(inPot.inPotPence)}</dd></div>
        <div className="is-waiting"><dt>Waiting · {inPot.waiting}</dt><dd>{signedPounds(inPot.waitingPence)}</dd></div>
      </dl>}
    </section>
    {!canSettle ? <Section title="Before you can settle up">
      <ul className="statement-waiting" aria-label="Before you can settle up">
        {summary.toSort > 0 && <li><ListRow icon={<Inbox/>} tone="warning" title={`${plural(summary.toSort, 'transaction')} to sort`} trailing={<button type="button" className="text-button" onClick={onSort}>Sort them</button>}/></li>}
        {summary.open && <li><ListRow icon={<Clock/>} title={`Closes ${dayDate(summary.closeDate)}`} meta="You can settle up once it closes."/></li>}
        {finalExportMissing && <li><ListRow icon={<FileUp/>} tone="warning" title="Bring in the final export" meta={`So North can check it’s all here. ${card.name} can export past periods.`}
          trailing={<span className="statement-actions"><button type="button" className="text-button" onClick={onBringIn}>Bring it in</button><button type="button" className="text-button" onClick={settleWithout}>Settle without it</button></span>}/></li>}
        {setAsidePot && inPot && <li><ListRow icon={<PiggyBank/>} tone={plan!.setAside!.toMove ? 'warning' : 'done'} title={`${signedPounds(inPot.inPotPence)} of ${signedPounds(inPot.billPence)} is in ${potPhrase(setAsidePot.name)}`}
          meta={inPot.toMove || inPot.toSort || inPot.waiting || inPot.expectingBackPence ? [inPot.toMove ? `${signedPounds(inPot.toMovePence)} to move` : '', inPot.toSort ? `${signedPounds(inPot.toSortPence)} to sort` : '', inPot.waiting ? `${signedPounds(inPot.waitingPence)} waiting` : '', inPot.expectingBackPence ? `${signedPounds(inPot.expectingBackPence)} expecting back` : ''].filter(Boolean).join(' · ') : 'All moved in'} trailing={plan!.setAside!.toMove > 0 ? <button type="button" className="text-button" onClick={onSort}>Set aside</button> : undefined}/></li>}
        {payment.map(({ row }) => <li key={row.id}><ListRow title={`${card.name} shows a payment of ${pounds(-row.amountPence)} on ${shortDate(row.date)}`}/></li>)}
      </ul>
    </Section>
      : plan && steps.length > 0 && done === steps.length && !expanded ? <Section title="Settle up" collapsed={{ summary: `${done} of ${steps.length} done`, onExpand: () => setExpanded(true) }}/>
      : plan && <SettleSteps document={document} setDocument={setDocument} summary={summary} plan={plan} done={done} total={steps.length} payment={payment.find(row => row.matches)?.row} onMove={() => setMoving(true)} now={now} today={today}/>}
    {waitingGroups.length > 0 && <WaitingOnBill document={document} groups={waitingGroups} message={message}
      note={!plan?.setAside ? `The ${title} settles once, so sort them before you settle up.`
        : paid ? (front ? `Once they’re sorted, their pots pay ${frontSourceName(document, card, front.source)} back.` : undefined)
        : `Sort them before you pay, and they go into ${setAsidePot ? potPhrase(setAsidePot.name) : 'the pot'} as usual: ${frontSourceName(document, card, frontSourceFor(document, statementKey) ?? bufferSource(card))} covers less.`}
      onGoThrough={group => { setMessage(''); setGoing(startGoThrough(group)) }}/>}
    {going && <GoThroughSheet document={document} setDocument={setDocument} start={going} today={today} onStep={setMessage}
      returnFocusTo={() => window.document.querySelector<HTMLElement>('.statement-waiting-bill .waiting-go') ?? window.document.getElementById('spending-statement-title')}
      onEnd={text => { setGoing(null); setMessage(text) }}/>}
    {(summary.byMonth.length > 0 || shareAccounts.length > 0) && <div className="statement-breakdown">
      {summary.byMonth.length > 0 && <details>
        <summary><span>Which months it counts in</span><span className="statement-breakdown-summary">{summary.byMonth.map(row => `${monthName(row.month)} ${signedPounds(row.pence)}`).join(' · ')}</span></summary>
        <dl className="carry-over-sums statement-months">{summary.byMonth.map(row => <div key={row.month}><dt>Counts in {monthName(row.month)}</dt><dd>{signedPounds(row.pence)}</dd></div>)}</dl>
      </details>}
      {shareAccounts.length > 0 && <details>
        <summary><span>Shares by account</span><span className="statement-breakdown-summary">{shareAccounts.map(account => `${labels.get(account.accountId)} ${signedPounds(account.sharePence)}`).join(' · ')}</span></summary>
        <div className="statement-shares">{shareAccounts.map(account => <section key={account.accountId} className="statement-share" aria-label={labels.get(account.accountId)}>
          <p className="statement-share-head"><span>{labels.get(account.accountId)} · {owners(document, account.ownerPersonIds)}</span><b>{signedPounds(account.sharePence)}</b></p>
          <ul className="statement-share-list">
            {potShares(account).map(row => <li key={name(row.destination)}><span>{name(row.destination)}</span><span>{signedPounds(row.pence)}</span></li>)}
            {account.oneOffsPence !== 0 && <li><span>One-offs, already in {labels.get(account.accountId)}</span><span>{signedPounds(account.oneOffsPence)}</span></li>}
          </ul>
        </section>)}</div>
      </details>}
    </div>}
    {moving && <MoveToPotSheet document={document} setDocument={setDocument} cardId={card.id} statementKey={statementKey} onClose={() => setMoving(false)} onMoved={() => setMoving(false)} now={now}/>}
  </div>
}

/** "Either of you" for a joint account, else the owner's name. */
function owners(document: BudgetDocument, ownerPersonIds: readonly string[]) {
  if (ownerPersonIds.length > 1) return 'Either of you'
  return document.household.adults.find(person => person.id === ownerPersonIds[0])?.name ?? 'Needs an owner'
}

/** Waiting on this bill (audit 6, PR 7): the statement's waiting rows by reason, each with Go through them. */
function WaitingOnBill({ document, groups, note, message, onGoThrough }: { document: BudgetDocument; groups: WaitingGroup[]; note?: string; message: string; onGoThrough: (group: WaitingGroup) => void }) {
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0), total = groups.reduce((sum, group) => sum + group.totalPence, 0)
  return <div className="statement-waiting-bill"><Section title="Waiting on this bill" count={`${count} · ${signedPounds(total)}`}>
    <ul className="statement-waiting" aria-label="Waiting on this bill">{groups.map(group => <li key={group.key}>
      <ListRow title={`${waitingReason(document, group.on)} · ${group.rows.length}`} trailing={<span className="statement-waiting-go"><b>{signedPounds(group.totalPence)}</b>
        <button type="button" className="secondary-button waiting-go" aria-label={`Go through them: ${waitingReason(document, group.on)}`} onClick={() => onGoThrough(group)}><span className="go-long">Go through them</span><span className="go-short" aria-hidden="true">Go through</span></button></span>}/>
    </li>)}</ul>
    {note && <p className="statement-waiting-note">{note}</p>}
    <p className="statement-waiting-status" role="status">{message}</p>
  </Section></div>
}

/**
 * Settle up with rows waiting (audit 6, W3, W11), under the Pay step: what comes from the Amex pot and what the buffer
 * covers, "Cover the waiting from", and whether the Amex pot covers its part. Once paid: what was covered, and from where.
 */
function FrontCaption({ document, setDocument, statementKey, card, billPence, paid, coverLine, today }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; statementKey: string; card: CardAccount; billPence: number; paid: boolean; coverLine: ReactNode; today: string }) {
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const pot = document.budget.pots.find(row => row.id === card.setAside?.potId)
  const phrase = pot ? potPhrase(pot.name) : 'the pot'
  const front = frontOf(tracker, statementKey)
  if (paid) return front ? <div className="settle-front is-paid"><p>{pounds(billPence - frontPence(front))} from {phrase} + <strong>{pounds(frontPence(front))} from {frontSourceName(document, card, front.source)}</strong> for {front.transactions.length} waiting.</p></div> : null
  const plan = frontPlan(document, statementKey)
  if (!plan) return <>{coverLine}</>
  const buffer = bufferSource(card)
  const balance = bufferBalance(document, today)
  const payFrom = pot?.accountId ?? card.payFromAccountId
  const bufferLabel = `${name(buffer)} (the buffer)${balance?.balancePence !== undefined && sameDestination(balance.destination, buffer) ? ` · ${pounds(balance.balancePence)}, checked ${dayOf(balance.checked!.at)}` : ''}`
  const optionLabel = (destination: BudgetDestination) => {
    if (destination.kind !== 'pot') return name(destination)
    const held = potBalance(document, destination.potId, today).balancePence
    return `${name(destination)}${held !== undefined ? ` · ${pounds(held)}` : ''}`
  }
  const groups = destinationGroups(document).map(group => ({ ...group, options: group.options.filter(option => !sameDestination(option.destination, buffer) && !(option.destination.kind === 'pot' && option.destination.potId === card.setAside?.potId)) })).filter(group => group.options.length)
  const sourceName = frontSourceName(document, card, plan.source)
  const elsewhere = !(plan.source.kind === 'account' && plan.source.accountId === payFrom)
  return <div className="settle-front">
    <p>{pounds(billPence - plan.pence)} from {phrase} + <strong>{pounds(plan.pence)} from {sourceName}</strong> for {plan.rows.length} waiting.</p>
    <label className="settle-front-source">Cover the waiting from
      <select value={destinationKey(plan.source)} onChange={event => { const source = parseDestinationValue(event.target.value); if (source) setDocument(current => setFrontSource(current, statementKey, source)) }}>
        <option value={destinationKey(buffer)}>{bufferLabel}</option>
        {groups.map(group => <optgroup key={group.key} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{optionLabel(option.destination)}</option>)}</optgroup>)}
      </select>
    </label>
    {elsewhere && <p className="settle-front-move">Move {pounds(plan.pence)} from {shortName(document, plan.source)} to {labels.get(payFrom) ?? 'the account'} before you pay.</p>}
    <p className="settle-front-note">North keeps track. Once they’re sorted, their pots pay {sourceName} back.</p>
    {coverLine}
  </div>
}

/** The Settle up steps, inline on the statement: one column per account, ticked like payday, then pay the card. */
function SettleSteps({ document, setDocument, summary, plan, done, total, payment, onMove, now, today }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; summary: StatementSummary; plan: NonNullable<ReturnType<typeof settleSteps>>; done: number; total: number; payment?: StatementSummary['payments'][number]; onMove: () => void; now: () => Date; today: string }) {
  const card = cardTracker(document).cards.find(row => row.id === summary.cardId)!
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const potName = (potId?: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
  const ticks = summary.record?.ticks
  const stepKeys = useListNavigation({ label: 'Settle-up steps', keys: { x: 'Tick or untick', c: 'Copy the amount' } })
  const setAsidePot = plan.setAside && document.budget.pots.find(pot => pot.id === plan.setAside!.potId)
  const { copy, status: copiedStatus } = useStepCopy()
  const stepLabel = (step: SettleStep) => step.kind === 'out' ? `Out of ${potName(step.potId)}` : step.kind === 'into' ? `Into ${potName(step.potId)}`
    : step.kind === 'send' ? `Send to ${label(plan.payFromAccountId)}` : step.kind === 'return' ? `Send to ${label(plan.accounts.find(account => account.steps.includes(step))?.accountId ?? '')} from ${label(plan.payFromAccountId)}`
    : `Pay ${card.name} from ${label(plan.payFromAccountId)}`
  const tick = (key: string, amountPence: number | null) => setDocument(current => setSettleTick(current, summary.key, key, amountPence, now()))
  const moveNote = (amountPence: number) => (tickedPence: number, differencePence: number) => <>Changed since ticked: it was {pounds(tickedPence)}, it’s now {pounds(amountPence)}. {differencePence > 0 ? `Move ${pounds(differencePence)} more.` : `${pounds(-differencePence)} less is needed.`}</>
  const row = (step: SettleStep, caption?: string) => <StepRow key={step.key} stepKey={step.key} name={stepLabel(step)} amountPence={step.amountPence} ticks={ticks} onTick={tick} onCopy={pence => void copy(pence)}
    indent={step.kind === 'out' || step.kind === 'into'} emphasis={step === plan.pay ? 'pay' : undefined} showTickedDay changedNote={moveNote(step.amountPence)} caption={caption}>
    {step === plan.pay && payment && <StepCaption>{card.name} shows a payment of {pounds(-payment.amountPence)} on {shortDate(payment.date)}. {settleStepDone(plan, ticks, step) ? '' : <button type="button" className="text-button" onClick={() => tick(plan.pay.key, plan.pay.amountPence)}>Tick Pay {card.name}</button>}</StepCaption>}
    {step === plan.pay && (plan.setAside ? <FrontCaption document={document} setDocument={setDocument} statementKey={summary.key} card={card} billPence={plan.pay.amountPence} paid={settleStepDone(plan, ticks, plan.pay)} coverLine={coverLine} today={today}/> : coverLine)}
  </StepRow>
  const payFrom = plan.accounts.find(account => account.accountId === plan.payFromAccountId)
  // Paid from the Amex pot, once everything is moved and before Pay: does the pot cover the bill? (Checking the Amex pot.)
  let coverLine: ReactNode = null
  if (plan.setAside && setAsidePot && !plan.setAside.toMove && !settleStepDone(plan, ticks, plan.pay)) {
    const cover = billCover(document, summary.key, today)
    const phrase = potPhrase(setAsidePot.name)
    const bank = document.budget.accounts.find(account => account.id === setAsidePot.accountId)?.provider?.trim() || 'the bank'
    coverLine = !cover ? <p className="step-caption settle-cover">Check {phrase} against {bank} to see if it covers the bill.</p>
      : cover.waitingPence ? (cover.coverPence >= 0 ? <p className="step-caption settle-cover is-covered">{capitalise(phrase)} covers its part{cover.coverPence ? ` · ${pounds(cover.coverPence)} to spare` : ' exactly'}.</p>
        : <p className="step-caption settle-cover is-short">{pounds(-cover.coverPence)} short of its part: top up {phrase} before you pay.</p>)
      : cover.coverPence >= 0 ? <p className="step-caption settle-cover is-covered">{capitalise(phrase)} covers the {pounds(cover.billPence)} bill{cover.coverPence ? ` · ${pounds(cover.coverPence)} to spare` : ''}.</p>
      : <p className="step-caption settle-cover is-short">{pounds(-cover.coverPence)} short of the bill: top up {phrase} before you pay.</p>
  }
  return <Section title="Settle up" count={`${done} of ${total} done`}>
    {copiedStatus}
    <div className="settle-up" role="region" aria-label="Settle-up steps" {...stepKeys.listProps}>{stepKeys.hint}
      {plan.setAside && setAsidePot && <StepGroup className="settle-account" label={`Move to ${potPhrase(setAsidePot.name)}`} heading="h3" title={`Into ${potPhrase(setAsidePot.name)}`} aside={owners(document, document.budget.accounts.find(account => account.id === plan.payFromAccountId)?.ownerPersonIds ?? [])}>
        <StepRow mode="status" stepKey="set-aside" done={!plan.setAside.toMove} name={plan.setAside.toMove ? `Move the rest to ${potPhrase(setAsidePot.name)}` : `Everything is in ${potPhrase(setAsidePot.name)}`} amountText={plan.setAside.toMove > 0 && signedPounds(plan.setAside.toMovePence)}>
          {plan.setAside.toMove > 0 && <StepCaption>{plural(plan.setAside.toMove, 'transaction')} not moved yet. <button type="button" className="text-button" onClick={onMove}>Move them</button></StepCaption>}
        </StepRow>
      </StepGroup>}
      {plan.accounts.filter(account => account.steps.length && account.accountId !== plan.payFromAccountId).map(account => <StepGroup key={account.accountId} className="settle-account" label={`${label(account.accountId)} steps`} heading="h3" title={label(account.accountId)} aside={owners(document, account.ownerPersonIds)}>
        {account.steps.map(step => row(step))}
      </StepGroup>)}
      {(payFrom?.steps.length || plan.totalPence > 0) && <StepGroup className="settle-account" label={`${label(plan.payFromAccountId)} steps`} heading="h3" title={label(plan.payFromAccountId)} aside={owners(document, payFrom?.ownerPersonIds ?? document.budget.accounts.find(account => account.id === plan.payFromAccountId)?.ownerPersonIds ?? [])}>
        {payFrom?.steps.map(step => row(step))}
        {plan.totalPence > 0 && row(plan.pay, payFrom?.oneOffsPence ? `Includes ${pounds(payFrom.oneOffsPence)} of one-offs already in ${label(plan.payFromAccountId)}` : undefined)}
      </StepGroup>}
    </div>
  </Section>
}
