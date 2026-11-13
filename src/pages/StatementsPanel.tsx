import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Clock, FileUp, Inbox, PiggyBank } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { allSettleSteps, paymentMatchingPay, setSettleTick, settleStepDone, settleSteps, settleWithoutFinal, shareSteps, statementKeys, statementShares, statementSummary, type SettleAccount, type SettleStep, type StatementSummary } from '../domain/cardStatements'
import { setAsideStatements } from '../domain/potBalances'
import { potPhrase } from '../domain/setAside'
import { MoveToPotSheet } from './MoveToPotSheet'
import { cardTracker } from '../domain/cardTracker'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { Breadcrumb, EmptyState, ListRow, Meter, Section, StatusChip } from '../components/ui'
import { useListNavigation } from '../state/useListNavigation'
import { StepCaption, StepGroup, StepRow } from '../components/ui/StepRow'
import { useStepCopy } from '../components/ui/useStepCopy'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { plural, pounds, signedPounds, statementName, statementStatus } from './spendingFormat'
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
  const inPot = plan?.setAside && setAsideStatements(document, card.id).find(row => row.statementKey === statementKey)
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
        {summary.toSort ? <StatusChip tone="warning">{summary.toSort} to sort</StatusChip> : <StatusChip tone="positive">✓ All {summary.transactions} sorted</StatusChip>}
        {summaryChip}
        {!summary.open && (summary.complete ? <StatusChip tone="positive">✓ Final export in</StatusChip> : <StatusChip tone="warning">Final export missing</StatusChip>)}
      </div>
      {canSettle && steps.length > 0 && <div className="statement-summary-progress"><p>{done} of {steps.length} done</p><Meter label={`Settle up: ${done} of ${steps.length} steps ticked`} value={done} max={steps.length}/></div>}
    </section>
    {!canSettle ? <Section title="Before you can settle up">
      <ul className="statement-waiting" aria-label="Before you can settle up">
        {summary.toSort > 0 && <li><ListRow icon={<Inbox/>} tone="warning" title={`${plural(summary.toSort, 'transaction')} to sort`} trailing={<button type="button" className="text-button" onClick={onSort}>Sort them</button>}/></li>}
        {summary.open && <li><ListRow icon={<Clock/>} title={`Closes ${dayDate(summary.closeDate)}`} meta="You can settle up once it closes."/></li>}
        {finalExportMissing && <li><ListRow icon={<FileUp/>} tone="warning" title="Bring in the final export" meta={`So North can check it’s all here. ${card.name} can export past periods.`}
          trailing={<span className="statement-actions"><button type="button" className="text-button" onClick={onBringIn}>Bring it in</button><button type="button" className="text-button" onClick={settleWithout}>Settle without it</button></span>}/></li>}
        {setAsidePot && inPot && <li><ListRow icon={<PiggyBank/>} tone={plan!.setAside!.toMove ? 'warning' : 'done'} title={`${signedPounds(inPot.movedPence)} of ${signedPounds(inPot.totalPence)} is in ${potPhrase(setAsidePot.name)}`}
          meta={plan!.setAside!.toMove ? `${signedPounds(plan!.setAside!.toMovePence)} sorted and still to move` : 'All moved in'} trailing={plan!.setAside!.toMove > 0 ? <button type="button" className="text-button" onClick={onSort}>Set aside</button> : undefined}/></li>}
        {payment.map(({ row }) => <li key={row.id}><ListRow title={`${card.name} shows a payment of ${pounds(-row.amountPence)} on ${shortDate(row.date)}`}/></li>)}
      </ul>
    </Section>
      : plan && steps.length > 0 && done === steps.length && !expanded ? <Section title="Settle up" collapsed={{ summary: `${done} of ${steps.length} done`, onExpand: () => setExpanded(true) }}/>
      : plan && <SettleSteps document={document} setDocument={setDocument} summary={summary} plan={plan} done={done} total={steps.length} payment={payment.find(row => row.matches)?.row} onMove={() => setMoving(true)} now={now}/>}
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

/** The Settle up steps, inline on the statement: one column per account, ticked like payday, then pay the card. */
function SettleSteps({ document, setDocument, summary, plan, done, total, payment, onMove, now }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; summary: StatementSummary; plan: NonNullable<ReturnType<typeof settleSteps>>; done: number; total: number; payment?: StatementSummary['payments'][number]; onMove: () => void; now: () => Date }) {
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
    : `Pay ${card.name} from ${setAsidePot ? potPhrase(setAsidePot.name) : label(plan.payFromAccountId)}`
  const tick = (key: string, amountPence: number | null) => setDocument(current => setSettleTick(current, summary.key, key, amountPence, now()))
  const moveNote = (amountPence: number) => (tickedPence: number, differencePence: number) => <>Changed since ticked: it was {pounds(tickedPence)}, it’s now {pounds(amountPence)}. {differencePence > 0 ? `Move ${pounds(differencePence)} more.` : `${pounds(-differencePence)} less is needed.`}</>
  const row = (step: SettleStep, caption?: string) => <StepRow key={step.key} stepKey={step.key} name={stepLabel(step)} amountPence={step.amountPence} ticks={ticks} onTick={tick} onCopy={pence => void copy(pence)}
    indent={step.kind === 'out' || step.kind === 'into'} emphasis={step === plan.pay ? 'pay' : undefined} showTickedDay changedNote={moveNote(step.amountPence)} caption={caption}>
    {step === plan.pay && payment && <StepCaption>{card.name} shows a payment of {pounds(-payment.amountPence)} on {shortDate(payment.date)}. {settleStepDone(plan, ticks, step) ? '' : <button type="button" className="text-button" onClick={() => tick(plan.pay.key, plan.pay.amountPence)}>Tick Pay {card.name}</button>}</StepCaption>}
  </StepRow>
  const payFrom = plan.accounts.find(account => account.accountId === plan.payFromAccountId)
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
