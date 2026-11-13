import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { EmptyState, ListRow, PageHeader, Section, StatusChip, Tabs, useMobilePresentation, useStepCopy } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, localDate, type CardTransaction } from '../domain/cardTracker'
import { checkRuleSorts, lastImport, sortDestination, suggestions, transactionsToSort, uncheckedRuleSorts } from '../domain/cardSorting'
import { statementKeys, statementSummary } from '../domain/cardStatements'
import { potBalance } from '../domain/potBalances'
import type { SpendingSection } from '../state/navigation'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { BringInSheet } from './BringInSheet'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { refundPlan, refundPurchase } from '../domain/cardRefunds'
import { ManualEntrySheet } from './ManualEntrySheet'
import { SortSheet } from './SortSheet'
import { SplitEditor } from './SplitEditor'
import { StatementsPanel } from './StatementsPanel'
import { SortTable } from './SortTable'
import { TransactionsTable } from './TransactionsTable'
import { splitLabel } from '../domain/cardSplits'
import { cardLabel, dayOf, plural, pounds, signedPounds, statementName, transactionLink, transactionMeta } from './spendingFormat'
import { closeDateFor } from '../domain/cardTracker'
import './Spending.css'
import { movedByTransaction, moveState, potPhrase, toMove, undoMove, usesSetAside, type MoveState } from '../domain/setAside'
import { MoveToPotSheet, SetAsideSteps } from './MoveToPotSheet'
import { markSetAsideMoved } from './setAsideMove'
import { CheckBalancesSheet } from './CheckBalancesSheet'
import { useShortcut } from '../state/shortcuts'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  view: SpendingSection
  onSelectView: (view: SpendingSection) => void
  /** Settings › Cards, to add the card. */
  onOpenCardSettings: () => void
  /** Settings › Sorting rules. */
  onOpenRules?: () => void
  /** Month's pots (or one pot's page). Unused since the side rail went (audit 3 PR 13). */
  onOpenMonth?: (potId?: string) => void
  /** A statement's detail on Statements. */
  statementKey?: string | null
  onOpenStatement?: (key: string | null) => void
  /** Today, for pace; tests pass a fixed one. */
  today?: string
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

/**
 * Spending: the card's own workspace. One header (the card, its open statement, Bring in), three tabs (To sort,
 * Transactions, Statements), and setting money aside as the last step of sorting.
 */
export function Spending({ document, setDocument, view, onSelectView, onOpenCardSettings, onOpenRules = () => {}, statementKey = null, onOpenStatement = () => {}, today = localDate() }: Props) {
  const compact = useMobilePresentation()
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  // Home's "Bring in Amex transactions" arrives with the sheet up (history state northBringIn).
  const [sheet, setSheet] = useState<'bring-in' | 'manual' | null>(() => window.history.state?.northBringIn ? 'bring-in' : null)
  useEffect(() => { if (window.history.state?.northBringIn) { const rest = { ...window.history.state }; delete rest.northBringIn; window.history.replaceState(rest, '') } }, [])
  const [sorting, setSorting] = useState<string | null>(null)
  const [splitting, setSplitting] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [message, setMessageText] = useState('')
  const [undoId, setUndoId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [checkingBalances, setCheckingBalances] = useState(false)
  const { copy, status: copiedStatus } = useStepCopy()
  const setMessage = (text: string) => { setMessageText(text); setUndoId(null) }
  const hasCard = tracker.cards.length > 0
  useShortcut(hasCard ? { keys: 'i', description: 'Bring in transactions', group: 'This page', run: () => setSheet('bring-in') } : null)
  useShortcut(hasCard ? { keys: 'n', description: 'Add a transaction', group: 'This page', run: () => setSheet('manual') } : null)
  const toSort = transactionsToSort(tracker)
  const byRules = uncheckedRuleSorts(tracker)
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

  if (!hasCard) return <div className="page-frame spending-page">
    <PageHeader title="Spending" titleText="Spending"/>
    <EmptyState title="Add your card first" action={<button type="button" className="primary-button" onClick={onOpenCardSettings}>Set up a card</button>}>Set up the Amex in Settings: when its statement closes and when it’s due. Then bring in its transactions here.</EmptyState>
  </div>

  const card = tracker.cards[0]!
  const openClose = closeDateFor(today, card.closeDay)
  const openStatement = statementSummary(document, `${card.id}:${openClose}`, today)
  const potPence = setAsidePot ? potBalance(document, setAsidePot.id).balancePence : undefined
  const context = [`${statementName(openClose)} ${pounds(openStatement?.totalPence ?? 0)}`, `closes ${dayDate(openClose)}`, setAsidePot && potPence !== undefined ? `${signedPounds(potPence)} in ${potPhrase(setAsidePot.name)}` : ''].filter(Boolean).join(' · ')
  const toSettle = statementKeys(tracker).map(key => statementSummary(document, key, today)).filter(row => row && !row.open && row.ready && !row.settled).length
  const where = (transaction: CardTransaction) => {
    const destination = sortDestination(transaction.sort)
    return transaction.sort ? destination ? name(destination) : splitLabel(transaction.sort.lines) : 'To sort'
  }
  /** "Suggested: Spending · Starling Ada", or what a refund matches. */
  const hint = (transaction: CardTransaction) => {
    const purchase = transaction.kind === 'refund' ? refundPurchase(tracker, transaction) : undefined
    if (purchase) { const plan = refundPlan(purchase, transaction); return `refund of ${signedPounds(purchase.amountPence)}${plan.kind === 'single' ? ` · back to ${name(plan.destination)}` : ''}` }
    const top = suggestions(document, transaction)[0]?.destination
    return top ? `Suggested: ${name(top)}` : ''
  }
  const ruleToggle = byRules.length > 0 && <button type="button" className="text-button spending-rule-toggle" aria-expanded={checking} aria-controls="spending-rule-sorts" onClick={() => setChecking(value => !value)}>{checking ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}Sorted by rules · {byRules.length} · Check</button>
  const ruleSorts = checking && byRules.length > 0 && <section id="spending-rule-sorts" className="spending-rule-sorts-body" aria-label="Sorted by rules">
    <p className="rules-lead">Change any of these, and North offers to change the rule too.</p>
    <ul className="spending-list">{byRules.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} where={where(transaction)} tag={transaction.refundOf && !transaction.sort?.ruleId ? 'Refund' : 'Rule'} onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
    <button type="button" className="secondary-button" onClick={() => { setDocument(current => checkRuleSorts(current, byRules.map(row => row.id), new Date())); setChecking(false); setMessage(`${plural(byRules.length, 'rule sort')} checked.`) }}>They all look right</button>
  </section>

  // Set aside: the last step of sorting. It sits under the list, or on top once nothing is left to sort.
  const lastMove = [...tracker.moves ?? []].filter(move => move.cardId === setAsideCard?.id).map(move => move.at).sort().at(-1)
  const markMoved = () => { const { text, id } = markSetAsideMoved(document, setDocument, setAsideCard!.id, pending, new Date()); setMessageText(text); setUndoId(id) }
  const setAside = setAsideCard && setAsidePot && pending.length > 0 && <Section title={`Set aside in ${potPhrase(setAsidePot.name)}`} count={`${pendingPence < 0 ? `${pounds(-pendingPence)} back out` : pounds(pendingPence)} · ${plural(pending.length, 'transaction')} sorted since ${lastMove ? dayOf(lastMove) : 'the start'}`}
    aside={!compact && <button type="button" className="text-button" onClick={() => setMoving(true)}>What it covers</button>}>
    {compact ? <div className="set-aside-card">
      <p>{plural(pending.length, 'transaction')} sorted since {lastMove ? dayOf(lastMove) : 'the start'}. Make the moves in your banking app, then mark them moved.</p>
      <button type="button" className="secondary-button" onClick={() => setMoving(true)}>Review and mark moved</button>
    </div> : <>
      {copiedStatus}
      <div className="set-aside-steps"><SetAsideSteps document={document} cardId={setAsideCard.id} rows={pending} onCopy={pence => void copy(pence)}/></div>
      <div className="set-aside-actions">
        <button type="button" className="secondary-button" onClick={() => setMoving(true)}>Not all of it</button>
        <button type="button" className="secondary-button" onClick={markMoved}>Mark {pounds(Math.abs(pendingPence))} moved</button>
      </div>
    </>}
  </Section>

  const sortPanel = <div className="spending-sort">
    {!toSort.length && setAside}
    <Section title="To sort" count={toSort.length || undefined} aside={!compact ? `${latest ? `Brought in ${dayOf(latest.at)}` : 'Nothing brought in yet'}${sortedThrough ? ` · sorted to ${shortDate(sortedThrough)}` : ''}` : undefined}>
      {toSort.length ? compact
        ? <ul className="spending-sort-list" aria-label="To sort">{toSort.map(transaction => <li key={transaction.id}><ListRow title={transaction.description}
          label={[transaction.description, signedPounds(transaction.amountPence), `${dayDate(transaction.date)} · ${cardLabel(document, transaction)}`, hint(transaction)].filter(Boolean).join(', ')}
          meta={[dayDate(transaction.date), document.household.adults.find(person => person.id === transaction.personId)?.name ?? cardLabel(document, transaction), hint(transaction)].filter(Boolean).join(' · ')}
          trailing={<span className={transaction.amountPence < 0 ? 'spending-credit' : undefined}>{signedPounds(transaction.amountPence)}</span>} onOpen={() => setSorting(transaction.id)}/></li>)}</ul>
        : <SortTable document={document} setDocument={setDocument} transactions={toSort} onSorted={setMessage} onSplit={setSplitting} onOpen={setSorting} footerAside={ruleToggle}/>
        : tracker.transactions.length ? <p className="spending-none">Everything is sorted.</p>
        : <EmptyState title="Nothing to sort" action={<button type="button" className="secondary-button" onClick={() => setSheet('bring-in')}>Bring in</button>}>Bring in the Excel export from {card.name} to start.</EmptyState>}
      {(compact || !toSort.length) && ruleToggle && <div className="spending-rule-line">{ruleToggle}</div>}
      {ruleSorts}
    </Section>
    {toSort.length > 0 && setAside}
  </div>
  const allPanel = <Section title="Transactions"><TransactionsTable document={document} onOpen={setSorting} onBringIn={() => setSheet('bring-in')} movedOf={movedOf}/></Section>

  return <div className="page-frame spending-page">
    <PageHeader title={tracker.cards.length > 1 ? 'Spending' : card.name} titleText="Spending" context={context} actions={<>
      <BudgetOptionsMenu label="More Spending options" options={[
        { label: 'Add a transaction (N)', onSelect: () => setSheet('manual') },
        { label: 'Sorting rules', onSelect: onOpenRules },
        { label: 'Card settings', onSelect: onOpenCardSettings },
      ]}/>
      <button type="button" className="primary-button spending-bring-in" aria-label={compact ? 'Bring in transactions' : undefined} title="Bring in transactions (I)" onClick={() => setSheet('bring-in')}><FileSpreadsheet aria-hidden="true"/>{!compact && 'Bring in'}</button>
    </>}/>
    <p className="budget-manage-message spending-message" role="status">{message}{undoId && <> <button type="button" className="text-button" onClick={() => { setDocument(current => undoMove(current, undoId)); setMessage('Move undone. Those transactions are back on the list to move.') }}>Undo</button> · <button type="button" className="text-button" onClick={() => setCheckingBalances(true)}>Check balances</button></>}</p>
    <Tabs label="Spending" current={view} onSelect={id => onSelectView(id as SpendingSection)} tabs={[
      { id: 'sort', label: 'To sort', ...toSort.length ? { count: toSort.length } : {} },
      { id: 'transactions', label: 'Transactions' },
      { id: 'statements', label: 'Statements', ...toSettle ? { badge: <StatusChip tone="warning">{toSettle} to settle</StatusChip> } : {} },
    ]}>
      {view === 'sort' ? sortPanel : view === 'transactions' ? allPanel
        : <StatementsPanel document={document} setDocument={setDocument} today={today} statementKey={statementKey} onOpenStatement={onOpenStatement} onSort={() => onSelectView('sort')} onBringIn={() => setSheet('bring-in')}/>}
    </Tabs>
    {sortingTransaction && <SortSheet document={document} setDocument={setDocument} transaction={sortingTransaction} today={today} onClose={() => setSorting(null)} onSorted={text => { setSorting(null); setMessage(text) }} onSplit={() => { setSorting(null); setSplitting(sortingTransaction.id) }}/>}
    {splittingTransaction && <SplitEditor document={document} setDocument={setDocument} transaction={splittingTransaction} onClose={() => setSplitting(null)} onSaved={text => { setSplitting(null); setMessage(text) }}/>}
    {sheet === 'bring-in' && <BringInSheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onSort={() => { setSheet(null); onSelectView('sort') }}/>}
    {moving && setAsideCard && <MoveToPotSheet document={document} setDocument={setDocument} cardId={setAsideCard.id} onClose={() => setMoving(false)} onMoved={(text, id) => { setMoving(false); setMessageText(text); setUndoId(id) }}/>}
    {checkingBalances && <CheckBalancesSheet document={document} setDocument={setDocument} onClose={() => setCheckingBalances(false)} onSaved={text => { setCheckingBalances(false); setMessage(text) }}/>}
    {sheet === 'manual' && <ManualEntrySheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onAdded={description => { setSheet(null); setMessage(`Added ${description}.`) }}/>}
  </div>
}
