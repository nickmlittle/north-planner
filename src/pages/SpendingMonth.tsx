import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ArrowLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { annualCosts, checkPotBalance, cumulativeByDay, destinationTransactions, monthSpending, potFree, type DestinationSpending, type MonthSpending } from '../domain/cardSpending'
import { ModalDialog } from '../components/ModalDialog'
import { closeMonthPlan, monthStage, type MonthStatus } from '../domain/monthStages'
import { cardTracker, daysBetween, localDate, parsePence, parseStatementKey, shiftMonth, type CardTransaction } from '../domain/cardTracker'
import { budgetDateMarkers, incomeDateMarkers, type BudgetDestination } from '../domain/monthlyBudget'
import { formatGBPWhole } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { MonthControl } from './MonthControl'
import { dayOf, pounds, signedPounds, transactionMeta } from './spendingFormat'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const whole = (pence: number) => formatGBPWhole(Math.round(pence / 100))

/** The status line under a pot: pace, what's left or over, and anything taken by last month. */
function statusText(row: DestinationSpending, month: MonthSpending, free?: number | null): string {
  const taken = row.takenPence ? ` · ${pounds(row.takenPence)} taken by ${monthName(shiftMonth(month.month, -1))}` : ''
  if (row.status === 'one-offs') return ''
  if (row.carriesOver) return free === undefined ? 'Carries over' : free === null ? 'Check the balance to see what’s free' : `${pounds(free)} free in the pot`
  if (row.status === 'over') return `${pounds(-row.leftPence)} over${month.when === 'current' ? ` · covered when ${monthName(month.month)} closes` : ''}${taken}`
  if (row.status === 'ahead') return `${whole(row.aheadPence!)} ahead of pace · ${pounds(row.leftPence)} left${taken}`
  if (row.status === 'on-track') return `On track · ${pounds(row.leftPence)} left${taken}`
  return `${pounds(row.leftPence)} left${taken}`
}

/** "In progress · 18 days left", "Closing", "To settle", "Settled". */
function stageLabel(stage: MonthStatus, figures: MonthSpending): string {
  if (stage.stage === 'in-progress') return `In progress · ${figures.daysLeft} ${figures.daysLeft === 1 ? 'day' : 'days'} left`
  if (stage.stage === 'closing') return 'Closing'
  if (stage.stage === 'to-settle') return `To settle${stage.closedAt ? ` · closed ${dayOf(stage.closedAt)}` : ''}`
  if (stage.stage === 'settled') return 'Settled'
  return stage.stage === 'funded' ? 'Funded' : stage.stage === 'funding' ? `Funding · ${stage.funding.done} of ${stage.funding.total}` : 'Not started'
}

/** "£338.60 of £520.00", "£41.97 this month", "£112.81 one-offs". */
function amountText(row: DestinationSpending): { strong: string; rest: string } {
  if (row.status === 'one-offs') return { strong: signedPounds(row.spentPence), rest: row.destination.kind === 'account' ? ' one-offs' : ' spent' }
  if (row.carriesOver) return { strong: signedPounds(row.spentPence), rest: ' this month' }
  return { strong: signedPounds(row.spentPence), rest: ` of ${pounds(row.plannedPence)}` }
}

function Bar({ row, month }: { row: DestinationSpending; month: MonthSpending }) {
  if (row.carriesOver || row.plannedPence <= 0) return null
  const filled = Math.min(100, Math.max(0, (row.spentPence + row.takenPence) / row.plannedPence * 100))
  return <span className={`spending-bar is-${row.status}`} aria-hidden="true">
    <span style={{ width: `${filled}%` }}/>
    {row.pace === 'steady' && month.when === 'current' && row.expectedPence !== undefined && <i style={{ left: `${Math.min(100, row.expectedPence / row.plannedPence * 100)}%` }}/>}
  </span>
}

type PanelProps = { document: BudgetDocument; month: string; today: string; onMonthChange: (month: string) => void; onOpenPot: (potId: string) => void; onOpenClose?: () => void; headingExtra?: ReactNode }

/** This month: planned vs spent for each pot, grouped like Plan, with pace for steady pots (board 4, screen 1). */
export function ThisMonthPanel({ document, month, today, onMonthChange, onOpenPot, onOpenClose, headingExtra }: PanelProps) {
  const stage = monthStage(document, month, today)
  const closePlan = stage.stage !== 'in-progress' && stage.closedAt ? closeMonthPlan(document, month, today) : null
  const figures = monthSpending(document, month, today)
  const name = destinationNamer(document)
  const cardName = cardTracker(document).cards.map(card => card.name).join(' and ') || 'the card'
  const potName = (destination: BudgetDestination) => destination.kind === 'pot' ? document.budget.pots.find(pot => pot.id === destination.potId)?.name ?? 'Pot' : name(destination)
  const groups = [
    { key: 'joint', label: 'Joint' },
    ...document.household.adults.map(person => ({ key: person.id, label: person.name })),
    { key: 'accounts', label: 'Accounts' },
  ].map(group => ({ ...group, rows: figures.rows.filter(row => row.group === group.key) })).filter(group => group.rows.length)
  const facts = [
    figures.needsCare ? `${figures.needsCare} ${figures.needsCare === 1 ? 'pot needs' : 'pots need'} care` : figures.when === 'current' && figures.rows.length ? 'All on track' : '',
    figures.when === 'current' ? `${figures.daysLeft} ${figures.daysLeft === 1 ? 'day' : 'days'} left` : '',
    figures.sortedTo ? `sorted to ${shortDate(figures.sortedTo)}` : '',
  ].filter(Boolean)

  return <>
    <div className="spending-month-control"><h2 id="spending-month-title" className="visually-hidden">{formatMonth(month)}</h2><MonthControl month={month} onChange={onMonthChange} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/>{headingExtra}</div>
    {stage.stage === 'closing' && onOpenClose && <div className="spending-callout is-action"><TriangleAlert aria-hidden="true"/><div><p>{monthName(month)} has ended. Cover any overspends and note what's left, then close it.</p><button type="button" className="primary-button" onClick={onOpenClose}>Close {monthName(month)}</button></div></div>}
    {closePlan && closePlan.changedSinceClosed.length > 0 && onOpenClose && <div className="spending-callout is-action"><TriangleAlert aria-hidden="true"/><div><p>Changed since closed: {closePlan.changedSinceClosed.map(row => `${name(row.destination)} ${pounds(row.closedPence)} → ${pounds(row.nowPence)}`).join(', ')}.</p><button type="button" className="secondary-button" onClick={onOpenClose}>Close again</button></div></div>}
    <div className="spending-month-summary">
      <p className="spending-stage"><span className={`spending-chip is-${stage.stage}`}>{stageLabel(stage, figures)}</span>{stage.stage === 'in-progress' && stage.funding.total > 0 && <span className="spending-chip">{stage.funding.done === stage.funding.total ? 'Funded' : `Funding · ${stage.funding.done} of ${stage.funding.total}`}</span>}</p>
      <p className="spending-eyebrow">{figures.when === 'current' ? `Spent on ${cardName} so far` : figures.when === 'past' ? `Spent on ${cardName}` : 'Nothing spent yet'}</p>
      <p className="spending-big">{pounds(figures.spentPence)} <small>of {pounds(figures.plannedPence)} planned</small></p>
      {facts.length > 0 && <p className="spending-facts">{facts.join(' · ')}</p>}
    </div>
    {!groups.length ? <p className="spending-none">Nothing spent in {monthName(month)} yet.</p>
      : <div className="spending-month-groups">{groups.map(group => <section key={group.key} className="spending-month-group" aria-labelledby={`spending-group-${group.key}`}>
        <h3 id={`spending-group-${group.key}`} className="spending-group-heading">{group.label}</h3>
        <ul>{group.rows.map(row => {
          const free = row.carriesOver && row.destination.kind === 'pot' ? potFree(document, row.destination.potId).freePence ?? null : undefined
          const amount = amountText(row), status = statusText(row, figures, free)
          const body = <>
            <span className="spending-pot-top"><span className="spending-pot-name">{potName(row.destination)}{row.carriesOver && <span className="spending-pot-kind"> · carries over</span>}</span><span className="spending-pot-amount"><b>{amount.strong}</b>{amount.rest}</span></span>
            <Bar row={row} month={figures}/>
            {status && <span className={`spending-pot-status is-${row.status}`}>{status}</span>}
          </>
          return <li key={row.key}>{row.destination.kind === 'pot'
            ? <button type="button" className="spending-pot" onClick={() => onOpenPot((row.destination as { potId: string }).potId)} aria-label={`${potName(row.destination)}: ${amount.strong}${amount.rest}${status ? `. ${status}` : ''}`}>{body}<ChevronRight className="spending-pot-chevron" aria-hidden="true"/></button>
            : <div className="spending-pot">{body}</div>}</li>
        })}</ul>
      </section>)}</div>}
  </>
}

/** "on November statement" when a transaction's statement belongs to another month. */
function statementNote(transaction: CardTransaction, month: string) {
  const close = parseStatementKey(transaction.statementKey)?.closeDate
  return close && close.slice(0, 7) !== month ? ` · on ${monthName(close.slice(0, 7))} statement` : ''
}

/** Cumulative spend against the planned pace, with today and the run-out date (board 4, screen 2). */
function PaceChart({ document, month, row, figures, label }: { document: BudgetDocument; month: string; row: DestinationSpending; figures: MonthSpending; label: string }) {
  const through = figures.when === 'current' ? figures.day : figures.daysInMonth
  const points = cumulativeByDay(cardTracker(document), month, row.destination, through)
  const top = Math.max(row.plannedPence, ...points.map(([, pence]) => pence), 1) * 1.05
  const x = (day: number) => 10 + 300 * day / figures.daysInMonth
  const y = (pence: number) => 130 - 120 * Math.max(0, pence) / top
  const path = `M${x(0)} ${y(0)} ` + points.map(([day, pence]) => `H${x(day).toFixed(1)} V${y(pence).toFixed(1)}`).join(' ')
  const last = points.at(-1) ?? [0, 0]
  const runOut = row.runsOut && row.status === 'ahead' ? Number(row.runsOut.slice(8)) : undefined
  return <figure className="pot-chart">
    <svg viewBox="0 0 330 160" role="img" aria-label={label}>
      <path className="pot-chart-grid" d="M10 130 H310"/>
      <path className="pot-chart-plan" d={`M${x(0)} ${y(0)} L${x(figures.daysInMonth)} ${y(row.plannedPence)}`}/>
      <path className="pot-chart-spent" d={path}/>
      {figures.when === 'current' && <path className="pot-chart-today" d={`M${x(through)} 14 V134`}/>}
      {runOut && <path className="pot-chart-runout" d={`M${x(last[0])} ${y(last[1])} L${x(runOut)} ${y(row.plannedPence)}`}/>}
      <circle className="pot-chart-dot" cx={x(last[0])} cy={y(last[1])} r="4"/>
      <text x="12" y={Math.max(22, y(row.plannedPence) - 4)}>{whole(row.plannedPence)}</text>
      <text x="10" y="150">1 {shortDate(`${month}-01`).split(' ')[1]}</text>
      {figures.when === 'current' && through > 4 && through < figures.daysInMonth - 4 && <text x={x(through)} y="150" textAnchor="middle">Today</text>}
      <text x="310" y="150" textAnchor="end">{shortDate(`${month}-${String(figures.daysInMonth).padStart(2, '0')}`)}</text>
      {runOut && <text className="pot-chart-warn" x={Math.min(x(runOut) + 6, 250)} y="30">Runs out ~{shortDate(row.runsOut!)}</text>}
    </svg>
    <figcaption className="pot-chart-legend"><span><i/>Spent</span><span><i className="is-plan"/>Planned pace</span></figcaption>
  </figure>
}

/** "Check against Monzo": what's in the pot now, by hand until balances come from the bank. */
function CheckBalance({ potName, bank, onSave, onClose }: { potName: string; bank: string; onSave: (pence: number) => void; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  return <ModalDialog title={`Check against ${bank}`} onClose={onClose} className="check-balance-sheet">
    <form className="spending-form" noValidate onSubmit={event => { event.preventDefault(); const pence = parsePence(value); if (pence === null || pence < 0) { setError('Enter the balance, like 1240.00.'); return } onSave(pence) }}>
      <div className="spending-field-wrap"><label className="spending-field">What’s in {potName} now?<input inputMode="decimal" value={value} data-autofocus onChange={event => setValue(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? 'check-balance-error' : undefined}/></label>{error && <span id="check-balance-error" className="input-error spending-field-error">{error}</span>}</div>
      <div className="spending-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Save balance</button></div>
    </form>
  </ModalDialog>
}

/** A carry-over pot: what's free, how that's worked out, the balance check and the annual costs it saves for (board 4, screen 3). */
function CarryOver({ document, setDocument, potId, month }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; potId: string; month: string }) {
  const pot = document.budget.pots.find(row => row.id === potId)!
  const bank = document.budget.accounts.find(account => account.id === pot.accountId)?.provider?.trim() || 'the bank'
  const free = potFree(document, potId)
  const costs = annualCosts(document, potId, month)
  const [checking, setChecking] = useState(false)
  return <>
    <section className="spending-month-summary carry-over" aria-labelledby="carry-over-free">
      <p className="spending-eyebrow" id="carry-over-free">Free in the pot</p>
      <p className="spending-big">{free.freePence === undefined ? '—' : signedPounds(free.freePence)}</p>
      <dl className="carry-over-sums">
        {free.checked ? <div><dt>In the pot · checked {dayOf(free.checked.at)}</dt><dd>{pounds(free.checked.pence)}</dd></div> : <div><dt>Not checked yet</dt><dd>—</dd></div>}
        {free.movedInPence > 0 && <div><dt>Moved in since</dt><dd>+{pounds(free.movedInPence)}</dd></div>}
        {free.outPence !== 0 && <div><dt>Out of {pot.name} since</dt><dd>{signedPounds(-free.outPence)}</dd></div>}
        {free.waiting.map(row => <div key={row.statementKey}><dt>Waiting to settle · {monthName(row.closeDate.slice(0, 7))} statement</dt><dd>{signedPounds(-row.pence)}</dd></div>)}
        {free.freePence !== undefined && <div className="is-total"><dt>Free</dt><dd>{signedPounds(free.freePence)}</dd></div>}
      </dl>
      <button type="button" className="secondary-button carry-over-check" onClick={() => setChecking(true)}>Check against {bank}</button>
    </section>
    {costs.length > 0 && <section className="spending-month-summary" aria-labelledby="carry-over-costs">
      <p className="spending-eyebrow" id="carry-over-costs">Annual costs from the Plan</p>
      <dl className="carry-over-sums">{costs.map(cost => <div key={cost.id}><dt>{cost.name}</dt><dd>{pounds(cost.yearlyPence)} a year</dd></div>)}</dl>
    </section>}
    {checking && <CheckBalance potName={pot.name} bank={bank} onClose={() => setChecking(false)} onSave={pence => { setDocument(current => checkPotBalance(current, potId, pence, new Date())); setChecking(false) }}/>}
  </>
}

type DetailProps = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; potId: string; month: string; today: string; onBack: () => void }

/** A pot's month: what's left and for how long, the pace chart, and its transactions (board 4, screens 2–3). */
export function PotDetail({ document, setDocument, potId, month, today = localDate(), onBack }: DetailProps) {
  const pot = document.budget.pots.find(row => row.id === potId)
  const figures = monthSpending(document, month, today)
  const destination: BudgetDestination = { kind: 'pot', potId }
  const row = figures.rows.find(item => item.key === `pot:${potId}`)
  const transactions = destinationTransactions(cardTracker(document), month, destination)
  const owners = document.budget.accounts.find(account => account.id === pot?.accountId)?.ownerPersonIds ?? []
  const ownerLabel = owners.length > 1 ? 'Joint' : document.household.adults.find(person => person.id === owners[0])?.name ?? 'Pot'
  if (!pot) return <p className="spending-none">That pot no longer exists. <button type="button" className="text-button" onClick={onBack}>Back to {monthName(month)}</button></p>
  const steady = row?.pace === 'steady' && !row.carriesOver && row.plannedPence > 0
  const daysLeft = figures.daysLeft
  const allowance = row && figures.when === 'current' && row.leftPence > 0 && daysLeft > 0 ? row.leftPence / daysLeft : undefined
  const average = row && figures.day > 0 ? (row.spentPence + row.takenPence) / figures.day : undefined
  const chartLabel = row ? `${pot.name} spending ${figures.when === 'current' ? 'so far' : `in ${monthName(month)}`} against the plan: ${pounds(row.spentPence)} spent${figures.when === 'current' ? ` by day ${figures.day}` : ''}${row.expectedPence !== undefined ? `, against ${pounds(row.expectedPence)} at the planned pace` : ''}, of ${pounds(row.plannedPence)} planned.${row.runsOut && row.status === 'ahead' ? ` Runs out around ${dayDate(row.runsOut)}.` : ''}` : ''
  const lineAmount = (transaction: CardTransaction) => transaction.sort!.lines.filter(line => line.destination.kind === 'pot' && line.destination.potId === potId).reduce((sum, line) => sum + line.amountPence, 0)

  return <div className="pot-detail">
    <button type="button" className="text-button spending-back" onClick={onBack}><ArrowLeft aria-hidden="true"/>Back to {monthName(month)}</button>
    <div className="spending-section-heading"><h2 id="spending-pot-title">{pot.name}</h2><span>{ownerLabel} · {row?.carriesOver ? 'carries over' : 'monthly'}</span></div>
    <p className="spending-facts">{formatMonth(month)}{figures.when === 'current' ? ` · day ${figures.day} of ${figures.daysInMonth}` : ''}</p>
    {row?.carriesOver || !row && document.card?.pots[potId]?.carriesOver ? <CarryOver document={document} setDocument={setDocument} potId={potId} month={month}/>
      : !row ? <p className="spending-none">Nothing planned or spent in {monthName(month)}.</p> : <>
      <section className="spending-month-summary" aria-labelledby="spending-pot-left">
        <p className="spending-eyebrow" id="spending-pot-left">{row.carriesOver ? `Spent from ${pot.name} in ${monthName(month)}` : row.leftPence < 0 ? 'Over this month' : 'Left this month'}</p>
        <p className="spending-big">{row.carriesOver ? pounds(row.spentPence) : pounds(Math.abs(row.leftPence))}{!row.carriesOver && row.leftPence >= 0 && figures.when === 'current' && <small> for {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</small>}</p>
        {steady && allowance !== undefined && average !== undefined && <p className="spending-pace-line">About {whole(allowance)} a day. You’ve averaged {whole(average)}.</p>}
        {!row.carriesOver && !(steady && figures.when === 'current' && row.leftPence >= 0) && <p className={`spending-pot-status is-${row.status}`}>{statusText(row, figures)}</p>}
        {steady && figures.when !== 'future' && <PaceChart document={document} month={month} row={row} figures={figures} label={chartLabel}/>}
      </section>
      {row.status === 'ahead' && row.runsOut && <p className="spending-callout"><TriangleAlert aria-hidden="true"/>At this rate {pot.name} runs out around {dayDate(row.runsOut)}, {daysBetween(row.runsOut, `${month}-${String(figures.daysInMonth).padStart(2, '0')}`)} days before the month ends.</p>}
    </>}
    <section aria-labelledby="spending-pot-transactions">
      <h3 id="spending-pot-transactions" className="spending-group-heading">Transactions</h3>
      {transactions.length ? <ul className="spending-list">{transactions.map(transaction => <li key={transaction.id}><div className={`spending-row${lineAmount(transaction) < 0 ? ' is-credit' : ''}`}>
        <span className="spending-row-main"><span className="spending-row-title">{transaction.description}</span><span className="spending-row-amount">{signedPounds(lineAmount(transaction))}</span></span>
        <span className="spending-row-meta"><span>{transactionMeta(document, transaction)}{statementNote(transaction, month)}{lineAmount(transaction) !== transaction.amountPence ? ` · part of ${signedPounds(transaction.amountPence)}` : ''}</span></span>
      </div></li>)}</ul> : <p className="spending-none">No transactions in {monthName(month)}.</p>}
    </section>
  </div>
}
