import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { annualCosts, cumulativeByDay, destinationTransactions, monthSpending, type DestinationSpending, type MonthSpending } from '../domain/cardSpending'
import { monthBills } from '../domain/recurringBills'
import { checkPotBalance, potBalance, setAsideStatements, type BalanceFlow, type PotBalance } from '../domain/potBalances'
import { potPhrase, usesSetAside } from '../domain/setAside'
import { cardTracker, daysBetween, localDate, parsePence, parseStatementKey, shiftMonth, type CardTransaction } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { Breadcrumb, ListRow, PageHeader, Section, Sheet, useMobilePresentation } from '../components/ui'
import { formatGBPWhole } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { dayDate, shortDate } from './cardLabels'
import { dayOf, pounds, signedPounds, statementName, transactionMeta } from './spendingFormat'
import './PotPage.css'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const whole = (pence: number) => formatGBPWhole(Math.round(pence / 100))

/** "Monzo", from the pot's account; "the bank" when it has no provider. */
function bankOf(document: BudgetDocument, potId: string) {
  const pot = document.budget.pots.find(row => row.id === potId)
  return document.budget.accounts.find(account => account.id === pot?.accountId)?.provider?.trim() || 'the bank'
}

/** The status line for a pot without the pace chart: what's left or over, and anything taken by last month. */
function statusText(row: DestinationSpending, month: MonthSpending): string {
  const taken = row.takenPence ? ` · ${pounds(row.takenPence)} taken by ${monthName(shiftMonth(month.month, -1))}` : ''
  if (row.status === 'over') return `${pounds(-row.leftPence)} over${month.when === 'current' ? ` · covered when ${monthName(month.month)} closes` : ''}${taken}`
  if (row.status === 'ahead') return `${whole(row.aheadPence!)} ahead of pace · ${pounds(row.leftPence)} left${taken}`
  if (row.status === 'on-track') return `On track · ${pounds(row.leftPence)} left${taken}`
  return `${pounds(row.leftPence)} left${taken}`
}

/** "on November statement" when a transaction's statement belongs to another month. */
function statementNote(transaction: CardTransaction, month: string) {
  const close = parseStatementKey(transaction.statementKey)?.closeDate
  return close && close.slice(0, 7) !== month ? ` · on ${monthName(close.slice(0, 7))} statement` : ''
}

/** The bills North assumes went out this month, as [date, pence] for the chart's Spent line. */
const assumedBills = (document: BudgetDocument, month: string, figures: MonthSpending) => monthBills(document, month, figures.today).filter(bill => bill.state === 'paid' && !bill.tracked).map(bill => ({ date: bill.date, destination: bill.destination, pence: bill.amountPence }))

/** Cumulative spend against the planned pace, with today and the run-out date (board 4, screen 2). */
function PaceChart({ document, month, row, figures, label }: { document: BudgetDocument; month: string; row: DestinationSpending; figures: MonthSpending; label: string }) {
  const through = figures.when === 'current' ? figures.day : figures.daysInMonth
  const points = cumulativeByDay(cardTracker(document), month, row.destination, through, assumedBills(document, month, figures))
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
    </svg>
    <figcaption className="pot-chart-legend"><span><i/>Spent</span><span><i className="is-plan"/>Planned pace</span></figcaption>
  </figure>
}

/** "Check against Monzo": what's in the pot now, by hand until balances come from the bank. */
function CheckBalance({ potName, bank, onSave, onClose }: { potName: string; bank: string; onSave: (pence: number) => void; onClose: () => void }) {
  const formId = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  return <Sheet title={`Check against ${bank}`} size="sm" onClose={onClose} footer={<>
    <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
    <button type="submit" form={formId} className="primary-button">Save balance</button>
  </>}>
    <form id={formId} className="spending-form" noValidate onSubmit={event => { event.preventDefault(); const pence = parsePence(value); if (pence === null || pence < 0) { setError('Enter the balance, like 1240.00.'); return } onSave(pence) }}>
      <div className="spending-field-wrap"><label className="spending-field">What’s in {potName} now?<input inputMode="decimal" value={value} data-autofocus onChange={event => setValue(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? 'check-balance-error' : undefined}/></label>{error && <span id="check-balance-error" className="input-error spending-field-error">{error}</span>}</div>
    </form>
  </Sheet>
}

/** What moved money in or out of a pot, for its sums: "Moved in on payday since". */
function flowLabel(flow: BalanceFlow, document: BudgetDocument, setAside: boolean): string {
  const card = cardTracker(document).cards.find(row => row.setAside) ?? cardTracker(document).cards[0]
  const pot = document.budget.pots.find(row => row.id === card?.setAside?.potId)
  return {
    payday: 'Moved in on payday', bills: 'Bills paid', covers: 'Overspend covers', 'built-up': 'Built-up money moved out', settled: 'Settled up',
    'set-aside': setAside ? 'Moved in from pots' : `Moved to ${potPhrase(pot?.name ?? 'Amex')}`, paid: `Paid to ${card?.name ?? 'the card'}`,
  }[flow]
}

/** The balance worked out: last checked, every move since, then what's still waiting to move off it. */
function BalanceSums({ document, balance, bank }: { document: BudgetDocument; balance: PotBalance; bank: string }) {
  const tracker = cardTracker(document)
  const waitingLabel = (statementKey: string, closeDate: string) => {
    const card = tracker.cards.find(row => row.id === parseStatementKey(statementKey)?.cardId)
    return `${usesSetAside(card, statementKey) ? 'Still to move' : 'Waiting to settle'} · ${statementName(closeDate)}`
  }
  // Money in the pot that isn't free: card spend still to move, and bills still to come out this month.
  const held = balance.waiting.length > 0 || balance.billsDuePence > 0
  return <dl className="carry-over-sums">
    {balance.checked ? <div><dt>In {bank} · checked {dayOf(balance.checked.at)}</dt><dd>{signedPounds(balance.checked.pence)}</dd></div> : <div><dt>Not checked yet</dt><dd>—</dd></div>}
    {balance.since.map(row => <div key={row.flow}><dt>{flowLabel(row.flow, document, balance.setAside)} since</dt><dd>{row.pence > 0 ? '+' : ''}{signedPounds(row.pence)}</dd></div>)}
    {balance.balancePence !== undefined && balance.since.length > 0 && held && <div className="is-subtotal"><dt>In {bank} now</dt><dd>{signedPounds(balance.balancePence)}</dd></div>}
    {balance.waiting.map(row => <div key={row.statementKey}><dt>{waitingLabel(row.statementKey, row.closeDate)}</dt><dd>{signedPounds(-row.pence)}</dd></div>)}
    {balance.billsDuePence > 0 && <div><dt>Bills still due this month</dt><dd>{signedPounds(-balance.billsDuePence)}</dd></div>}
    {balance.freePence !== undefined && held && <div className="is-total"><dt>Free</dt><dd>{signedPounds(balance.freePence)}</dd></div>}
    {balance.balancePence !== undefined && !held && balance.since.length > 0 && <div className="is-total"><dt>In {bank} now</dt><dd>{signedPounds(balance.balancePence)}</dd></div>}
  </dl>
}

/** A pot's balance in one line ("In Monzo £609.75 · £244.05 free · checked Sat 31 Oct"), with the sums folded beneath. */
function BalanceLine({ document, potId, today }: { document: BudgetDocument; potId: string; today: string }) {
  const bank = bankOf(document, potId)
  const balance = potBalance(document, potId, today)
  const held = balance.waiting.length > 0 || balance.billsDuePence > 0
  const parts = [balance.balancePence !== undefined ? `In ${bank} ${signedPounds(balance.balancePence)}` : `In ${bank}: not checked yet`, balance.freePence !== undefined && held ? `${signedPounds(balance.freePence)} free` : '', balance.checked ? `checked ${dayOf(balance.checked.at)}` : '']
  return <>
    <p className="pot-balance-line">{parts.filter(Boolean).join(' · ')}</p>
    {(balance.since.length > 0 || held) && <details className="pot-balance-how"><summary>How it’s worked out</summary><BalanceSums document={document} balance={balance} bank={bank}/></details>}
  </>
}

/** A carry-over pot: what's free (with how it's worked out) and the annual costs it saves for. */
function CarryOver({ document, potId, month, today }: { document: BudgetDocument; potId: string; month: string; today: string }) {
  const costs = annualCosts(document, potId, month)
  const bank = bankOf(document, potId)
  const balance = potBalance(document, potId, today)
  return <>
    <section className="pot-lead" aria-labelledby={`pot-free-${potId}`}>
      <p className="pot-lead-label" id={`pot-free-${potId}`}>Free in the pot</p>
      <p className="pot-lead-value">{balance.freePence === undefined ? '—' : signedPounds(balance.freePence)}</p>
      <BalanceSums document={document} balance={balance} bank={bank}/>
    </section>
    {costs.length > 0 && <Section title="Annual costs from the Plan">
      <dl className="carry-over-sums">{costs.map(cost => <div key={cost.id}><dt>{cost.name}</dt><dd>{pounds(cost.yearlyPence)} a year</dd></div>)}</dl>
    </Section>}
  </>
}

type DetailProps = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; potId: string; month: string; today: string; onBack: () => void; onOpenSettings?: () => void }

/** The pot page's header: "Month › Groceries", its kind, Check against Monzo and ⋯ › Pot settings. */
function PotHeader({ title, context, bank, onBack, month, onCheck, onOpenSettings }: { title: string; context: ReactNode; bank: string; onBack: () => void; month: string; onCheck: () => void; onOpenSettings?: () => void }) {
  // Phones move the header into the app header, which has no breadcrumb; the way back sits on the pine band instead.
  const mobile = useMobilePresentation()
  return <>{mobile && <Breadcrumb items={[{ label: 'Month', onClick: onBack }, { label: title }]}/>}<PageHeader titleText={title} title={title} monthLabel={formatMonth(month)} context={context} breadcrumb={mobile ? undefined : [{ label: 'Month', onClick: onBack }, { label: title }]}
    actions={<>
      <button type="button" className="secondary-button" onClick={onCheck}>Check against {bank}</button>
      {onOpenSettings && <BudgetOptionsMenu label={`More ${title} options`} options={[{ label: 'Pot settings', onSelect: onOpenSettings }]}/>}
    </>}/></>
}

/** The Amex pot: what's in it, and for each statement it pays what it costs and what's still to move. */
function SetAsidePot({ document, setDocument, potId, onBack, month, today, onOpenSettings }: DetailProps) {
  const pot = document.budget.pots.find(row => row.id === potId)!
  const card = cardTracker(document).cards.find(row => row.setAside?.potId === potId)!
  const bank = bankOf(document, potId)
  const [checking, setChecking] = useState(false)
  const statements = setAsideStatements(document, card.id).filter(row => row.paidPence !== row.totalPence || row.totalPence === 0 && row.movedPence !== 0)
  const title = /\bpot$/i.test(pot.name.trim()) ? pot.name.trim() : `${pot.name.trim()} pot`
  return <div className="pot-detail">
    <PotHeader title={title} context={`Pays the ${card.name} from the ${statementName(card.setAside!.fromCloseDate)}`} bank={bank} month={month} onBack={onBack} onCheck={() => setChecking(true)} onOpenSettings={onOpenSettings}/>
    <BalanceLine document={document} potId={potId} today={today}/>
    <Section title="Statements it pays">
      {statements.length ? <ul className="pot-list" aria-label="Statements it pays">{statements.map(row => <li key={row.statementKey}>
        <ListRow title={statementName(row.closeDate)} meta={`${signedPounds(row.movedPence)} moved in${row.toMovePence ? ` · ${signedPounds(row.toMovePence)} still to move` : ' · all moved'}${row.paidPence ? ` · paid ${pounds(row.paidPence)}` : ''}`} trailing={signedPounds(row.totalPence)}/>
      </li>)}</ul> : <p className="pot-none">Nothing to pay from {potPhrase(pot.name)} yet.</p>}
    </Section>
    {checking && <CheckBalance potName={pot.name} bank={bank} onClose={() => setChecking(false)} onSave={pence => { setDocument(current => checkPotBalance(current, potId, pence, new Date())); setChecking(false) }}/>}
  </div>
}

/**
 * A pot's page (Month › Groceries): what's left this month and how fast, with the pace chart and one run-out line;
 * the balance in one line with the sums folded; then its transactions.
 */
export function PotDetail({ document, setDocument, potId, month, today = localDate(), onBack, onOpenSettings }: DetailProps) {
  const pot = document.budget.pots.find(row => row.id === potId)
  const [checking, setChecking] = useState(false)
  const figures = monthSpending(document, month, today)
  const destination: BudgetDestination = { kind: 'pot', potId }
  const row = figures.rows.find(item => item.key === `pot:${potId}`)
  const transactions = destinationTransactions(cardTracker(document), month, destination)
  const owners = document.budget.accounts.find(account => account.id === pot?.accountId)?.ownerPersonIds ?? []
  const ownerLabel = owners.length > 1 ? 'Joint' : document.household.adults.find(person => person.id === owners[0])?.name ?? 'Pot'
  if (!pot) return <p className="pot-none">That pot no longer exists. <button type="button" className="text-button" onClick={onBack}>Back to Month</button></p>
  if (cardTracker(document).cards.some(card => card.setAside?.potId === potId)) return <SetAsidePot document={document} setDocument={setDocument} potId={potId} month={month} today={today} onBack={onBack} onOpenSettings={onOpenSettings}/>
  const bank = bankOf(document, potId)
  const carriesOver = row?.carriesOver || !row && !!document.card?.pots[potId]?.carriesOver
  const steady = row?.pace === 'steady' && !row.carriesOver && row.plannedPence > 0
  const daysLeft = figures.daysLeft
  const allowance = row && figures.when === 'current' && row.leftPence > 0 && daysLeft > 0 ? row.leftPence / daysLeft : undefined
  const average = row && figures.day > 0 ? (row.spentPence + row.takenPence) / figures.day : undefined
  const chartLabel = row ? `${pot.name} spending ${figures.when === 'current' ? 'so far' : `in ${monthName(month)}`} against the plan: ${pounds(row.spentPence)} spent${figures.when === 'current' ? ` by day ${figures.day}` : ''}${row.expectedPence !== undefined ? `, against ${pounds(row.expectedPence)} at the planned pace` : ''}, of ${pounds(row.plannedPence)} planned.${row.runsOut && row.status === 'ahead' ? ` Runs out around ${dayDate(row.runsOut)}.` : ''}` : ''
  const lineAmount = (transaction: CardTransaction) => transaction.sort!.lines.filter(line => line.destination.kind === 'pot' && line.destination.potId === potId).reduce((sum, line) => sum + line.amountPence, 0)
  const context = `${ownerLabel} · ${carriesOver ? 'carries over' : 'monthly'} · ${formatMonth(month)}${figures.when === 'current' ? ` · day ${figures.day} of ${figures.daysInMonth}` : ''}`

  return <div className="pot-detail">
    <PotHeader title={pot.name} context={context} bank={bank} month={month} onBack={onBack} onCheck={() => setChecking(true)} onOpenSettings={onOpenSettings}/>
    {carriesOver ? <CarryOver document={document} potId={potId} month={month} today={today}/>
      : !row ? <><p className="pot-none">Nothing planned or spent in {monthName(month)}.</p><BalanceLine document={document} potId={potId} today={today}/></> : <>
      <section className="pot-lead" aria-labelledby="pot-lead-label">
        <p className="pot-lead-label" id="pot-lead-label">{row.leftPence < 0 ? 'Over this month' : 'Left this month'}</p>
        <p className="pot-lead-value">{pounds(Math.abs(row.leftPence))}{row.leftPence >= 0 && figures.when === 'current' && <small> for {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</small>}</p>
        {steady && allowance !== undefined && average !== undefined && <p className="pot-lead-pace">About {whole(allowance)} a day · you’ve averaged {whole(average)}</p>}
        {!(steady && figures.when === 'current' && row.leftPence >= 0) && <p className={`pot-lead-status is-${row.status}`}>{statusText(row, figures)}</p>}
        {steady && figures.when !== 'future' && <PaceChart document={document} month={month} row={row} figures={figures} label={chartLabel}/>}
        {row.status === 'ahead' && row.runsOut && <p className="pot-runout">At this rate it runs out around {dayDate(row.runsOut)}, {daysBetween(row.runsOut, `${month}-${String(figures.daysInMonth).padStart(2, '0')}`)} days before the month ends.</p>}
      </section>
      <Section title="Balance"><BalanceLine document={document} potId={potId} today={today}/></Section>
    </>}
    <Section title="Transactions">
      {transactions.length ? <ul className="pot-list" aria-label="Transactions">{transactions.map(transaction => <li key={transaction.id}>
        <ListRow title={transaction.description} meta={`${transactionMeta(document, transaction)}${statementNote(transaction, month)}${lineAmount(transaction) !== transaction.amountPence ? ` · part of ${signedPounds(transaction.amountPence)}` : ''}`} trailing={<span className={lineAmount(transaction) < 0 ? 'pot-credit' : undefined}>{signedPounds(lineAmount(transaction))}</span>}/>
      </li>)}</ul> : <p className="pot-none">No transactions in {monthName(month)}.</p>}
    </Section>
    {checking && <CheckBalance potName={pot.name} bank={bank} onClose={() => setChecking(false)} onSave={pence => { setDocument(current => checkPotBalance(current, potId, pence, new Date())); setChecking(false) }}/>}
  </div>
}
