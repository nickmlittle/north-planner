import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { CalendarDays } from 'lucide-react'
import { Sheet } from '../components/ui/Sheet'
import { ImpactPreview } from '../components/ImpactPreview'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetImpact } from '../domain/budgetImpact'
import { moneyPence } from '../domain/budgetItemDrafts'
import { budgetEditScope, monthlyContributionPence, resolveBudget, type BillDay } from '../domain/monthlyBudget'
import { answerRenewal, billTracked, renewalAfter, renewalPriceEditable, undoRenewalAnswer } from '../domain/recurringBills'
import { formatEditScope } from '../formatting/month'
import { MONTH_NAMES, paidByLabel } from './billLabels'
import { destinationNamer } from './cardLabels'
import { pounds } from './spendingFormat'
import './RenewalSheet.css'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  itemId: string
  /** The renewal being answered (YYYY-MM-DD). */
  date: string
  today: string
  onClose: () => void
  /** "Switched provider? Edit the item": Plan at the renewal's month, with the item editor open. */
  onEditItem: (itemId: string, month: string) => void
  /** After Same price or Save new price: what happened, and how to undo it. */
  onAnswered: (text: string, undo: (current: BudgetDocument) => BudgetDocument) => void
}

const DAYS = Array.from({ length: 28 }, (_, index) => index + 1)
/** "6 December 2026". */
const longDate = (date: string) => `${Number(date.slice(8))}\u00a0${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
const dayMonth = (date: string) => `${Number(date.slice(8))}\u00a0${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}`

/**
 * The Renewal sheet (board 2, recurring-bills-rules › Renewals): a yearly bill's planned price, the new price and
 * next renewal, and what the change does to the plan from the renewal's month. Same price records the answer;
 * Save new price also edits the item from that month.
 */
export function RenewalSheet({ document, setDocument, itemId, date, today, onClose, onEditItem, onAnswered }: Props) {
  const id = useId()
  const month = date.slice(0, 7)
  const item = resolveBudget(document.budget, month).items.find(row => row.id === itemId)
  const [price, setPrice] = useState(() => item ? (item.entryAmountPence / 100).toFixed(2) : '')
  const [day, setDay] = useState(() => String(item?.bill?.day ?? 1))
  const [renewMonth, setRenewMonth] = useState(() => String(item?.bill?.month ?? Number(month.slice(5))))
  const [error, setError] = useState<string>()
  if (!item?.bill || item.frequency !== 'annually') return null
  const bill = item.bill
  const tracked = billTracked(bill, document)
  const cards = document.card?.cards ?? []
  const cardName = tracked ? cards.find(row => row.id === bill.cardId)?.name : undefined
  const destination = destinationNamer(document)(item.destination).split(' · ')[0]!
  const editable = renewalPriceEditable(item)
  const monthName = MONTH_NAMES[Number(month.slice(5)) - 1]!

  const pence = moneyPence(price)
  const chosenDay: BillDay = day === 'last' ? 'last' : Number(day)
  const change = pence === undefined ? undefined : { entryAmountPence: pence, day: chosenDay, month: Number(renewMonth) }
  const after = change && editable ? answerRenewal(document, itemId, date, change) : undefined
  const changed = !!after && after.budget !== document.budget
  const impact = changed ? budgetImpact(document, after, month, [itemId]) : undefined
  const thisYear = pence ?? item.entryAmountPence
  const newMonthly = monthlyContributionPence(thisYear, 'annually')

  const sameText = `${item.name}: same price`
  const same = () => {
    setDocument(current => answerRenewal(current, itemId, date))
    onAnswered(sameText, undoRenewalAnswer(document, itemId, date))
  }
  const save = () => {
    if (!change) { setError('Enter the yearly price, like 104.00.'); return }
    setDocument(current => answerRenewal(current, itemId, date, change))
    onAnswered(changed ? `${item.name} saved from ${monthName}` : sameText, undoRenewalAnswer(document, itemId, date))
  }
  const what = tracked
    ? `This year’s ${pounds(thisYear)} comes from ${destination} when you sort it from the ${cardName} statement.`
    : item.destination.kind === 'account'
      ? `North lists ${pounds(thisYear)} from ${destination} on ${dayMonth(date)}.`
      : `North marks ${pounds(thisYear)} as paid from ${destination} on ${dayMonth(date)}.`

  const footer = <>
    <button type="button" className="secondary-button" onClick={same}>Same price</button>
    {editable && <button type="button" className="primary-button" onClick={save}>Save new price</button>}
  </>
  return <Sheet title={`${item.name} ${date < today ? 'renewed' : 'renews'}`} description={`${longDate(date)} · ${paidByLabel({ ...bill, tracked }, cards)} · ${destination}`} size="sm" onClose={onClose} footer={footer} className="renewal-sheet">
    <div className="renewal-body">
      <p className="renewal-planned"><span>Planned now</span><strong>{pounds(item.entryAmountPence)} a year <small>· {pounds(item.amountPence)} a month</small></strong></p>
      {editable ? <>
        <label className="renewal-field">New price
          <input data-autofocus inputMode="decimal" value={price} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : `${id}-price-hint`} onChange={event => { setPrice(event.target.value); setError(undefined) }}/>
          <small id={`${id}-price-hint`}>The yearly price on the renewal letter or email.</small>
        </label>
        {error && <p id={`${id}-error`} className="renewal-error" role="alert">{error}</p>}
        <div className="renewal-when"><div className="renewal-date">
          <label className="renewal-field">Next renewal<select value={day} onChange={event => setDay(event.target.value)}>
            {DAYS.map(value => <option key={value} value={String(value)}>{value}</option>)}
            <option value="last">Last day</option>
          </select></label>
          <label className="renewal-field"><span aria-hidden="true">&nbsp;</span><select aria-label="Renewal month" value={renewMonth} onChange={event => setRenewMonth(event.target.value)}>
            {MONTH_NAMES.map((name, index) => <option key={name} value={String(index + 1)}>{name}</option>)}
          </select></label>
        </div>
        <p className="renewal-next">{longDate(renewalAfter(date, chosenDay, Number(renewMonth)))}</p></div>
      </> : <p className="renewal-note">{item.name} is split by fixed amounts, so change its price in the item editor.</p>}
      {changed && <section className="renewal-impact" aria-label={`From ${monthName}`}>
        <strong>From {monthName}</strong>
        <p className="renewal-impact-row"><span>{destination} {item.destination.kind === 'pot' ? 'sets aside' : 'gets'}</span><span><s>{pounds(item.amountPence)}</s> → <strong>{pounds(newMonthly)} a month</strong></span></p>
        <ImpactPreview compact scopeText={`Changes apply: ${formatEditScope(budgetEditScope(after.budget, month))}.`} result={impact} document={after}/>
      </section>}
      <p className="renewal-note"><CalendarDays aria-hidden="true"/><span>{what}</span></p>
      <button type="button" className="text-button renewal-edit" onClick={() => onEditItem(itemId, month)}>Switched provider? Edit the item</button>
    </div>
  </Sheet>
}
