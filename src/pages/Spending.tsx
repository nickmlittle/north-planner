import { useRef, useState, useSyncExternalStore, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, CreditCard, FileSpreadsheet, PiggyBank, Plus } from 'lucide-react'
import { MOBILE_QUERY } from '../breakpoints'
import { PageFrame } from '../components/PageFrame'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, localDate, type CardTransaction } from '../domain/cardTracker'
import { allTransactions, checkRuleSorts, lastImport, sortDestination, transactionsToSort, uncheckedRuleSorts } from '../domain/cardSorting'
import type { SpendingSection } from '../state/navigation'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { BringInSheet } from './BringInSheet'
import { destinationNamer, shortDate } from './cardLabels'
import { payments, refundsOf } from '../domain/cardRefunds'
import { ManualEntrySheet } from './ManualEntrySheet'
import { SortSheet } from './SortSheet'
import { SplitEditor } from './SplitEditor'
import { StatementsPanel } from './StatementsPanel'
import { SortTable } from './SortTable'
import { SpendingSide } from './SpendingSide'
import { splitLabel } from '../domain/cardSplits'
import { dayOf, plural, pounds, signedPounds, transactionMeta } from './spendingFormat'
import { movedByTransaction, moveState, potPhrase, toMove, undoMove, usesSetAside, type MoveState } from '../domain/setAside'
import { MoveToPotSheet } from './MoveToPotSheet'
import { CheckBalancesSheet } from './CheckBalancesSheet'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  view: SpendingSection
  onSelectView: (view: SpendingSection) => void
  /** Settings › Cards, to add the card. */
  onOpenCardSettings: () => void
  /** Month's pots (or one pot's page): the side rail links there. */
  onOpenMonth: (potId?: string) => void
  /** A statement's detail on Statements. */
  statementKey?: string | null
  onOpenStatement?: (key: string | null) => void
  /** Today, for pace; tests pass a fixed one. */
  today?: string
}

type Section = { id: SpendingSection; label: string; count?: number; desktopOnly?: boolean }

const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches

/** Refunds and their purchases point at each other: "Refund of COSTCO £186.40 · 24 Oct", "Refunded −£14.99 · 6 Nov". */
function transactionLink(document: BudgetDocument, transaction: CardTransaction): string {
  const tracker = cardTracker(document)
  const purchase = transaction.refundOf ? tracker.transactions.find(row => row.id === transaction.refundOf!.transactionId) : undefined
  if (purchase) return `Refund of ${purchase.description} ${signedPounds(purchase.amountPence)} · ${shortDate(purchase.date)}`
  return transaction.kind === 'purchase' ? refundsOf(tracker, transaction.id).map(row => `Refunded ${signedPounds(row.amountPence)} · ${shortDate(row.date)}`).join(' · ') : ''
}

/** One transaction: what, when, whose card, how much, and where it went. A button when it can be sorted. */
export function TransactionRow({ document, transaction, where, tag, moved, action, onSelect }: { document: BudgetDocument; transaction: CardTransaction; where?: string; tag?: string; moved?: MoveState; action?: string; onSelect?: () => void }) {
  // Read as one phrase: "TESCO, £62.40, Tue 10 Nov · Ada ··41001, Groceries · Monzo Joint, rule".
  const link = transactionLink(document, transaction)
  const movedTag = moved === 'moved' ? 'Moved' : moved === 'changed' ? 'Changed since moved' : ''
  const label = [transaction.description, signedPounds(transaction.amountPence), `${transactionMeta(document, transaction)}${transaction.kind === 'refund' ? ' · refund' : ''}`, link, where, tag?.toLowerCase(), movedTag.toLowerCase(), action].filter(Boolean).join(', ')
  const body = <>
    <span className="spending-row-main"><span className="spending-row-title">{transaction.description}</span><span className="spending-row-amount">{signedPounds(transaction.amountPence)}</span></span>
    <span className="spending-row-meta"><span>{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span>
      {link && <span className="spending-row-link">{link}</span>}
      {(where || action) && <span className="spending-row-where">{where}{tag && <span className="spending-tag">{tag}</span>}{movedTag && <span className={`spending-tag is-${moved}`}>{movedTag}</span>}{action && <span className="spending-row-action">{action}</span>}</span>}</span>
  </>
  const className = `spending-row${transaction.amountPence < 0 ? ' is-credit' : ''}`
  const row = onSelect ? <button type="button" className={className} data-transaction={transaction.id} aria-label={label} onClick={onSelect}>{body}</button> : <div className={className}>{body}</div>
  const lines = transaction.sort && transaction.sort.lines.length > 1 ? transaction.sort.lines : null
  if (!lines) return row
  const name = destinationNamer(document)
  return <>{row}<ul className="spending-row-lines" aria-label={`${transaction.description} split`}>{lines.map((line, index) => <li key={index}><span>{name(line.destination)}{line.item ? ` · ${line.item}` : ''}{line.note ? ` · ${line.note}` : ''}</span><span>{signedPounds(line.amountPence)}</span></li>)}</ul></>
}

/** The Spending tab: bring in the Amex export, sort what the rules couldn't, check the rules, and (in later PRs) track and settle. */
export function Spending({ document, setDocument, view, onSelectView, onOpenCardSettings, onOpenMonth, statementKey = null, onOpenStatement = () => {}, today = localDate() }: Props) {
  const compact = useSyncExternalStore(subscribeMobile, getMobile, () => false)
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const [sheet, setSheet] = useState<'bring-in' | 'manual' | null>(null)
  const [sorting, setSorting] = useState<string | null>(null)
  const [splitting, setSplitting] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [message, setMessageText] = useState('')
  const [undoId, setUndoId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [checkingBalances, setCheckingBalances] = useState(false)
  const setMessage = (text: string) => { setMessageText(text); setUndoId(null) }
  const tabRefs = useRef<Partial<Record<SpendingSection, HTMLButtonElement | null>>>({})
  const toSort = transactionsToSort(tracker)
  const byRules = uncheckedRuleSorts(tracker)
  const sections: Section[] = [
    { id: 'sort', label: 'To sort', count: toSort.length },
    { id: 'statements', label: 'Statements' },
    { id: 'transactions', label: 'All transactions', desktopOnly: true },
  ]
  const active = sections.find(section => section.id === view)?.id ?? 'sort'
  // Phones keep the tabs to the everyday sections and put the rest under ⋯.
  const tabs = compact ? sections.filter(section => !section.desktopOnly) : sections
  const more = compact ? sections.filter(section => section.desktopOnly) : []
  const moreMenu = more.length > 0 && <BudgetOptionsMenu label="More Spending sections" options={more.map(section => ({ label: section.label, onSelect: () => onSelectView(section.id) }))}/>
  const navInHeading = tabs.length <= 1
  const headingExtra = navInHeading ? moreMenu : null
  const latest = lastImport(tracker)
  const sortedThrough = tracker.transactions.reduce<string | undefined>((max, row) => !max || row.date > max ? row.date : max, undefined)
  const sortingTransaction = tracker.transactions.find(row => row.id === sorting)
  const splittingTransaction = tracker.transactions.find(row => row.id === splitting)
  // The set-aside pot (the Amex pot): what's sorted but not moved into it yet, and each row's state.
  const setAsideCard = tracker.cards.find(card => card.setAside)
  const setAsidePot = document.budget.pots.find(pot => pot.id === setAsideCard?.setAside?.potId)
  const pending = setAsideCard ? toMove(document, setAsideCard.id) : []
  const pendingPence = pending.reduce((sum, row) => sum + row.pence, 0)
  const moves = movedByTransaction(tracker)
  const movedOf = (transaction: CardTransaction): MoveState | undefined => {
    const card = tracker.cards.find(row => row.id === transaction.cardId)
    return transaction.kind !== 'payment' && usesSetAside(card, transaction.statementKey) ? moveState(transaction, moves.get(transaction.id)) : undefined
  }

  if (!tracker.cards.length) return <PageFrame className="spending-page" title="Spending" contentWidth="narrow">
    <div className="spending-empty"><CreditCard aria-hidden="true"/><h2>Add your card first</h2><p>Set up the Amex in Settings: when its statement closes and when it’s due. Then bring in its transactions here.</p><button type="button" className="primary-button" onClick={onOpenCardSettings}>Set up a card</button></div>
  </PageFrame>

  const onTabKey = (event: KeyboardEvent) => {
    const index = tabs.findIndex(section => section.id === active)
    const next = { ArrowRight: tabs[(index + 1) % tabs.length], ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length], Home: tabs[0], End: tabs.at(-1) }[event.key]
    if (!next) return
    event.preventDefault(); onSelectView(next.id); tabRefs.current[next.id]?.focus()
  }
  const where = (transaction: CardTransaction) => {
    const destination = sortDestination(transaction.sort)
    return transaction.sort ? destination ? name(destination) : splitLabel(transaction.sort.lines) : 'To sort'
  }

  const summary = <div className="spending-summary">
    <p className="spending-last"><strong>{tracker.cards.map(card => card.name).join(' · ')}</strong><span>{latest ? `Last brought in ${dayOf(latest.at)}` : 'Nothing brought in yet'}{!compact && sortedThrough ? ` · sorted to ${shortDate(sortedThrough)}` : ''}</span></p>
    <div className="spending-actions">
      <button type="button" className="primary-button" onClick={() => setSheet('bring-in')}><FileSpreadsheet aria-hidden="true"/>Bring in transactions</button>
      <button type="button" className="secondary-button" onClick={() => setSheet('manual')}><Plus aria-hidden="true"/>Add a transaction</button>
    </div>
  </div>

  const sortPanel = <>
    <div className="spending-section-heading"><h2 id="spending-sort-title">To sort</h2><span>{toSort.length ? plural(toSort.length, 'transaction') : ''}</span>{headingExtra}</div>
    {toSort.length ? compact ? <ul className="spending-list">{toSort.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} action="Choose" onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
      : <SortTable document={document} setDocument={setDocument} transactions={toSort} onSorted={setMessage} onSplit={setSplitting} onOpen={setSorting}/>
      : <p className="spending-none">{tracker.transactions.length ? 'Everything is sorted.' : 'Nothing to sort. Bring in new transactions to start.'}</p>}
    {byRules.length > 0 && <section className="spending-rule-sorts" aria-labelledby="spending-rules-title">
      <div className="spending-section-heading"><h2 id="spending-rules-title">Sorted by rules · {byRules.length}</h2>
        <button type="button" className="text-button spending-disclosure" aria-expanded={checking} aria-controls="spending-rule-sorts" onClick={() => setChecking(value => !value)}>{checking ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}Check</button></div>
      {checking && <div id="spending-rule-sorts" className="spending-rule-sorts-body">
        <p className="rules-lead">Change any of these, and North offers to change the rule too.</p>
        <ul className="spending-list">{byRules.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} where={where(transaction)} tag={transaction.refundOf && !transaction.sort?.ruleId ? 'Refund' : 'Rule'} onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
        <button type="button" className="secondary-button" onClick={() => { setDocument(current => checkRuleSorts(current, byRules.map(row => row.id), new Date())); setChecking(false); setMessage(`${plural(byRules.length, 'rule sort')} checked.`) }}>They all look right</button>
      </div>}
    </section>}
  </>
  const all = allTransactions(tracker)
  const paid = payments(tracker)
  const allPanel = <>
    <div className="spending-section-heading"><h2 id="spending-all-title">All transactions</h2><span>{all.length ? plural(all.length, 'transaction') : ''}</span>{headingExtra}</div>
    {all.length ? <ul className="spending-list">{all.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} where={where(transaction)} tag={transaction.sort?.by === 'rule' ? transaction.refundOf && !transaction.sort.ruleId ? 'Refund' : 'Rule' : undefined} moved={movedOf(transaction)} onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
      : <p className="spending-none">Nothing brought in yet.</p>}
    {paid.length > 0 && <section className="spending-payments" aria-labelledby="spending-payments-title">
      <div className="spending-section-heading"><h2 id="spending-payments-title">Payments to {tracker.cards[0]!.name}</h2><span>Never sorted</span></div>
      <ul className="spending-list">{paid.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction}/></li>)}</ul>
    </section>}
  </>

  return <PageFrame className="spending-page" title="Spending" contentWidth="wide" summary={summary}>
    <p className="budget-manage-message spending-message" role="status">{message}{undoId && <> <button type="button" className="text-button" onClick={() => { setDocument(current => undoMove(current, undoId)); setMessage('Move undone. Those transactions are back on the list to move.') }}>Undo</button> · <button type="button" className="text-button" onClick={() => setCheckingBalances(true)}>Check balances</button></>}</p>
    {setAsidePot && pending.length > 0 && <div className="move-callout">
      <PiggyBank aria-hidden="true"/>
      <p><strong>{pendingPence < 0 ? `${pounds(-pendingPence)} to come back out of ${potPhrase(setAsidePot.name)}` : pendingPence ? `${pounds(pendingPence)} to move to ${potPhrase(setAsidePot.name)}` : `${potPhrase(setAsidePot.name).replace(/^t/, 'T')} needs updating`}</strong><span>{plural(pending.length, 'transaction')} sorted since the last move</span></p>
      <button type="button" className="secondary-button" onClick={() => setMoving(true)}>Move to {potPhrase(setAsidePot.name)}</button>
    </div>}
    {!navInHeading && <div className="spending-nav">
      <div className="spending-tabs" role="tablist" aria-label="Spending" onKeyDown={onTabKey}>{tabs.map(section => <button key={section.id} ref={element => { tabRefs.current[section.id] = element }} type="button" role="tab" id={`spending-tab-${section.id}`} aria-selected={active === section.id} aria-controls="spending-panel" tabIndex={active === section.id || !tabs.some(tab => tab.id === active) && section.id === tabs[0]!.id ? 0 : -1} onClick={() => onSelectView(section.id)}>{section.label}{section.count ? ` · ${section.count}` : ''}</button>)}</div>
      {moreMenu}
    </div>}
    {compact && more.some(section => section.id === active) && <button type="button" className="text-button spending-back" onClick={() => onSelectView('sort')}>Back to To sort</button>}
    <div className={`spending-layout${!compact && (active === 'sort' || active === 'transactions') ? ' has-side' : ''}`}>
    <section id="spending-panel" className="spending-panel" {...tabs.length > 1 && tabs.some(tab => tab.id === active) ? { role: 'tabpanel', 'aria-labelledby': `spending-tab-${active}` } : {}}>
      {active === 'sort' ? sortPanel : active === 'transactions' ? allPanel
        : <StatementsPanel document={document} setDocument={setDocument} today={today} statementKey={statementKey} onOpenStatement={onOpenStatement} onSort={() => onSelectView('sort')} onBringIn={() => setSheet('bring-in')} headingExtra={headingExtra}/>}
    </section>
    {!compact && (active === 'sort' || active === 'transactions') && <SpendingSide document={document} today={today} onOpenMonth={() => onOpenMonth()} onOpenPot={potId => onOpenMonth(potId)} onOpenStatement={key => { onSelectView('statements'); onOpenStatement(key) }}/>}
    </div>
    {sortingTransaction && <SortSheet document={document} setDocument={setDocument} transaction={sortingTransaction} today={today} onClose={() => setSorting(null)} onSorted={text => { setSorting(null); setMessage(text) }} onSplit={() => { setSorting(null); setSplitting(sortingTransaction.id) }}/>}
    {splittingTransaction && <SplitEditor document={document} setDocument={setDocument} transaction={splittingTransaction} onClose={() => setSplitting(null)} onSaved={text => { setSplitting(null); setMessage(text) }}/>}
    {sheet === 'bring-in' && <BringInSheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onSort={() => { setSheet(null); onSelectView('sort') }}/>}
    {moving && setAsideCard && <MoveToPotSheet document={document} setDocument={setDocument} cardId={setAsideCard.id} onClose={() => setMoving(false)} onMoved={(text, id) => { setMoving(false); setMessageText(text); setUndoId(id) }}/>}
    {checkingBalances && <CheckBalancesSheet document={document} setDocument={setDocument} onClose={() => setCheckingBalances(false)} onSaved={text => { setCheckingBalances(false); setMessage(text) }}/>}
    {sheet === 'manual' && <ManualEntrySheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onAdded={description => { setSheet(null); setMessage(`Added ${description}.`) }}/>}
  </PageFrame>
}
