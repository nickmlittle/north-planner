import { useId } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BatchError, BillDraft } from '../domain/budgetItemDrafts'
import { potSettings } from '../domain/cardSpending'
import { readBillDraft } from '../domain/budgetItemDrafts'
import { REMIND_WEEKS, type BudgetDestination, type BudgetFrequency } from '../domain/monthlyBudget'
import { formatGBP } from '../formatting/money'
import { Segmented } from '../components/ui'
import { MONTH_NAMES, monthlyBillDay, remindLabel, yearlyBillDate } from './billLabels'
import { ordinal } from './cardLabels'

type Props = {
  document: BudgetDocument
  rowId: string
  bill: BillDraft
  frequency: BudgetFrequency
  /** The amount as entered (yearly for a yearly item), when it reads. */
  entryAmountPence: number | undefined
  destination: BudgetDestination | undefined
  /** "Bills" for a pot, the account's short name for an account. */
  destinationName: string | undefined
  error: BatchError | undefined
  onChange: (patch: Partial<BillDraft>) => void
}

const DAYS = Array.from({ length: 28 }, (_, index) => index + 1)
const pounds = (pence: number) => formatGBP(pence / 100)

/**
 * The item editor's "Recurring bill" section (recurring-bills-rules › The item editor): a checkbox, off by default,
 * that reveals Paid by, the card, the day (and for a yearly item the renewal month and reminder), and one line of
 * what North will do with it.
 */
export function RecurringBillFields({ document, rowId, bill, frequency, entryAmountPence, destination, destinationName, error, onChange }: Props) {
  const id = useId()
  const cards = document.card?.cards ?? []
  const yearly = frequency === 'annually'
  const card = bill.paidBy === 'card' ? cards.find(row => row.id === bill.cardId) : undefined
  const fieldError = (field: 'billDay' | 'billMonth') => error?.rowId === rowId && error.field === field
  const errorText = (field: 'billDay' | 'billMonth') => fieldError(field) ? <p id={`${id}-${field}`} className="item-editor-error" role="alert">{error!.message}</p> : null
  const describedBy = (field: 'billDay' | 'billMonth') => fieldError(field) ? `${id}-${field}` : undefined
  const choosePaidBy = (value: string) => onChange(value === 'card'
    ? { paidBy: 'card', ...bill.paidBy !== 'card' && !bill.cardId && cards[0] ? { cardId: cards[0].id } : {} }
    : { paidBy: 'direct-debit' })
  const needsCarryOver = bill.on && yearly && destination?.kind === 'pot' && !potSettings(document, destination.potId).carriesOver

  return <div className={`item-editor-bill${bill.on ? ' is-on' : ''}`}>
    <div className="item-editor-bill-toggle">
      <input id={`${id}-on`} type="checkbox" checked={bill.on} aria-describedby={`${id}-hint`} onChange={event => onChange({ on: event.target.checked })}/>
      <span><label htmlFor={`${id}-on`}>Recurring bill</label><small id={`${id}-hint`}>Comes out on a set date, like council tax, insurance or a subscription.</small></span>
    </div>
    {bill.on && <div className="item-editor-bill-fields">
      <div className="item-editor-field">
        <span aria-hidden="true">Paid by</span>
        <Segmented label="Paid by" value={bill.paidBy} onChange={choosePaidBy} options={[{ value: 'direct-debit', label: 'Direct debit' }, { value: 'card', label: 'Card' }]}/>
      </div>
      {bill.paidBy === 'card' && cards.length > 0 && <label className="item-editor-field">Card<select value={card ? card.id : ''} onChange={event => onChange({ cardId: event.target.value })}>
        {cards.map(row => <option key={row.id} value={row.id}>{row.name} (tracked in Spending)</option>)}
        <option value="">Another card</option>
      </select></label>}
      {yearly ? <>
        <div className="item-editor-bill-date">
          <label className="item-editor-field">Renews on<select data-error-key={`${rowId}:billDay`} value={bill.day} aria-invalid={fieldError('billDay')} aria-describedby={describedBy('billDay')} onChange={event => onChange({ day: event.target.value })}>
            <option value="">Day</option>
            {DAYS.map(day => <option key={day} value={String(day)}>{day}</option>)}
            <option value="last">Last day</option>
          </select></label>
          <label className="item-editor-field"><span aria-hidden="true">&nbsp;</span><select aria-label="Renewal month" data-error-key={`${rowId}:billMonth`} value={bill.month} aria-invalid={fieldError('billMonth')} aria-describedby={describedBy('billMonth')} onChange={event => onChange({ month: event.target.value })}>
            <option value="">Month</option>
            {MONTH_NAMES.map((name, index) => <option key={name} value={String(index + 1)}>{name}</option>)}
          </select></label>
        </div>
        {errorText('billDay')}{errorText('billMonth')}
        <label className="item-editor-field">Remind me<select value={bill.remindWeeks} onChange={event => onChange({ remindWeeks: event.target.value })}>
          {REMIND_WEEKS.map(weeks => <option key={weeks} value={String(weeks)}>{remindLabel(weeks)}</option>)}
        </select></label>
      </> : <>
        <label className="item-editor-field">Comes out on<select data-error-key={`${rowId}:billDay`} value={bill.day} aria-invalid={fieldError('billDay')} aria-describedby={describedBy('billDay')} onChange={event => onChange({ day: event.target.value })}>
          <option value="">Choose a day</option>
          {DAYS.map(day => <option key={day} value={String(day)}>{ordinal(day)}</option>)}
          <option value="last">Last day</option>
        </select></label>
        {errorText('billDay')}
      </>}
      <BillSummary bill={bill} frequency={frequency} entryAmountPence={entryAmountPence} destination={destination} destinationName={destinationName} trackedCardName={card?.name}/>
      {needsCarryOver && <p className="item-editor-bill-note is-warning"><AlertTriangle aria-hidden="true"/><span>Bills that renew yearly need a pot that carries over. Turn on Carries over for {destinationName ?? 'this pot'} in Settings › Accounts &amp; pots.</span></p>}
    </div>}
  </div>
}

/** One line of what North will do with the bill, once its date is chosen. */
function BillSummary({ bill, frequency, entryAmountPence, destination, destinationName, trackedCardName }: { bill: BillDraft; frequency: BudgetFrequency; entryAmountPence: number | undefined; destination: BudgetDestination | undefined; destinationName: string | undefined; trackedCardName: string | undefined }) {
  const read = readBillDraft(bill, frequency)
  if (!('bill' in read) || !read.bill) return null
  const saved = read.bill
  const yearly = frequency === 'annually'
  const remind = yearly && saved.remindWeeks ? saved.remindWeeks : 0
  let text: string
  if (trackedCardName) {
    text = `You’ll sort the charge from the ${trackedCardName} statement as usual. ${yearly ? remind ? 'The date is for the Due list and your reminder.' : 'The date is for the Due list.' : 'The date only shows it as Due until then.'}`
  } else {
    const when = yearly ? yearlyBillDate(saved.day, saved.month!) : monthlyBillDay(saved.day)
    const amount = entryAmountPence === undefined ? 'it' : pounds(entryAmountPence)
    const from = destinationName ? ` from ${destinationName}` : ''
    const reminder = remind ? `, and reminds you ${remind} weeks before` : ''
    text = destination?.kind === 'account'
      ? `North lists ${amount}${from} on ${when}${reminder}.`
      : `North marks ${amount} as paid${from} on ${when}${reminder}.`
  }
  return <p className="item-editor-bill-note"><CalendarDays aria-hidden="true"/><span>{text}</span></p>
}
