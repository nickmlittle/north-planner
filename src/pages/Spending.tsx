import { useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from 'react'
import { CreditCard, FileSpreadsheet, Plus } from 'lucide-react'
import { PageFrame } from '../components/PageFrame'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, type CardTransaction } from '../domain/cardTracker'
import { lastImport, transactionsToSort } from '../domain/cardSorting'
import type { SpendingView } from '../state/navigation'
import { BringInSheet } from './BringInSheet'
import { ManualEntrySheet } from './ManualEntrySheet'
import { dayOf, plural, signedPounds, transactionMeta } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  view: SpendingView
  onSelectView: (view: SpendingView) => void
  onOpenHousehold: () => void
}

type Section = { id: SpendingView; label: string; count?: number }

/** One transaction: what, when, whose card, and how much. */
export function TransactionRow({ document, transaction, children }: { document: BudgetDocument; transaction: CardTransaction; children?: ReactNode }) {
  return <div className={`spending-row${transaction.amountPence < 0 ? ' is-credit' : ''}`}>
    <span className="spending-row-main"><span className="spending-row-title">{transaction.description}</span><span className="spending-row-amount">{signedPounds(transaction.amountPence)}</span></span>
    <span className="spending-row-meta">{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span>
    {children}
  </div>
}

/** The Spending tab: bring in the Amex export, sort what the rules couldn't, and (in later PRs) track and settle. */
export function Spending({ document, setDocument, view, onSelectView, onOpenHousehold }: Props) {
  const tracker = cardTracker(document)
  const [sheet, setSheet] = useState<'bring-in' | 'manual' | null>(null)
  const [message, setMessage] = useState('')
  const tabRefs = useRef<Partial<Record<SpendingView, HTMLButtonElement | null>>>({})
  const toSort = transactionsToSort(tracker)
  const sections: Section[] = [{ id: 'sort', label: 'To sort', count: toSort.length }]
  const active = sections.find(section => section.id === view)?.id ?? 'sort'
  const latest = lastImport(tracker)

  if (!tracker.cards.length) return <PageFrame className="spending-page" title="Spending" contentWidth="narrow">
    <div className="spending-empty"><CreditCard aria-hidden="true"/><h2>Add your card first</h2><p>Set up the Amex in Household: when its statement closes and when it’s due. Then bring in its transactions here.</p><button type="button" className="primary-button" onClick={onOpenHousehold}>Set up a card</button></div>
  </PageFrame>

  const onTabKey = (event: KeyboardEvent) => {
    const index = sections.findIndex(section => section.id === active)
    const next = { ArrowRight: sections[(index + 1) % sections.length], ArrowLeft: sections[(index + sections.length - 1) % sections.length], Home: sections[0], End: sections.at(-1) }[event.key]
    if (!next) return
    event.preventDefault(); onSelectView(next.id); tabRefs.current[next.id]?.focus()
  }

  const summary = <div className="spending-summary">
    <p className="spending-last"><strong>{tracker.cards.map(card => card.name).join(' · ')}</strong><span>{latest ? `Last brought in ${dayOf(latest.at)}` : 'Nothing brought in yet'}</span></p>
    <div className="spending-actions">
      <button type="button" className="primary-button" onClick={() => setSheet('bring-in')}><FileSpreadsheet aria-hidden="true"/>Bring in transactions</button>
      <button type="button" className="secondary-button" onClick={() => setSheet('manual')}><Plus aria-hidden="true"/>Add a transaction</button>
    </div>
  </div>

  return <PageFrame className="spending-page" title="Spending" contentWidth="wide" summary={summary}>
    {message && <p className="budget-manage-message spending-message" role="status">{message}</p>}
    {sections.length > 1 && <div className="spending-tabs" role="tablist" aria-label="Spending" onKeyDown={onTabKey}>{sections.map(section => <button key={section.id} ref={element => { tabRefs.current[section.id] = element }} type="button" role="tab" id={`spending-tab-${section.id}`} aria-selected={active === section.id} aria-controls="spending-panel" tabIndex={active === section.id ? 0 : -1} onClick={() => onSelectView(section.id)}>{section.label}{section.count ? ` · ${section.count}` : ''}</button>)}</div>}
    <section id="spending-panel" className="spending-panel" {...sections.length > 1 ? { role: 'tabpanel', 'aria-labelledby': `spending-tab-${active}` } : { 'aria-labelledby': 'spending-sort-title' }}>
      <div className="spending-section-heading"><h2 id="spending-sort-title">To sort</h2><span>{toSort.length ? plural(toSort.length, 'transaction') : ''}</span></div>
      {toSort.length ? <ul className="spending-list">{toSort.map(transaction => <li key={transaction.id}><TransactionRow document={document} transaction={transaction}/></li>)}</ul>
        : <p className="spending-none">{tracker.transactions.length ? 'Everything is sorted.' : 'Nothing to sort. Bring in new transactions to start.'}</p>}
    </section>
    {sheet === 'bring-in' && <BringInSheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onSort={() => { setSheet(null); onSelectView('sort') }}/>}
    {sheet === 'manual' && <ManualEntrySheet document={document} setDocument={setDocument} onClose={() => setSheet(null)} onAdded={description => { setSheet(null); setMessage(`Added ${description}.`) }}/>}
  </PageFrame>
}
