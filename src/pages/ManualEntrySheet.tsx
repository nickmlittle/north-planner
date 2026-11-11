import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import { addManualTransaction } from '../domain/amexImport'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, localDate, parsePence, validIsoDate } from '../domain/cardTracker'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; onClose: () => void; onAdded: (description: string) => void; today?: string; now?: () => Date }
type Errors = Partial<Record<'date' | 'description' | 'amount' | 'suffix', string>>

/** Add a transaction by hand: anything the export missed. Its statement comes from its date. */
export function ManualEntrySheet({ document, setDocument, onClose, onAdded, today = localDate(), now = () => new Date() }: Props) {
  const id = useId()
  const cards = cardTracker(document).cards
  const [cardId, setCardId] = useState(cards[0]?.id ?? '')
  const card = cards.find(row => row.id === cardId)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [refund, setRefund] = useState(false)
  const [suffix, setSuffix] = useState(card?.cardholders[0]?.suffix ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const name = (personId: string) => document.household.adults.find(person => person.id === personId)?.name ?? 'Someone'

  const save = (event: FormEvent) => {
    event.preventDefault()
    const pence = parsePence(amount)
    const found: Errors = {}
    if (!validIsoDate(date)) found.date = 'Enter the date of the transaction.'
    if (!description.trim()) found.description = 'Enter what it was.'
    if (pence === null || pence <= 0) found.amount = 'Enter an amount, like 12.50.'
    if (!/^-?\d{4,6}$/.test(suffix.trim())) found.suffix = 'Choose whose card it was on.'
    setErrors(found)
    if (Object.keys(found).length || !card || pence === null) return
    setDocument(current => addManualTransaction(current, { cardId: card.id, date, description, amountPence: refund ? -pence : pence, suffix }, now()))
    onAdded(description.trim())
  }
  const describedBy = (key: keyof Errors) => errors[key] ? `${id}-${key}` : undefined
  const error = (key: keyof Errors) => errors[key] && <span id={`${id}-${key}`} className="input-error spending-field-error">{errors[key]}</span>

  return <ModalDialog title="Add a transaction" onClose={onClose} className="manual-entry-sheet">
    <form className="spending-form" onSubmit={save} noValidate aria-label="Add a transaction">
      {cards.length > 1 && <label className="spending-field">Card<select value={cardId} onChange={event => { setCardId(event.target.value); setSuffix(cards.find(row => row.id === event.target.value)?.cardholders[0]?.suffix ?? '') }}>{cards.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <div className="spending-field-wrap"><label className="spending-field">Date<input type="date" value={date} max={today} data-autofocus onChange={event => setDate(event.target.value)} aria-invalid={!!errors.date || undefined} aria-describedby={describedBy('date')}/></label>{error('date')}</div>
      <div className="spending-field-wrap"><label className="spending-field">Description<input value={description} onChange={event => setDescription(event.target.value)} placeholder="As it appears on the statement" aria-invalid={!!errors.description || undefined} aria-describedby={describedBy('description')}/></label>{error('description')}</div>
      <div className="spending-field-wrap"><label className="spending-field">Amount<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" aria-invalid={!!errors.amount || undefined} aria-describedby={describedBy('amount')}/></label>{error('amount')}</div>
      <label className="spending-check"><input type="checkbox" checked={refund} onChange={event => setRefund(event.target.checked)}/>It’s a refund</label>
      <div className="spending-field-wrap">{card && card.cardholders.length > 0
        ? <label className="spending-field">Whose card<select value={suffix} onChange={event => setSuffix(event.target.value)} aria-invalid={!!errors.suffix || undefined} aria-describedby={describedBy('suffix')}>{card.cardholders.map(row => <option key={row.suffix} value={row.suffix}>{name(row.personId)} ··{row.suffix}</option>)}</select></label>
        : <label className="spending-field">Card ending<input inputMode="numeric" value={suffix} onChange={event => setSuffix(event.target.value)} aria-invalid={!!errors.suffix || undefined} aria-describedby={describedBy('suffix')}/></label>}{error('suffix')}</div>
      <div className="spending-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Add transaction</button></div>
    </form>
  </ModalDialog>
}
