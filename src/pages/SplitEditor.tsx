import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { Plus, X } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { byFundingShare, discountPence, fundingShares, halfEach, receiptLines, shareLabel, splitLabel, totalsByDestination } from '../domain/cardSplits'
import { suggestions, sortTransaction } from '../domain/cardSorting'
import { cardTracker, destinationKey, monthOf, parseDestinationValue, parsePence, type CardTransaction, type SplitLine } from '../domain/cardTracker'
import { destinationGroups, destinationNamer } from './cardLabels'
import { pounds, signedPounds, transactionMeta } from './spendingFormat'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; transaction: CardTransaction; onClose: () => void; onSaved: (message: string) => void; now?: () => Date }
type AmountLine = { key: number; destination: string; amount: string; note: string }
type ItemLine = { key: number; item: string; amount: string; destination: string; back: boolean; covered: boolean }

const typed = (pence: number) => (Math.abs(pence) / 100).toFixed(2)
/** A typed percentage: 0 < n ≤ 100, up to two decimals. */
const parsePercent = (value: string) => { const n = Number(value.trim().replace(/%$/, '')); return value.trim() && Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) / 100 : null }
let nextKey = 1

/** Split one transaction: by amount (with Half each and the funding share), or item by item from the receipt. */
export function SplitEditor({ document, setDocument, transaction, onClose, onSaved, now = () => new Date() }: Props) {
  const id = useId()
  // Back ticks and discounts are for purchases: a return on its way (D11), a code on the order (D12).
  const canHold = transaction.kind === 'purchase'
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
  // Items are typed at their original price; a discount code takes its share off the items it covers (D12).
  const [items, setItems] = useState<ItemLine[]>(() => existing.filter(line => line.item).map(line => ({ key: nextKey++, item: line.item!, amount: typed(line.originalPence ?? line.amountPence), destination: destinationKey(line.destination), back: !!line.expectingBack, covered: !!line.originalPence })))
  const saved = transaction.sort?.discount
  const [discountOn, setDiscountOn] = useState(!!saved)
  const [discountUnit, setDiscountUnit] = useState<'amount' | 'percent'>(saved?.percent !== undefined ? 'percent' : 'amount')
  const [discountValue, setDiscountValue] = useState(saved ? saved.percent !== undefined ? String(saved.percent) : typed(saved.pence) : '')
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
    const parsed = items.map(row => ({ item: row.item, pence: parsePence(row.amount) ?? 0, destination: parseDestinationValue(row.destination), back: row.back, covered: discountOn && canHold && row.covered }))
    const restDestination = parseDestinationValue(rest)
    const typedValue = discountUnit === 'percent' ? parsePercent(discountValue) : parsePence(discountValue)
    const percent = discountUnit === 'percent' ? typedValue : null
    const off = discountOn && canHold && typedValue ? discountPence(parsed.filter(row => row.covered && row.pence > 0).map(row => row.pence), percent ? { percent } : { pence: typedValue }) : 0
    const left = total - parsed.reduce((sum, row) => sum + row.pence, 0) + off
    const valid = parsed.every(row => row.pence > 0 && row.destination && row.item.trim()) && !!restDestination && (!discountOn || off > 0)
    const made = valid ? receiptLines(transaction, parsed.map(row => ({ ...row, destination: row.destination! })), restDestination!, off || undefined) : null
    // A line already marked Not coming back keeps that when the items are saved again.
    return { left, off, discount: off ? { pence: off, ...percent ? { percent } : {} } : undefined, lines: made && made.map(line => { const before = line.expectingBack && existing.find(old => old.notComingBackAt && old.item === line.item && destinationKey(old.destination) === destinationKey(line.destination)); return before ? { ...line, notComingBackAt: before.notComingBackAt! } : line }) }
  })()
  // What's held is at the discounted price, as it'll be saved.
  const backPence = itemResult.lines ? itemResult.lines.filter(line => line.expectingBack && !line.notComingBackAt).reduce((sum, line) => sum + line.amountPence, 0) : items.filter(row => row.back).reduce((sum, row) => sum + (parsePence(row.amount) ?? 0), 0)
  const itemsTotal = items.reduce((sum, row) => sum + (parsePence(row.amount) ?? 0), 0)
  const result = mode === 'amount' ? amountResult : itemResult
  const ready = !!result.lines && (mode === 'items' ? result.left >= 0 : result.left === 0)
  const save = () => {
    if (!result.lines) return
    const at = now()
    const next: SplitLine[] = result.lines
    setDocument(latest => sortTransaction(latest, transaction.id, next, at, mode === 'items' ? itemResult.discount : undefined))
    const held = mode === 'items' && canHold ? next.filter(line => line.expectingBack && !line.notComingBackAt).reduce((sum, line) => sum + line.amountPence, 0) : 0
    onSaved(held ? `${transaction.description}: ${pounds(held)} expecting back, held in its pot until the bill.` : next.length > 1 ? `${transaction.description}: ${splitLabel(next).replace('Split · ', 'split across ')}.` : `Sorted to ${name(next[0]!.destination)}.`)
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
      <ol className="split-lines">{items.map((row, index) => <li key={row.key} className={`split-line is-item${canHold ? ' can-hold' : ''}`} aria-label={`Item ${index + 1}`}>
        <label className="spending-field split-note">Item<input value={row.item} onChange={event => setItems(items.map(other => other.key === row.key ? { ...other, item: event.target.value } : other))}/></label>
        <label className="spending-field split-amount">Amount<input inputMode="decimal" value={row.amount} onChange={event => setItems(items.map(other => other.key === row.key ? { ...other, amount: event.target.value } : other))}/></label>
        {select(row.destination, value => setItems(items.map(other => other.key === row.key ? { ...other, destination: value } : other)), 'Pot or account')}
        {canHold && <label className="split-back"><input type="checkbox" checked={row.back} onChange={event => setItems(items.map(other => other.key === row.key ? { ...other, back: event.target.checked } : other))}/>Back</label>}
        <button type="button" className="icon-button split-remove" aria-label={`Remove item ${index + 1}`} onClick={() => setItems(items.filter(other => other.key !== row.key))}><X aria-hidden="true"/></button>
      </li>)}</ol>
      <button type="button" className="text-button split-add" onClick={() => setItems([...items, { key: nextKey++, item: '', amount: '', destination: rest, back: false, covered: true }])}><Plus aria-hidden="true"/>Add an item</button>
      {canHold && (discountOn
        ? <section className="split-discount" aria-label="Discount">
          <div className="split-discount-head">
            <h3>Discount</h3>
            <button type="button" className="text-button" onClick={() => { setDiscountOn(false); setDiscountValue('') }}>Remove discount</button>
          </div>
          <div className="split-modes" role="group" aria-label="Discount is">
            <button type="button" aria-pressed={discountUnit === 'amount'} onClick={() => { setDiscountUnit('amount'); setDiscountValue('') }}>An amount</button>
            <button type="button" aria-pressed={discountUnit === 'percent'} onClick={() => { setDiscountUnit('percent'); setDiscountValue('') }}>A percentage</button>
          </div>
          <label className="spending-field split-amount">{discountUnit === 'percent' ? 'Percent off' : 'Amount off'}<input inputMode="decimal" value={discountValue} placeholder={discountUnit === 'percent' ? '20' : '0.00'} onChange={event => setDiscountValue(event.target.value)}/></label>
          <fieldset className="split-covers">
            <legend>The code covers</legend>
            {items.length ? items.map((row, index) => <label key={row.key} className="split-back"><input type="checkbox" checked={row.covered} onChange={event => setItems(items.map(other => other.key === row.key ? { ...other, covered: event.target.checked } : other))}/>{row.item.trim() || `Item ${index + 1}`}</label>) : <p className="split-back-hint">Add the items first.</p>}
          </fieldset>
          <p className="split-back-hint">{itemResult.off > 0 ? `${pounds(itemResult.off)} off, spread over the items it covers by price. They save at the discounted price.` : 'Enter what the code took off, and tick the items it covers.'}</p>
        </section>
        : <button type="button" className="text-button split-add" onClick={() => setDiscountOn(true)}><Plus aria-hidden="true"/>Add discount</button>)}
      <div className="split-rest">
        <p><strong>Everything else</strong><span>{itemResult.left >= 0 ? pounds(itemResult.left) : '—'}</span></p>
        {select(rest, setRest, 'Everything else goes to')}
      </div>
    </>}
    <p className={`split-left${ready ? ' is-ok' : ''}`} aria-live="polite" id={`${id}-left`}>{mode === 'amount'
      ? `Left to place ${result.left < 0 ? `−${pounds(-result.left)}` : pounds(result.left)}`
      : result.left < 0 ? `The items come to ${pounds(-result.left)} more than ${pounds(total)}` : `${itemResult.off > 0 ? `${pounds(itemsTotal)} of items − ${pounds(itemResult.off)} discount = ${pounds(itemsTotal - itemResult.off)}` : `${pounds(total - result.left)} in items`}${backPence > 0 ? ` · ${pounds(backPence)} expecting back` : ''}`}</p>
    {mode === 'items' && canHold && <p className="split-back-hint">Tick <strong>Back</strong> for anything you’re sending back. It stays in its pot, not spent, until the refund or the bill.</p>}
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
