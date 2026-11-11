import { useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { Split } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { refundPlan, refundPurchase, sortRefund } from '../domain/cardRefunds'
import { addRule, suggestions, sortTransaction } from '../domain/cardSorting'
import { cardTracker, defaultRuleText, destinationKey, parseDestinationValue, type CardTransaction } from '../domain/cardTracker'
import { dayDate, destinationGroups, destinationNamer, shortDate } from './cardLabels'
import { cardLabel, signedPounds } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  transactions: CardTransaction[]
  onSorted: (message: string) => void
  onSplit: (id: string) => void
  /** The full sort sheet, for anything the table can't do (a refund of a split). */
  onOpen: (id: string) => void
  now?: () => Date
}

/**
 * Desktop To sort (board 7): a table built for the keyboard. ↑/↓ move between rows, / jumps to the pot list
 * (type a pot's name), Enter places it, A toggles Always, S splits. Focus moves to the next row once one is placed.
 */
export function SortTable({ document, setDocument, transactions, onSorted, onSplit, onOpen, now = () => new Date() }: Props) {
  const name = destinationNamer(document)
  const groups = destinationGroups(document)
  const tracker = cardTracker(document)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [always, setAlways] = useState<Record<string, boolean>>({})
  const rows = useRef<Record<string, HTMLTableRowElement | null>>({})
  const selects = useRef<Record<string, HTMLSelectElement | null>>({})

  const suggested = (transaction: CardTransaction) => {
    const purchase = transaction.kind === 'refund' ? refundPurchase(tracker, transaction) : undefined
    const plan = purchase ? refundPlan(purchase, transaction) : undefined
    return plan?.kind === 'single' ? plan.destination : suggestions(document, transaction)[0]?.destination
  }
  const choice = (transaction: CardTransaction) => choices[transaction.id] ?? (suggested(transaction) ? destinationKey(suggested(transaction)!) : '')
  const focusRow = (index: number) => { const target = transactions[Math.max(0, Math.min(index, transactions.length - 1))]; if (target) rows.current[target.id]?.focus() }

  const place = (transaction: CardTransaction, index: number) => {
    const destination = parseDestinationValue(choice(transaction))
    if (!destination) { selects.current[transaction.id]?.focus(); return }
    const at = now()
    const purchase = transaction.kind === 'refund' ? refundPurchase(tracker, transaction) : undefined
    if (purchase && refundPlan(purchase, transaction).kind === 'split') { onOpen(transaction.id); return }
    let message = `Sorted ${transaction.description} to ${name(destination)}.`
    if (purchase) setDocument(current => sortRefund(current, transaction.id, purchase.id, { destination }, at))
    else if (always[transaction.id]) {
      const draft = { contains: defaultRuleText(transaction.merchant), destination }
      const { alsoSorted } = addRule(sortTransaction(document, transaction.id, [{ amountPence: transaction.amountPence, destination }], at), draft, at)
      setDocument(current => addRule(sortTransaction(current, transaction.id, [{ amountPence: transaction.amountPence, destination }], at), draft, at).document)
      message += ` New rule for “${draft.contains}”${alsoSorted ? `, which sorted ${alsoSorted} more` : ''}.`
    } else setDocument(current => sortTransaction(current, transaction.id, [{ amountPence: transaction.amountPence, destination }], at))
    onSorted(message)
    // The placed row leaves the list: focus moves to the one after it (or before it, at the end).
    const nextId = transactions[index + 1]?.id ?? transactions[index - 1]?.id
    requestAnimationFrame(() => { if (nextId) rows.current[nextId]?.focus() })
  }

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, transaction: CardTransaction, index: number) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowDown') { event.preventDefault(); focusRow(index + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusRow(index - 1) }
    else if (event.key === '/') { event.preventDefault(); selects.current[transaction.id]?.focus() }
    else if (event.key === 'Enter') { event.preventDefault(); place(transaction, index) }
    else if (event.key.toLowerCase() === 'a' && transaction.kind !== 'refund') { event.preventDefault(); setAlways({ ...always, [transaction.id]: !always[transaction.id] }) }
    else if (event.key.toLowerCase() === 's') { event.preventDefault(); onSplit(transaction.id) }
  }

  return <div className="sort-table-wrap">
    <table className="sort-table" aria-label="To sort" aria-describedby="sort-table-keys">
      <thead><tr><th scope="col">Date</th><th scope="col">Merchant</th><th scope="col">Card</th><th scope="col" className="is-amount">Amount</th><th scope="col">Pot or account</th><th scope="col">Always</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>{transactions.map((transaction, index) => {
        const purchase = transaction.kind === 'refund' ? refundPurchase(tracker, transaction) : undefined
        const top = suggested(transaction)
        return <tr key={transaction.id} ref={element => { rows.current[transaction.id] = element }} tabIndex={0} className="sort-table-row" data-transaction={transaction.id} aria-keyshortcuts="ArrowUp ArrowDown / Enter A S"
          aria-label={`${transaction.description}, ${signedPounds(transaction.amountPence)}, ${dayDate(transaction.date)}`} onKeyDown={event => onRowKey(event, transaction, index)}>
          <td>{dayDate(transaction.date)}</td>
          <td><span className="sort-table-merchant">{transaction.description}</span>{purchase && <span className="sort-table-note">Matches {purchase.description} {signedPounds(purchase.amountPence)}, {shortDate(purchase.date)}</span>}</td>
          <td>{cardLabel(document, transaction)}</td>
          <td className={`is-amount${transaction.amountPence < 0 ? ' is-credit' : ''}`}>{signedPounds(transaction.amountPence)}</td>
          <td><label className="visually-hidden" htmlFor={`sort-${transaction.id}`}>Pot for {transaction.description}</label>
            <select id={`sort-${transaction.id}`} ref={element => { selects.current[transaction.id] = element }} value={choice(transaction)} onChange={event => setChoices({ ...choices, [transaction.id]: event.target.value })}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); place(transaction, index) } else if (event.key === 'Escape') { event.preventDefault(); rows.current[transaction.id]?.focus() } }}>
              <option value="">Choose…</option>
              {groups.map(group => <optgroup key={group.key} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}{top && option.value === destinationKey(top) ? ' (suggested)' : ''}</option>)}</optgroup>)}
            </select></td>
          <td>{transaction.kind !== 'refund' && <label className="sort-table-always"><input type="checkbox" checked={!!always[transaction.id]} onChange={event => setAlways({ ...always, [transaction.id]: event.target.checked })}/><span className="visually-hidden">Always put {transaction.merchant} in this pot</span></label>}</td>
          <td><span className="sort-table-actions"><button type="button" className="secondary-button" onClick={() => place(transaction, index)}>Place</button><button type="button" className="icon-button" aria-label={`Split ${transaction.description}`} onClick={() => onSplit(transaction.id)}><Split aria-hidden="true"/></button></span></td>
        </tr>
      })}</tbody>
    </table>
    <p className="sort-table-keys" id="sort-table-keys"><kbd>↑</kbd><kbd>↓</kbd> move between rows · <kbd>/</kbd> choose a pot · <kbd>Enter</kbd> place it · <kbd>A</kbd> Always · <kbd>S</kbd> split</p>
  </div>
}
