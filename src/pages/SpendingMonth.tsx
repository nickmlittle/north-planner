import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cumulativeByDay, destinationTransactions, monthSpending, type DestinationSpending, type MonthSpending } from '../domain/cardSpending'
import { monthBills } from '../domain/recurringBills'
import { checkPotBalance, potBalance, type BalanceFlow, type PotBalance } from '../domain/potBalances'
import { potPhrase, usesSetAside } from '../domain/setAside'
import { cardTracker, daysBetween, localDate, parsePence, parseStatementKey, shiftMonth, type CardTransaction } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { Breadcrumb, ListRow, PageHeader, Section, Sheet, useMobilePresentation } from '../components/ui'
import { formatGBPWhole } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { dayDate, shortDate } from './cardLabels'
import { billName, billParts, dayOf, plural, pounds, signedPounds, statementName, transactionMeta } from './spendingFormat'
import { potBills } from '../domain/billSum'
import { potSum, typicalShop, weekFigures } from '../domain/potSum'
import { potKind, POT_KIND_LABELS } from '../domain/potKinds'
import { BillsThisMonth, PotMonthFigures, YearlyBillsSetAside } from './PotBills'
import { spentParts } from './billLabels'
import { FreshnessLine } from './Freshness'
import { SetAsideCheckLead } from './SetAsideCheckLead'
import { CarriedOverList, FundedLead, LastMonths, SavingLead, TryAnAmount, WeekLines } from './PotLeads'
import { merchantBreakdown, type MerchantRow } from '../domain/merchants'
import { addRule, ruleSuggestions, rulesFor, type RuleSuggestion } from '../domain/cardSorting'
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
  // Where the plan says spend should be today ("£210 by today"), so the gap to the Spent dot reads as ahead or behind
  // (F4). The label sits on the side away from the Spent line, and turns back from the right edge.
  const expected = figures.when === 'current' && row.expectedPence !== undefined && row.expectedPence > 0 ? { x: x(through), y: y(row.expectedPence) } : undefined
  const spentAbove = last[1] >= (row.expectedPence ?? 0)
  const labelY = expected ? Math.max(22, Math.min(124, spentAbove ? expected.y + 16 : expected.y - 8)) : 0
  const labelRight = expected ? expected.x <= 220 : true
  return <figure className="pot-chart">
    <svg viewBox="0 0 330 160" role="img" aria-label={label}>
      <path className="pot-chart-grid" d="M10 130 H310"/>
      <path className="pot-chart-plan" d={`M${x(0)} ${y(0)} L${x(figures.daysInMonth)} ${y(row.plannedPence)}`}/>
      <path className="pot-chart-spent" d={path}/>
      {figures.when === 'current' && <path className="pot-chart-today" d={`M${x(through)} 14 V134`}/>}
      {runOut && <path className="pot-chart-runout" d={`M${x(last[0])} ${y(last[1])} L${x(runOut)} ${y(row.plannedPence)}`}/>}
      {expected && <circle className="pot-chart-expected" cx={expected.x} cy={expected.y} r="3.5"/>}
      <circle className="pot-chart-dot" cx={x(last[0])} cy={y(last[1])} r="4"/>
      {expected && <text className="pot-chart-expected-label" x={labelRight ? expected.x + 7 : expected.x - 7} y={labelY} textAnchor={labelRight ? 'start' : 'end'}>{whole(row.expectedPence!)} by today</text>}
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
function flowLabel(flow: BalanceFlow, document: BudgetDocument, setAside: boolean, pence: number): string {
  const card = cardTracker(document).cards.find(row => row.setAside) ?? cardTracker(document).cards[0]
  const phrase = potPhrase(document.budget.pots.find(row => row.id === card?.setAside?.potId)?.name ?? 'Amex')
  return {
    payday: 'Moved in on payday', bills: 'Bills paid', covers: 'Overspend covers', 'built-up': 'Built-up money moved out', settled: 'Settled up',
    'set-aside': setAside ? 'Moved in from pots' : `Moved to ${phrase}`, paid: `Paid to ${card?.name ?? 'the card'}`,
    // Checking the Amex pot: extra moved out of it to the buffer, or a top-up from the buffer.
    gap: setAside ? (pence < 0 ? 'Extra moved out' : 'Topped up') : pence > 0 ? `Extra from ${phrase}` : `Topped up ${phrase}`,
  }[flow]
}

/** "Waiting to move · November bill", or "Waiting to settle · October statement" on a statement that settles once. */
function waitingLabel(document: BudgetDocument, statementKey: string, closeDate: string) {
  const card = cardTracker(document).cards.find(row => row.id === parseStatementKey(statementKey)?.cardId)
  return usesSetAside(card, statementKey) ? `Waiting to move · ${billName(closeDate)}` : `Waiting to settle · ${statementName(closeDate)}`
}

/** In the pot, worked out: last checked, every move since. A carry-over pot goes on to Spare: less what's waiting and bills due. */
function BalanceSums({ document, balance, bank, spare = false }: { document: BudgetDocument; balance: PotBalance; bank: string; spare?: boolean }) {
  // Money in the pot that isn't spare: card spend waiting to move, and bills still to come out this month.
  const held = spare && (balance.waiting.length > 0 || balance.billsDuePence > 0)
  return <dl className="carry-over-sums">
    {balance.checked ? <div><dt>In {bank} · checked {dayOf(balance.checked.at)}</dt><dd>{signedPounds(balance.checked.pence)}</dd></div> : <div><dt>Not checked yet</dt><dd>—</dd></div>}
    {balance.since.map(row => <div key={row.flow}><dt>{flowLabel(row.flow, document, balance.setAside, row.pence)} since</dt><dd>{row.pence > 0 ? '+' : ''}{signedPounds(row.pence)}</dd></div>)}
    {balance.balancePence !== undefined && balance.since.length > 0 && <div className={held ? 'is-subtotal' : 'is-total'}><dt>In the pot</dt><dd>{signedPounds(balance.balancePence)}</dd></div>}
    {held && balance.waiting.map(row => <div key={row.statementKey}><dt>{waitingLabel(document, row.statementKey, row.closeDate)}</dt><dd>{signedPounds(-row.pence)}</dd></div>)}
    {held && balance.billsDuePence > 0 && <div><dt>Bills still due this month</dt><dd>{signedPounds(-balance.billsDuePence)}</dd></div>}
    {held && balance.freePence !== undefined && <div className="is-total"><dt>Spare</dt><dd>{signedPounds(balance.freePence)}</dd></div>}
  </dl>
}

/** "Checked against Monzo Sat 31 Oct", or "Worked out from Monzo on Sat 31 Oct" once anything has moved since. */
const knownText = (bank: string, checkedAt: string | undefined, fresh: boolean) => !checkedAt ? `Not checked against ${bank} yet` : fresh ? `Checked against ${bank} ${dayOf(checkedAt)}` : `Worked out from ${bank} on ${dayOf(checkedAt)}`

/**
 * In the pot (D2, P1): a Tracked pot's sum, Left this month + Waiting to move + Carried over = In the pot, with Not
 * explained when the bank's figure differs. Other kinds show In the pot and what's waiting. Before the first check
 * there's no In the pot, just the parts North knows and Check against Monzo.
 */
function PotSumSection({ document, potId, month, today, onCheck }: { document: BudgetDocument; potId: string; month: string; today: string; onCheck: () => void }) {
  const bank = bankOf(document, potId)
  const sum = potSum(document, potId, month, today)
  const balance = potBalance(document, potId, today)
  const tracked = sum.leftPence !== undefined
  return <Section title="In the pot" count={sum.inPotPence === undefined ? undefined : signedPounds(sum.inPotPence)}>
    <dl className="carry-over-sums pot-sum" aria-label={`${document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'}: in the pot`}>
      {tracked && <div><dt>Left this month</dt><dd>{signedPounds(sum.leftPence!)}</dd></div>}
      {sum.waiting.map(row => <div key={row.statementKey}><dt>{waitingLabel(document, row.statementKey, row.closeDate)}</dt><dd>{signedPounds(row.pence)}</dd></div>)}
      {tracked && sum.carriedOverPence !== 0 && <div><dt>Carried over</dt><dd>{signedPounds(sum.carriedOverPence!)}</dd></div>}
      {!!sum.notExplainedPence && <div className="is-different"><dt>Not explained</dt><dd>{signedPounds(sum.notExplainedPence)}</dd></div>}
      <div className="is-total"><dt>In the pot</dt><dd>{sum.inPotPence === undefined ? '—' : signedPounds(sum.inPotPence)}</dd></div>
    </dl>
    <p className="pot-balance-line">{knownText(bank, sum.checkedAt, sum.fresh)}</p>
    {(sum.inPotPence === undefined || !!sum.notExplainedPence) && <p className="pot-balance-line"><button type="button" className="text-button" onClick={onCheck}>Check against {bank}</button></p>}
    {balance.since.length > 0 && <details className="pot-balance-how"><summary>How In the pot is worked out</summary><BalanceSums document={document} balance={balance} bank={bank}/></details>}
  </Section>
}

/** A carry-over pot: what's spare, with how it's worked out. */
function CarryOver({ document, potId, today }: { document: BudgetDocument; potId: string; today: string }) {
  const bank = bankOf(document, potId)
  const balance = potBalance(document, potId, today)
  return <>
    <section className="pot-lead" aria-labelledby={`pot-spare-${potId}`}>
      <p className="pot-lead-label" id={`pot-spare-${potId}`}>Spare</p>
      <p className="pot-lead-value">{balance.freePence === undefined ? '—' : signedPounds(balance.freePence)}</p>
      <BalanceSums document={document} balance={balance} bank={bank} spare/>
    </section>
  </>
}

/** Spending › Transactions from a pot page: one transaction in view, or every transaction on this pot. */
export type OpenTransactions = (target: { transactionId?: string; destinationKey?: string }) => void

type DetailProps = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; potId: string; month: string; today: string; onBack: () => void; onOpenSettings?: () => void; onOpenTransactions?: OpenTransactions; onSort?: () => void; onOpenRules?: () => void; onOpenStatement?: (statementKey: string) => void }

/** The pot page's header: "Month › Groceries", its kind, Check against Monzo and ⋯ › See in Spending, Pot settings. */
function PotHeader({ title, context, bank, onBack, month, onCheck, onOpenSettings, onSeeInSpending }: { title: string; context: ReactNode; bank: string; onBack: () => void; month: string; onCheck: () => void; onOpenSettings?: () => void; onSeeInSpending?: () => void }) {
  // Phones move the header into the app header, which has no breadcrumb; the way back sits on the pine band instead.
  const mobile = useMobilePresentation()
  return <>{mobile && <Breadcrumb items={[{ label: 'Month', onClick: onBack }, { label: title }]}/>}<PageHeader titleText={title} title={title} monthLabel={formatMonth(month)} context={context} breadcrumb={mobile ? undefined : [{ label: 'Month', onClick: onBack }, { label: title }]}
    actions={<>
      <button type="button" className="secondary-button" onClick={onCheck}>Check against {bank}</button>
      {(onOpenSettings || onSeeInSpending) && <BudgetOptionsMenu label={`More ${title} options`} options={[
        ...onSeeInSpending ? [{ label: 'See in Spending', onSelect: onSeeInSpending }] : [],
        ...onOpenSettings ? [{ label: 'Pot settings', onSelect: onOpenSettings }] : [],
      ]}/>}
    </>}/></>
}

/**
 * The Amex pot: In the Amex pot and its check (extra or short evened up), then one sum per bill it pays (D1), oldest
 * first: In the Amex pot + To move + To sort = the bill.
 */
function SetAsidePot({ document, setDocument, potId, onBack, month, today, onOpenSettings, onOpenStatement }: DetailProps) {
  const pot = document.budget.pots.find(row => row.id === potId)!
  const card = cardTracker(document).cards.find(row => row.setAside?.potId === potId)!
  const bank = bankOf(document, potId)
  const [checking, setChecking] = useState(false)
  const balance = potBalance(document, potId, today)
  const bills = potBills(document, card.id, today)
  const title = /\bpot$/i.test(pot.name.trim()) ? pot.name.trim() : `${pot.name.trim()} pot`
  return <div className="pot-detail">
    <PotHeader title={title} context={`Pays the ${card.name} from the ${statementName(card.setAside!.fromCloseDate)}`} bank={bank} month={month} onBack={onBack} onCheck={() => setChecking(true)} onOpenSettings={onOpenSettings}/>
    <SetAsideCheckLead document={document} setDocument={setDocument} cardId={card.id} today={today} bank={bank} onCheck={() => setChecking(true)} onOpenStatement={onOpenStatement}/>
    {balance.checked && balance.since.length > 0 && <details className="pot-balance-how"><summary>How In the pot is worked out</summary><BalanceSums document={document} balance={balance} bank={bank}/></details>}
    <Section title="Bills it pays" count={bills.length > 1 ? plural(bills.length, 'bill') : undefined}>
      {bills.length ? <ul className="pot-list" aria-label="Bills it pays">{bills.map(bill => <li key={bill.statementKey}>
        <ListRow title={billName(bill.closeDate, bill.open)} meta={billParts(bill, potPhrase(pot.name))} trailing={signedPounds(bill.billPence)}
          {...onOpenStatement ? { onOpen: () => onOpenStatement(bill.statementKey), label: `${billName(bill.closeDate, bill.open)}, ${signedPounds(bill.billPence)}, open it in Spending` } : {}}/>
      </li>)}</ul> : <p className="pot-none">Nothing to pay from {potPhrase(pot.name)} yet.</p>}
    </Section>
    {checking && <CheckBalance potName={pot.name} bank={bank} onClose={() => setChecking(false)} onSave={pence => { setDocument(current => checkPotBalance(current, potId, pence, new Date())); setChecking(false) }}/>}
  </div>
}

/**
 * Where it went (F4): the pot's card spend by brand, up to five bars then Other. Tapping a bar shows only those
 * transactions in the list below; tapping it again (or Show all) shows them all.
 */
function WhereItWent({ rows, selected, onSelect }: { rows: MerchantRow[]; selected: string | null; onSelect: (brand: string | null) => void }) {
  const max = Math.max(1, ...rows.map(row => row.pence))
  return <Section title="Where it went" aside={selected && <button type="button" className="text-button" onClick={() => onSelect(null)}>Show all</button>}>
    <ul className="pot-merchants" aria-label="Where it went">{rows.map(row => <li key={row.brand}>
      <button type="button" className="pot-merchant" aria-pressed={selected === row.brand} aria-label={`${row.brand}, ${signedPounds(row.pence)}${row.count > 1 ? `, ${row.count} transactions` : ''}`} onClick={() => onSelect(selected === row.brand ? null : row.brand)}>
        <span className="pot-merchant-top"><span className="pot-merchant-name">{row.brand}{row.count > 1 && <span className="pot-merchant-count"> · {row.count} transactions</span>}</span><span className="pot-merchant-amount">{signedPounds(row.pence)}</span></span>
        <span className="pot-merchant-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, row.pence) / max * 100}%` }}/></span>
      </button>
    </li>)}</ul>
  </Section>
}

/**
 * Sorts itself here (Spending ↔ Month link F6): the rules that send transactions to this pot, each opening Settings ›
 * Sorting rules, and a "Make rule" for a merchant sorted here by hand twice or more (decision L7). Nothing to show, no
 * section.
 */
function SortsItselfHere({ document, setDocument, destination, potName, onOpenRules }: { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; destination: BudgetDestination; potName: string; onOpenRules?: () => void }) {
  const [message, setMessage] = useState('')
  const tracker = cardTracker(document)
  const rules = rulesFor(tracker, destination)
  const suggested = ruleSuggestions(tracker, destination)
  if (!rules.length && !suggested.length) return null
  const holder = (suffix: string) => {
    const personId = tracker.cards.flatMap(card => card.cardholders).find(row => row.suffix === suffix)?.personId
    return document.household.adults.find(person => person.id === personId)?.name
  }
  const make = (suggestion: RuleSuggestion) => {
    const at = new Date()
    const draft = { contains: suggestion.contains, destination }
    const { alsoSorted } = addRule(document, draft, at)
    setDocument(current => addRule(current, draft, at).document)
    setMessage(`Rule added.${alsoSorted ? ` It also sorted ${alsoSorted} more.` : ''}`)
  }
  return <Section title="Sorts itself here" aside={onOpenRules && <button type="button" className="text-button" onClick={onOpenRules}>Sorting rules</button>}>
    <ul className="pot-list" aria-label="Sorts itself here">
      {rules.map(rule => { const person = rule.cardSuffix ? holder(rule.cardSuffix) : undefined; return <li key={rule.id}><ListRow title={rule.contains} meta={`Your rule${rule.cardSuffix ? ` · only on ${person ? `${person}’s` : 'one'} card` : ''}`}
        {...onOpenRules ? { onOpen: onOpenRules, label: `${rule.contains}, your rule, open Sorting rules` } : {}}/></li> })}
      {suggested.map(suggestion => <li key={suggestion.contains}><ListRow title={suggestion.merchant} meta={`Sorted here ${suggestion.count} times · a rule for “${suggestion.contains}”`}
        trailing={<button type="button" className="secondary-button pot-make-rule" aria-label={`Make rule: “${suggestion.contains}” to ${potName}`} onClick={() => make(suggestion)}>Make rule</button>}/></li>)}
    </ul>
    <p className="pot-rules-message" role="status">{message}</p>
  </Section>
}

/**
 * A pot's page (Month › Groceries): what's left this month and how fast, with the pace chart and one run-out line;
 * the balance in one line with the sums folded; then its transactions.
 */
export function PotDetail({ document, setDocument, potId, month, today = localDate(), onBack, onOpenSettings, onOpenTransactions, onSort, onOpenRules, onOpenStatement }: DetailProps) {
  const pot = document.budget.pots.find(row => row.id === potId)
  const [checking, setChecking] = useState(false)
  // Try an amount: what's typed, kept here so a typical shop's Try it can fill it.
  const [tryValue, setTryValue] = useState('')
  // A brand picked in Where it went: the transactions list shows only its rows.
  const [brand, setBrand] = useState<string | null>(null)
  const figures = monthSpending(document, month, today)
  const destination: BudgetDestination = { kind: 'pot', potId }
  const row = figures.rows.find(item => item.key === `pot:${potId}`)
  const transactions = destinationTransactions(cardTracker(document), month, destination)
  const breakdown = merchantBreakdown(transactions, destination)
  const merchants = [...breakdown.rows, ...breakdown.other ? [breakdown.other] : []]
  const picked = merchants.find(row => row.brand === brand)
  const shownTransactions = picked ? transactions.filter(transaction => picked.transactionIds.includes(transaction.id)) : transactions
  const bills = monthBills(document, month, today).filter(bill => bill.destination.kind === 'pot' && bill.destination.potId === potId)
  const owners = document.budget.accounts.find(account => account.id === pot?.accountId)?.ownerPersonIds ?? []
  const ownerLabel = owners.length > 1 ? 'Joint' : document.household.adults.find(person => person.id === owners[0])?.name ?? 'Pot'
  if (!pot) return <p className="pot-none">That pot no longer exists. <button type="button" className="text-button" onClick={onBack}>Back to Month</button></p>
  if (cardTracker(document).cards.some(card => card.setAside?.potId === potId)) return <SetAsidePot document={document} setDocument={setDocument} potId={potId} month={month} today={today} onBack={onBack} onOpenSettings={onOpenSettings} onOpenStatement={onOpenStatement}/>
  const bank = bankOf(document, potId)
  const carriesOver = row?.carriesOver || !row && !!document.card?.pots[potId]?.carriesOver
  const kind = potKind(document, potId)
  const week = row && kind === 'tracked' && figures.when === 'current' ? weekFigures(row.leftPence, month, today) : undefined
  const shop = row && kind === 'tracked' ? typicalShop(document, potId, today) : undefined
  const tryable = figures.when === 'current' && (kind === 'funded-only' || kind === 'tracked' && !!row)
  const steady = row?.pace === 'steady' && !row.carriesOver && row.plannedPence > 0
  const daysLeft = figures.daysLeft
  const allowance = row && figures.when === 'current' && row.leftPence > 0 && daysLeft > 0 ? row.leftPence / daysLeft : undefined
  const average = row && figures.day > 0 ? (row.spentPence + row.takenPence) / figures.day : undefined
  const chartLabel = row ? `${pot.name} spending ${figures.when === 'current' ? 'so far' : `in ${monthName(month)}`} against the plan: ${pounds(row.spentPence)} spent${figures.when === 'current' ? ` by day ${figures.day}` : ''}${row.expectedPence !== undefined ? `, against ${pounds(row.expectedPence)} at the planned pace` : ''}, of ${pounds(row.plannedPence)} planned.${row.runsOut && row.status === 'ahead' ? ` Runs out around ${dayDate(row.runsOut)}.` : ''}` : ''
  const lineAmount = (transaction: CardTransaction) => transaction.sort!.lines.filter(line => line.destination.kind === 'pot' && line.destination.potId === potId).reduce((sum, line) => sum + line.amountPence, 0)
  const context = `${ownerLabel} · ${carriesOver ? 'carries over' : kind ? POT_KIND_LABELS[kind] : 'monthly'} · ${formatMonth(month)}${figures.when === 'current' ? ` · day ${figures.day} of ${figures.daysInMonth}` : ''}`
  // Month → Spending (F1): the pot's transactions, filtered; or one of them, in view.
  const seeInSpending = onOpenTransactions && (() => onOpenTransactions({ destinationKey: `pot:${potId}` }))

  return <div className="pot-detail">
    <PotHeader title={pot.name} context={context} bank={bank} month={month} onBack={onBack} onCheck={() => setChecking(true)} onOpenSettings={onOpenSettings} onSeeInSpending={seeInSpending}/>
    {carriesOver ? <><CarryOver document={document} potId={potId} today={today}/>{row && bills.length > 0 && <PotMonthFigures document={document} row={row}/>}</>
      : kind === 'funded-only' || kind === 'saving' ? <>
        {kind === 'saving' ? <SavingLead document={document} potId={potId} month={month} today={today}/> : <FundedLead document={document} potId={potId} month={month} today={today} bank={bank} onCheck={() => setChecking(true)}/>}
        {tryable && <TryAnAmount document={document} potId={potId} today={today} bank={bank} month={month} value={tryValue} onChange={setTryValue}/>}
        {bills.length > 0 && <BillsThisMonth document={document} bills={bills} month={month} today={today}/>}
        <PotSumSection document={document} potId={potId} month={month} today={today} onCheck={() => setChecking(true)}/>
      </>
      : !row ? <><p className="pot-none">Nothing planned or spent in {monthName(month)}.</p><PotSumSection document={document} potId={potId} month={month} today={today} onCheck={() => setChecking(true)}/></> : <>
      <section className="pot-lead" aria-labelledby="pot-lead-label">
        <p className="pot-lead-label" id="pot-lead-label">{row.leftPence < 0 ? 'Over this month' : 'Left this month'}</p>
        <p className="pot-lead-value">{pounds(Math.abs(row.leftPence))}{row.leftPence >= 0 && figures.when === 'current' && <small> for {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</small>}</p>
        {steady && allowance !== undefined && average !== undefined && <p className="pot-lead-pace">About {whole(allowance)} a day · you’ve averaged {whole(average)}</p>}
        {!(steady && figures.when === 'current' && row.leftPence >= 0) && <p className={`pot-lead-status is-${row.status}`}>{statusText(row, figures)}</p>}
        <WeekLines {...week ? { week } : {}} {...shop ? { shop } : {}} onTry={pence => setTryValue((pence / 100).toFixed(2))}/>
        {bills.length > 0 && <p className="pot-lead-bills">{[row.duePence ? `${pounds(row.duePence)} of it due` : '', spentParts(document, row)].filter(Boolean).join(' · ')}</p>}
        {steady && figures.when !== 'future' && <PaceChart document={document} month={month} row={row} figures={figures} label={chartLabel}/>}
        {row.status === 'ahead' && row.runsOut && <p className="pot-runout">At this rate it runs out around {dayDate(row.runsOut)}, {daysBetween(row.runsOut, `${month}-${String(figures.daysInMonth).padStart(2, '0')}`)} days before the month ends.</p>}
        {figures.when !== 'future' && <p className="pot-freshness"><FreshnessLine document={document} onSort={onSort}/></p>}
      </section>
      {tryable && <TryAnAmount document={document} potId={potId} today={today} bank={bank} month={month} value={tryValue} onChange={setTryValue}/>}
      {bills.length > 0 && <BillsThisMonth document={document} bills={bills} month={month} today={today}/>}
      <PotSumSection document={document} potId={potId} month={month} today={today} onCheck={() => setChecking(true)}/>
      <CarriedOverList document={document} potId={potId} month={month}/>
      <LastMonths document={document} potId={potId} month={month} today={today}/>
    </>}
    {carriesOver && bills.length > 0 && <BillsThisMonth document={document} bills={bills} month={month} today={today}/>}
    <YearlyBillsSetAside document={document} potId={potId} month={month} today={today}/>
    {merchants.length > 0 && <WhereItWent rows={merchants} selected={picked ? picked.brand : null} onSelect={setBrand}/>}
    <Section title="Transactions" count={picked ? `${picked.brand} only` : undefined} aside={seeInSpending && transactions.length > 0 && <button type="button" className="text-button" onClick={seeInSpending}>See in Spending</button>}>
      {transactions.length ? <ul className="pot-list" aria-label="Transactions">{shownTransactions.map(transaction => <li key={transaction.id}>
        <ListRow title={transaction.description} meta={`${transactionMeta(document, transaction)}${statementNote(transaction, month)}${lineAmount(transaction) !== transaction.amountPence ? ` · part of ${signedPounds(transaction.amountPence)}` : ''}`} trailing={<span className={lineAmount(transaction) < 0 ? 'pot-credit' : undefined}>{signedPounds(lineAmount(transaction))}</span>}
          {...onOpenTransactions ? { onOpen: () => onOpenTransactions({ transactionId: transaction.id }), label: `${transaction.description}, ${signedPounds(lineAmount(transaction))}, ${transactionMeta(document, transaction)}, open in Spending` } : {}}/>
      </li>)}</ul> : <p className="pot-none">No transactions in {monthName(month)}.</p>}
    </Section>
    <SortsItselfHere document={document} setDocument={setDocument} destination={destination} potName={pot.name} {...onOpenRules ? { onOpenRules } : {}}/>
    {checking && <CheckBalance potName={pot.name} bank={bank} onClose={() => setChecking(false)} onSave={pence => { setDocument(current => checkPotBalance(current, potId, pence, new Date())); setChecking(false) }}/>}
  </div>
}
