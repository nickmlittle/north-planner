import { useRef, useState, useSyncExternalStore, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, CreditCard, FileSpreadsheet, Plus } from 'lucide-react'
import { MOBILE_QUERY } from '../breakpoints'
import { PageFrame } from '../components/PageFrame'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, type CardTransaction } from '../domain/cardTracker'
import { allTransactions, checkRuleSorts, lastImport, sortDestination, transactionsToSort, uncheckedRuleSorts } from '../domain/cardSorting'
import type { SpendingView } from '../state/navigation'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { BringInSheet } from './BringInSheet'
import { destinationNamer } from './cardLabels'
import { ManualEntrySheet } from './ManualEntrySheet'
import { RulesPanel } from './RulesPanel'
import { SortSheet } from './SortSheet'
import { dayOf, plural, signedPounds, transactionMeta } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  view: SpendingView
  onSelectView: (view: SpendingView) => void
  onOpenHousehold: () => void
}

type Section = { id: SpendingView; label: string; count?: number; desktopOnly?: boolean }

const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches

/** One transaction: what, when, whose card, how much, and where it went. A button when it can be sorted. */
export function TransactionRow({ document, transaction, where, tag, action, onSelect }: { document: BudgetDocument; transaction: CardTransaction; where?: string; tag?: string; action?: string; onSelect?: () => void }) {
  // Read as one phrase: "TESCO, £62.40, Tue 10 Nov · Ada ··41001, Groceries · Monzo Joint, rule".
  const label = [transaction.description, signedPounds(transaction.amountPence), `${transactionMeta(document, transaction)}${transaction.kind === 'refund' ? ' · refund' : ''}`, where, tag?.toLowerCase(), action].filter(Boolean).join(', ')
  const body = <>
    <span className="spending-row-main"><span className="spending-row-title">{transaction.description}</span><span className="spending-row-amount">{signedPounds(transaction.amountPence)}</span></span>
    <span className="spending-row-meta"><span>{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span>
      {(where || action) && <span className="spending-row-where">{where}{tag && <span className="spending-tag">{tag}</span>}{action && <span className="spending-row-action">{action}</span>}</span>}</span>
  </>
  const className = `spending-row${transaction.amountPence < 0 ? ' is-credit' : ''}`
  return onSelect ? <button type="button" className={className} data-transaction={transaction.id} aria-label={label} onClick={onSelect}>{body}</button> : <div className={className}>{body}</div>
}

/** The Spending tab: bring in the Amex export, sort what the rules couldn't, check the rules, and (in later PRs) track and settle. */
export function Spending({ document, setDocument, view, onSelectView, onOpenHousehold }: Props) {
  const compact = useSyncExternalStore(subscribeMobile, getMobile, () => false)
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const [sheet, setSheet] = useState<'bring-in' | 'manual' | null>(null)
  const [sorting, setSorting] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const tabRefs = useRef<Partial<Record<SpendingView, HTMLButtonElement | null>>>({})
  const toSort = transactionsToSort(tracker)
  const byRules = uncheckedRuleSorts(tracker)
  const sections: Section[] = [
    { id: 'sort', label: 'To sort', count: toSort.length },
    { id: 'all', label: 'All transactions', desktopOnly: true },
    { id: 'rules', label: 'Rules', count: tracker.rules.length, desktopOnly: true },
  ]
  const active = sections.find(section => section.id === view)?.id ?? 'sort'
  // Phones keep the tabs to the everyday sections and put the rest under ⋯.
  const tabs = compact ? sections.filter(section => !section.desktopOnly) : sections
  const more = compact ? sections.filter(section => section.desktopOnly) : []
  const moreMenu = more.length > 0 && <BudgetOptionsMenu label="More Spending sections" options={more.map(section => ({ label: section.label, onSelect: () => onSelectView(section.id) }))}/>
  const navInHeading = tabs.length <= 1
  const headingExtra = navInHeading ? moreMenu : null
  const latest = lastImport(tracker)
  const sortingTransaction = tracker.transactions.find(row => row.id === sorting)

  if (!tracker.cards.length) return <PageFrame className="spending-page" title="Spending" contentWidth="narrow">
    <div className="spending-empty"><CreditCard aria-hidden="true"/><h2>Add your card first</h2><p>Set up the Amex in Household: when its statement closes and when it’s due. Then bring in its transactions here.</p><button type="button" className="primary-button" onClick={onOpenHousehold}>Set up a card</button></div>
  </PageFrame>

  const onTabKey = (event: KeyboardEvent) => {
    const index = tabs.findIndex(section => section.id === active)
    const next = { ArrowRight: tabs[(index + 1) % tabs.length], ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length], Home: tabs[0], End: tabs.at(-1) }[event.key]
    if (!next) return
    event.preventDefault(); onSelectView(next.id); tabRefs.current[next.id]?.focus()
  }
  const where = (transaction: CardTransaction) => {
    const destination = sortDestination(transaction.sort)
    return transaction.sort ? destination ? name(destination) : `Split · ${transaction.sort.lines.length} lines` : 'To sort'
  }

  const summary = <div className="spending-summary">
    <p className="spending-last"><strong>{tracker.cards.map(card => card.name).join(' · ')}</strong><span>{latest ? `Last brought in ${dayOf(latest.at)}` : 'Nothing brought in yet'}</span></p>
    <div className="spending-actions">
      <button type="button" className="primary-button" onClick={() => setSheet('bring-in')}><FileSpreadsheet aria-hidden="true"/>Bring in transactions</button>
      <button type="button" className="secondary-button" onClick={() => setSheet('manual')}><Plus aria-hidden="true"/>Add a transaction</button>
    </div>
  </div>

  const sortPanel = <>
    <div className="spending-section-heading"><h2 id="spending-sort-title">To sort</h2><span>{toSort.length ? plural(toSort.length, 'transaction') : ''}</span>{headingExtra}</div>
    {toSort.length ? <ul className="spending-list">{toSort.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} action="Choose" onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
      : <p className="spending-none">{tracker.transactions.length ? 'Everything is sorted.' : 'Nothing to sort. Bring in new transactions to start.'}</p>}
    {byRules.length > 0 && <section className="spending-rule-sorts" aria-labelledby="spending-rules-title">
      <div className="spending-section-heading"><h2 id="spending-rules-title">Sorted by rules · {byRules.length}</h2>
        <button type="button" className="text-button spending-disclosure" aria-expanded={checking} aria-controls="spending-rule-sorts" onClick={() => setChecking(value => !value)}>{checking ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}Check</button></div>
      {checking && <div id="spending-rule-sorts" className="spending-rule-sorts-body">
        <p className="rules-lead">Change any of these, and North offers to change the rule too.</p>
        <ul className="spending-list">{byRules.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} where={where(transaction)} tag="Rule" onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
        <button type="button" className="secondary-button" onClick={() => { setDocument(current => checkRuleSorts(current, byRules.map(row => row.id), new Date())); setChecking(false); setMessage(`${plural(byRules.length, 'rule sort')} checked.`) }}>They all look right</button>
      </div>}
    </section>}
  </>
  const all = allTransactions(tracker)
  const allPanel = <>
    <div className="spending-section-heading"><h2 id="spending-all-title">All transactions</h2><span>{all.length ? plural(all.length, 'transaction') : ''}</span>{headingExtra}</div>
    {all.length ? <ul className="spending-list">{all.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction} where={where(transaction)} tag={transaction.sort?.by === 'rule' ? 'Rule' : undefined} onSelect={() => setSorting(transaction.id)}/></li>)}</ul>
      : <p className="spending-none">Nothing brought in yet.</p>}
  </>

  return <PageFrame className="spending-page" title="Spending" contentWidth="wide" summary={summary}>
    <p className="budget-manage-message spending-message" role="status">{message}</p>
    {!navInHeading && <div className="spending-nav">
      <div className="spending-tabs" role="tablist" aria-label="Spending" onKeyDown={onTabKey}>{tabs.map(section => <button key={section.id} ref={element => { tabRefs.current[section.id] = element }} type="button" role="tab" id={`spending-tab-${section.id}`} aria-selected={active === section.id} aria-controls="spending-panel" tabIndex={active === section.id || !tabs.some(tab => tab.id === active) && section.id === tabs[0]!.id ? 0 : -1} onClick={() => onSelectView(section.id)}>{section.label}{section.count ? ` · ${section.count}` : ''}</button>)}</div>
      {moreMenu}
    </div>}
    {compact && more.some(section => section.id === active) && <button type="button" className="text-button spending-back" onClick={() => onSelectView('sort')}>Back to To sort</button>}
    <section id="spending-panel" className="spending-panel" {...tabs.length > 1 && tabs.some(tab => tab.id === active) ? { role: 'tabpanel', 'aria-labelledby': `spending-tab-${active}` } : {}}>
      {active === 'sort' ? sortPanel : active === 'all' ? allPanel : <RulesPanel document={document} setDocument={setDocument} headingExtra={headingExtra}/>}
    </section>
    {sortingTransaction && <SortSheet document={document} setDocument={setDocument} transaction={sortingTransaction} onClose={() => setSorting(null)} onSorted={text => { setSorting(null); setMessage(text) }}/>}
    {sheet === 'bring-in' && <BringInSheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onSort={() => { setSheet(null); onSelectView('sort') }}/>}
    {sheet === 'manual' && <ManualEntrySheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onAdded={description => { setSheet(null); setMessage(`Added ${description}.`) }}/>}
  </PageFrame>
}
