import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { Plus, X } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { byFundingShare, fundingShares, halfEach, receiptLines, shareLabel, splitLabel, totalsByDestination } from '../domain/cardSplits'
import { suggestions, sortTransaction } from '../domain/cardSorting'
import { cardTracker, destinationKey, monthOf, parseDestinationValue, parsePence, type CardTransaction, type SplitLine } from '../domain/cardTracker'
import { destinationGroups, destinationNamer } from './cardLabels'
import { pounds, signedPounds, transactionMeta } from './spendingFormat'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; transaction: CardTransaction; onClose: () => void; onSaved: (message: string) => void; now?: () => Date }
type AmountLine = { key: number; destination: string; amount: string; note: string }
type ItemLine = { key: number; item: string; amount: string; destination: string }

const typed = (pence: number) => (Math.abs(pence) / 100).toFixed(2)
let nextKey = 1

/** Split one transaction: by amount (with Half each and the funding share), or item by item from the receipt. */
export function SplitEditor({ document, setDocument, transaction, onClose, onSaved, now = () => new Date() }: Props) {
  const id = useId()
  const name = destinationNamer(document)
  const total = Math.abs(transaction.amountPence), sign = transaction.amountPence < 0 ? -1 : 1
  const first = suggestions(document, transaction)[0]?.destination
  const card = cardTracker(document).cards.find(row => row.id === transaction.cardId)
  const fallback = card ? { kind: 'account' as const, accountId: card.payFromAccountId } : first
  const existing = transaction.sort?.lines ?? []
  const [mode, setMode] = useState<'amount' | 'items'>(existing.some(line => line.item) ? 'items' : 'amount')
  const [lines, setLines] = useState<AmountLine[]>(() => existing.length
    ? existing.map(line => ({ key: nextKey++, destination: destinationKey(line.destination), amount: typed(line.amountPence), note: line.note ?? line.item ?? '' }))
    : [{ key: nextKey++, destination: first ? destinationKey(first) : '', amount: typed(total), note: '' }])
  const [items, setItems] = useState<ItemLine[]>(() => existing.filter(line => line.item).map(line => ({ key: nextKey++, item: line.item!, amount: typed(line.amountPence), destination: destinationKey(line.destination) })))
  const [rest, setRest] = useState(() => destinationKey(existing.find(line => !line.item)?.destination ?? existing[0]?.destination ?? first ?? { kind: 'account', accountId: '' }))
  const shares = document.household.adults.length > 1 ? fundingShares(document, monthOf(transaction.date)) : null
  const groups = destinationGroups(document)

  const fromLines = (next: SplitLine[]) => setLines(next.map(line => ({ key: nextKey++, destination: destinationKey(line.destination), amount: typed(line.amountPence), note: '' })))
  // What would be saved, or why not.
  const amountResult = (() => {
    const parsed = lines.map(line => ({ pence: parsePence(line.amount), destination: parseDestinationValue(line.destination), note: line.note.trim() }))
    const placed = parsed.reduce((sum, line) => sum + (line.pence ?? 0), 0)
    const valid = parsed.every(line => line.pence !== null && line.pence > 0 && line.destination)
    return { left: total - placed, lines: valid ? parsed.map(line => ({ amountPence: line.pence! * sign, destination: line.destination!, ...(line.note ? { note: line.note } : {}) })) : null }
  })()
  const itemResult = (() => {
    const parsed = items.map(row => ({ item: row.item, pence: parsePence(row.amount) ?? 0, destination: parseDestinationValue(row.destination) }))
    const restDestination = parseDestinationValue(rest)
    const left = total - parsed.reduce((sum, row) => sum + row.pence, 0)
    const valid = parsed.every(row => row.pence > 0 && row.destination && row.item.trim()) && !!restDestination
    return { left, lines: valid ? receiptLines(transaction, parsed.map(row => ({ ...row, destination: row.destination! })), restDestination!) : null }
  })()
  const result = mode === 'amount' ? amountResult : itemResult
  const ready = !!result.lines && (mode === 'items' ? result.left >= 0 : result.left === 0)
  const save = () => {
    if (!result.lines) return
    const at = now()
    const next = result.lines
    setDocument(latest => sortTransaction(latest, transaction.id, next, at))
    onSaved(next.length > 1 ? `${transaction.description}: ${splitLabel(next).replace('Split · ', 'split across ')}.` : `Sorted to ${name(next[0]!.destination)}.`)
  }

  const select = (value: string, onChange: (value: string) => void, label: string) => <label className="spending-field split-destination">{label}<select value={value} onChange={event => onChange(event.target.value)}>
    <option value="">Choose a pot or account</option>
    {groups.map(group => <optgroup key={group.key} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
  </select></label>
  const totals = result.lines ? totalsByDestination(result.lines) : []

  return <ModalDialog title={`Split ${transaction.description}`} onClose={onClose} className="split-sheet">
    <p className="sort-sheet-summary"><strong>{signedPounds(transaction.amountPence)}</strong><span>{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span></p>
    <div className="split-modes" role="group" aria-label="Split by">
      <button type="button" aria-pressed={mode === 'amount'} onClick={() => setMode('amount')} data-autofocus>By amount</button>
      <button type="button" aria-pressed={mode === 'items'} onClick={() => setMode('items')}>Receipt items</button>
    </div>
    {mode === 'amount' ? <>
      {document.household.adults.length > 1 && fallback && <div className="split-shortcuts">
        <button type="button" className="secondary-button" onClick={() => fromLines(halfEach(document, transaction, fallback))}>Half each</button>
        {shares && <button type="button" className="secondary-button" onClick={() => { const next = byFundingShare(document, transaction, fallback); if (next) fromLines(next) }}>Split by your {shareLabel(shares)} funding share</button>}
      </div>}
      <ol className="split-lines">{lines.map((line, index) => <li key={line.key} className="split-line" aria-label={`Line ${index + 1}`}>
        {select(line.destination, value => setLines(lines.map(row => row.key === line.key ? { ...row, destination: value } : row)), 'Pot or account')}
        <label className="spending-field split-amount">Amount<input inputMode="decimal" value={line.amount} onChange={event => setLines(lines.map(row => row.key === line.key ? { ...row, amount: event.target.value } : row))}/></label>
        <label className="spending-field split-note">Note<input value={line.note} placeholder="Optional" onChange={event => setLines(lines.map(row => row.key === line.key ? { ...row, note: event.target.value } : row))}/></label>
        {lines.length > 1 && <button type="button" className="icon-button split-remove" aria-label={`Remove line ${index + 1}`} onClick={() => setLines(lines.filter(row => row.key !== line.key))}><X aria-hidden="true"/></button>}
      </li>)}</ol>
      <button type="button" className="text-button split-add" onClick={() => setLines([...lines, { key: nextKey++, destination: '', amount: amountResult.left > 0 ? typed(amountResult.left) : '', note: '' }])}><Plus aria-hidden="true"/>Add a line</button>
    </> : <>
      <ol className="split-lines">{items.map((row, index) => <li key={row.key} className="split-line is-item" aria-label={`Item ${index + 1}`}>
        <label className="spending-field split-note">Item<input value={row.item} onChange={event => setItems(items.map(other => other.key === row.key ? { ...other, item: event.target.value } : other))}/></label>
        <label className="spending-field split-amount">Amount<input inputMode="decimal" value={row.amount} onChange={event => setItems(items.map(other => other.key === row.key ? { ...other, amount: event.target.value } : other))}/></label>
        {select(row.destination, value => setItems(items.map(other => other.key === row.key ? { ...other, destination: value } : other)), 'Pot or account')}
        <button type="button" className="icon-button split-remove" aria-label={`Remove item ${index + 1}`} onClick={() => setItems(items.filter(other => other.key !== row.key))}><X aria-hidden="true"/></button>
      </li>)}</ol>
      <button type="button" className="text-button split-add" onClick={() => setItems([...items, { key: nextKey++, item: '', amount: '', destination: rest }])}><Plus aria-hidden="true"/>Add an item</button>
      <div className="split-rest">
        <p><strong>Everything else</strong><span>{itemResult.left >= 0 ? pounds(itemResult.left) : '—'}</span></p>
        {select(rest, setRest, 'Everything else goes to')}
      </div>
    </>}
    <p className={`split-left${ready ? ' is-ok' : ''}`} aria-live="polite" id={`${id}-left`}>{mode === 'amount'
      ? `Left to place ${result.left < 0 ? `−${pounds(-result.left)}` : pounds(result.left)}`
      : result.left < 0 ? `The items come to ${pounds(-result.left)} more than ${pounds(total)}` : `${pounds(total - result.left)} in items`}</p>
    {totals.length > 1 && <section className="split-totals" aria-labelledby={`${id}-totals`}>
      <h3 id={`${id}-totals`}>By pot</h3>
      <ul>{totals.map(row => <li key={destinationKey(row.destination)}><span>{name(row.destination)}</span><span>{signedPounds(row.amountPence)}</span></li>)}</ul>
    </section>}
    <div className="spending-form-actions">
      <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
      <button type="button" className="primary-button" disabled={!ready} aria-describedby={`${id}-left`} onClick={save}>{mode === 'items' && items.length ? `Save ${items.length} ${items.length === 1 ? 'item' : 'items'}` : 'Save split'}</button>
    </div>
  </ModalDialog>
}
