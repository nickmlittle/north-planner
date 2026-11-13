import { useState, type KeyboardEvent } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { EmptyState, FilterSheet, Kbd, ListRow, StatusChip, useMobilePresentation, type FilterGroup } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { payments } from '../domain/cardRefunds'
import { allTransactions, sortDestination } from '../domain/cardSorting'
import { splitLabel } from '../domain/cardSplits'
import { statementKeys } from '../domain/cardStatements'
import { cardTracker, parseStatementKey, type CardTransaction } from '../domain/cardTracker'
import type { MoveState } from '../domain/setAside'
import { formatMonth } from '../formatting/month'
import { dayDate, destinationGroups, destinationNamer } from './cardLabels'
import { cardLabel, plural, signedPounds, statementName, transactionLink, transactionMeta } from './spendingFormat'
import { activeCount, filterTransactions, groupByMonth, NO_FILTERS, STATUS_LABELS, type TransactionFilters, type TransactionStatus } from './transactionFilters'
import './TransactionsTable.css'

type Props = {
  document: BudgetDocument
  /** Opens the sort sheet: re-sort, split or move back to To sort. */
  onOpen: (transactionId: string) => void
  onBringIn: () => void
  movedOf: (transaction: CardTransaction) => MoveState | undefined
}

/**
 * Spending › Transactions: every purchase and refund, findable in seconds. Search (/) and one Filter menu (pot or
 * account, person, statement, status) over a table grouped by month on desktop, a list on phones. Any row re-sorts.
 */
export function TransactionsTable({ document, onOpen, onBringIn, movedOf }: Props) {
  const mobile = useMobilePresentation()
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS)
  const [filtering, setFiltering] = useState(false)
  const all = allTransactions(tracker)
  const paid = payments(tracker)
  const where = (transaction: CardTransaction) => { const destination = sortDestination(transaction.sort); return transaction.sort ? destination ? name(destination) : splitLabel(transaction.sort.lines) : 'To sort' }
  const nameOf = (transaction: CardTransaction) => transaction.sort ? transaction.sort.lines.map(line => name(line.destination)).join(' ') : 'To sort'
  const shown = filterTransactions(document, all, filters, query, nameOf, movedOf)
  const groups = groupByMonth(shown)
  const person = (transaction: CardTransaction) => document.household.adults.find(adult => adult.id === transaction.personId)?.name ?? cardLabel(document, transaction)
  const link = (transaction: CardTransaction) => transactionLink(document, transaction)
  /** Rule (or Refund, when a refund followed its purchase), Moved or Changed since moved, Refund. */
  const tagsOf = (transaction: CardTransaction): Array<{ text: string; tone?: 'warning' }> => {
    const moved = movedOf(transaction)
    return [
      ...transaction.sort?.by === 'rule' ? [{ text: transaction.refundOf && !transaction.sort.ruleId ? 'Refund' : 'Rule' }] : [],
      ...moved === 'moved' ? [{ text: 'Moved' }] : moved === 'changed' ? [{ text: 'Changed since moved', tone: 'warning' as const }] : [],
      ...transaction.kind === 'refund' && transaction.sort?.by !== 'rule' ? [{ text: 'Refund' }] : [],
    ]
  }
  const tags = (transaction: CardTransaction) => tagsOf(transaction).map(tag => <StatusChip key={tag.text} tone={tag.tone}>{tag.text}</StatusChip>)
  /** Read as one phrase: "TESCO, £62.40, Tue 10 Nov · Ada ··41001, Groceries · Monzo Joint, rule". */
  const label = (transaction: CardTransaction) => [transaction.description, signedPounds(transaction.amountPence), transactionMeta(document, transaction), link(transaction), where(transaction), ...tagsOf(transaction).map(tag => tag.text.toLowerCase())].filter(Boolean).join(', ')
  const splitLines = (transaction: CardTransaction) => transaction.sort && transaction.sort.lines.length > 1 ? transaction.sort.lines : []
  const lineName = (line: NonNullable<CardTransaction['sort']>['lines'][number]) => `${name(line.destination)}${line.item ? ` · ${line.item}` : ''}${line.note ? ` · ${line.note}` : ''}`
  const pot = (transaction: CardTransaction) => transaction.sort ? where(transaction) : <StatusChip tone="warning">To sort</StatusChip>

  // Filters: pot or account (grouped like the sort sheet), person, statement, status.
  const filterGroups: FilterGroup[] = [
    { key: 'destinations', label: 'Pot or account', options: destinationGroups(document).flatMap(group => group.options.map(option => ({ value: option.value, label: option.label, group: group.label }))) },
    { key: 'people', label: 'Person', options: document.household.adults.map(adult => ({ value: adult.id, label: adult.name })) },
    { key: 'statements', label: 'Statement', options: statementKeys(tracker).map(key => ({ value: key, label: statementName(parseStatementKey(key)?.closeDate ?? '') })) },
    { key: 'statuses', label: 'Status', options: (Object.keys(STATUS_LABELS) as TransactionStatus[]).map(status => ({ value: status, label: STATUS_LABELS[status] })) },
  ]
  const optionLabel = (key: string, value: string) => filterGroups.find(group => group.key === key)?.options.find(option => option.value === value)?.label ?? value
  const chips = (Object.keys(NO_FILTERS) as Array<keyof TransactionFilters>).flatMap(key => (filters[key] as string[]).map(value => ({ key, value })))
  const filtered = activeCount(filters) > 0 || !!query.trim()
  const clear = () => { setFilters(NO_FILTERS); setQuery('') }
  const total = shown.reduce((sum, row) => sum + row.amountPence, 0)

  const toolbar = <div className="transactions-toolbar">
    <label className="transactions-search"><span className="visually-hidden">Search transactions</span><input type="search" data-shortcut="search" value={query} placeholder="Search transactions" onChange={event => setQuery(event.target.value)}/>{!mobile && !query && <span className="shortcut-hint" aria-hidden="true"><Kbd>/</Kbd></span>}</label>
    <button type="button" className={mobile ? 'icon-button transactions-filter' : 'secondary-button transactions-filter'} aria-label={mobile ? `Filter${activeCount(filters) ? `, ${activeCount(filters)} on` : ''}` : undefined} onClick={() => setFiltering(true)}>
      <SlidersHorizontal aria-hidden="true"/>{!mobile && <>Filter{activeCount(filters) > 0 && <span className="transactions-filter-count">{activeCount(filters)}</span>}</>}
    </button>
    <p className="transactions-count" aria-live="polite">{plural(shown.length, 'transaction')} · {signedPounds(total)}</p>
    {filtered && <button type="button" className="text-button" onClick={clear}>Clear</button>}
  </div>
  const chipRow = chips.length > 0 && <ul className="transactions-chips" aria-label="Active filters">{chips.map(chip => <li key={`${chip.key}:${chip.value}`}>
    <button type="button" className="transactions-chip" aria-label={`Remove filter: ${optionLabel(chip.key, chip.value)}`} onClick={() => setFilters({ ...filters, [chip.key]: (filters[chip.key] as string[]).filter(value => value !== chip.value) })}>{optionLabel(chip.key, chip.value)}<X aria-hidden="true"/></button>
  </li>)}</ul>
  const sheet = filtering && <FilterSheet groups={filterGroups} selected={filters as unknown as Record<string, string[]>} onChange={(key, values) => setFilters({ ...filters, [key]: values })} onClear={() => setFilters(NO_FILTERS)} onClose={() => setFiltering(false)}/>

  if (!all.length && !paid.length) return <EmptyState title="Nothing brought in yet" action={<button type="button" className="secondary-button" onClick={onBringIn}>Bring in</button>}>Bring in the Excel export from {tracker.cards[0]?.name ?? 'the card'} to see every transaction here.</EmptyState>
  const empty = !shown.length && <EmptyState title={query.trim() ? `No transactions match “${query.trim()}”${activeCount(filters) ? ' with these filters' : ''}` : 'No transactions match these filters'} action={<button type="button" className="secondary-button" onClick={clear}>Clear filters</button>}/>
  const paymentsBand = paid.length > 0 && <section aria-label={`Payments to ${tracker.cards[0]!.name}`}><details className="transactions-payments">
    <summary>Payments to {tracker.cards[0]!.name} · never sorted <span>{plural(paid.length, 'payment')}</span></summary>
    <ul>{paid.map(row => <li key={row.id}><span>{row.description}<small>{transactionMeta(document, row)}</small></span><span>{signedPounds(row.amountPence)}</span></li>)}</ul>
  </details></section>

  if (mobile) return <div className="transactions">
    {toolbar}{chipRow}{empty}
    {groups.map(group => <section key={group.month} className="transactions-month" aria-label={formatMonth(group.month)}>
      <h3 className="transactions-month-title">{formatMonth(group.month)}</h3>
      <ul className="transactions-list">{group.rows.map(row => <li key={row.id}><ListRow title={row.description} label={label(row)}
        meta={<>{dayDate(row.date)} · {person(row)} · {where(row)}{link(row) && <span className="transactions-link">{link(row)}</span>}</>} trailing={signedPounds(row.amountPence)} trailingMeta={tags(row).length ? <span className="transactions-tags">{tags(row)}</span> : undefined} onOpen={() => onOpen(row.id)}/>
        {splitLines(row).length > 0 && <ul className="transactions-split" aria-label={`${row.description} split`}>{splitLines(row).map((line, index) => <li key={index}><span>{lineName(line)}</span><span>{signedPounds(line.amountPence)}</span></li>)}</ul>}
      </li>)}</ul>
    </section>)}
    {paymentsBand}{sheet}
  </div>

  // Desktop rows: ↑/↓ move, Enter (or a click) opens the sort sheet.
  const onKey = (event: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const rows = [...event.currentTarget.closest('table')?.querySelectorAll<HTMLTableRowElement>('tr.transactions-row') ?? []]
      rows[rows.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)]?.focus()
    } else if (event.key === 'Enter') { event.preventDefault(); onOpen(id) }
  }
  return <div className="transactions">
    {toolbar}{chipRow}{empty}
    {groups.length > 0 && <div className="transactions-table-wrap"><table className="transactions-table" aria-label="Transactions">
      <colgroup><col className="tx-col-date"/><col/><col className="tx-col-card"/><col className="tx-col-amount"/><col className="tx-col-pot"/><col className="tx-col-tags"/></colgroup>
      <thead><tr><th scope="col">Date</th><th scope="col">Merchant</th><th scope="col">Card</th><th scope="col" className="is-num">Amount</th><th scope="col">Pot or account</th><th scope="col">Tags</th></tr></thead>
      {groups.map(group => <tbody key={group.month}>
        <tr className="transactions-band"><th scope="rowgroup" colSpan={6}>{formatMonth(group.month)} <span>· {plural(group.rows.length, 'transaction')} · {signedPounds(group.totalPence)}</span></th></tr>
        {group.rows.flatMap(row => {
          const lines = splitLines(row)
          return [<tr key={row.id} tabIndex={0} className="transactions-row" aria-label={label(row)}
            onClick={() => onOpen(row.id)} onKeyDown={event => onKey(event, row.id)}>
            <td>{dayDate(row.date)}</td>
            <td><span className="transactions-merchant">{row.description}</span>{link(row) && <span className="transactions-link">{link(row)}</span>}</td>
            <td>{cardLabel(document, row)}</td>
            <td className={`is-num${row.amountPence < 0 ? ' is-credit' : ''}`}>{signedPounds(row.amountPence)}</td>
            <td>{pot(row)}</td>
            <td><span className="transactions-tags">{tags(row)}</span></td>
          </tr>, ...lines.map((line, lineIndex) => <tr key={`${row.id}:${lineIndex}`} className="transactions-line" aria-hidden="true">
            <td/><td colSpan={2}>{lineName(line)}</td><td className="is-num">{signedPounds(line.amountPence)}</td><td colSpan={2}/>
          </tr>)]
        })}
      </tbody>)}
    </table></div>}
    {paymentsBand}{sheet}
  </div>
}
