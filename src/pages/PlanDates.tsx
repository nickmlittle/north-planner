import { Bell, BellOff } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker } from '../domain/cardTracker'
import { planDates, type DatedItem, type RenewingItem } from '../domain/recurringBills'
import type { BudgetItem } from '../domain/monthlyBudget'
import { EmptyState, ListRow, Section, useMobilePresentation } from '../components/ui'
import { formatMonth } from '../formatting/month'
import { paidByLabel } from './billLabels'
import { ordinal, shortDate } from './cardLabels'
import type { planItemLabels } from './planRows'
import { pounds } from './spendingFormat'
import './PlanDates.css'

type Props = {
  document: BudgetDocument
  month: string
  /** The month's items after Plan's filters. */
  items: readonly BudgetItem[]
  labels: ReturnType<typeof planItemLabels>
  today: string
  onEdit: (item: BudgetItem) => void
}

const dayLabel = (row: DatedItem) => row.bill.day === 'last' ? 'Last day' : ordinal(row.bill.day)
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** A yearly bill's reminder: "Showing on Home" once it's due to remind, "From 15 Dec" before, or "Off". */
function reminder(row: RenewingItem, today: string): { text: string; on: boolean; now: boolean } {
  if (!row.remindFrom) return { text: 'Off', on: false, now: false }
  return row.remindFrom <= today ? { text: 'Showing on Home', on: true, now: true } : { text: `From ${shortDate(row.remindFrom)}`, on: true, now: false }
}

/** The reminder in a phone row's meta: "On Home now", "Reminds from 15 Dec" or "No reminder". */
function phoneReminder(row: RenewingItem, today: string) {
  const state = reminder(row, today)
  return !state.on ? 'No reminder' : state.now ? 'On Home now' : `Reminds ${state.text.replace('From', 'from')}`
}

/**
 * Plan › Dates (board 5): every monthly bill by day and every yearly bill by its next renewal, with a prompt for yearly
 * items that have no date. Each row opens the item editor.
 */
export function PlanDates({ document, month, items, labels, today, onEdit }: Props) {
  const mobile = useMobilePresentation()
  const cards = cardTracker(document).cards
  const { monthly, yearly, undated } = planDates(document, items, today)
  const how = (row: DatedItem) => paidByLabel({ paidBy: row.bill.paidBy, tracked: row.tracked, cardId: row.bill.cardId }, cards)
  const monthlyTotal = monthly.reduce((sum, row) => sum + row.item.amountPence, 0)
  const yearlyTotal = yearly.reduce((sum, row) => sum + row.item.entryAmountPence, 0)
  const setAside = yearly.reduce((sum, row) => sum + row.item.amountPence, 0)
  const prompt = undated.length > 0 && <div className="plan-dates-prompt" role="status">
    <p><strong>{plural(undated.length, 'yearly item')} {undated.length === 1 ? 'has' : 'have'} no renewal date.</strong> <span>{undated.map(item => item.name).join(', ')}</span></p>
    <button type="button" className="secondary-button" onClick={() => onEdit(undated[0]!)}>Add dates</button>
  </div>

  if (!monthly.length && !yearly.length) return <div className="plan-dates">
    {prompt}
    <EmptyState title="No recurring bills yet">Tick Recurring bill on an item to give it a date, and it shows here.</EmptyState>
  </div>

  const bell = (row: RenewingItem) => { const state = reminder(row, today); const Icon = state.on ? Bell : BellOff; return <span className={`plan-dates-reminder${state.now ? ' is-now' : ''}`}><Icon aria-hidden="true"/>{state.text}</span> }
  return <div className="plan-dates" aria-label={`Bills by date, ${formatMonth(month)}`}>
    {prompt}
    {monthly.length > 0 && <Section title="Every month" count={`${pounds(monthlyTotal)} a month`}>
      {mobile ? <ul className="plan-dates-list" aria-label="Every month">{monthly.map(row => <li key={row.item.id}>
        <ListRow title={row.item.name} meta={`${dayLabel(row)} · ${how(row)} · ${labels.destinationLabel(row.item)}`} trailing={pounds(row.item.amountPence)} onOpen={() => onEdit(row.item)}/>
      </li>)}</ul>
        : <div className="plan-dates-wrap"><table className="plan-dates-table">
          <caption className="visually-hidden">Every month, by day</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Item</th><th scope="col">Paid by</th><th scope="col">Goes to</th><th scope="col" className="is-num">Amount</th></tr></thead>
          <tbody>{monthly.map(row => <tr key={row.item.id} onClick={event => { if (!(event.target as HTMLElement).closest('button')) onEdit(row.item) }}>
            <td className="plan-dates-day">{dayLabel(row)}</td>
            <th scope="row"><button type="button" className="plan-dates-name" onClick={() => onEdit(row.item)}>{row.item.name}</button></th>
            <td>{how(row)}</td><td>{labels.destinationLabel(row.item)}</td><td className="is-num">{pounds(row.item.amountPence)}</td>
          </tr>)}</tbody>
        </table></div>}
    </Section>}
    {yearly.length > 0 && <Section title="Once a year" count={mobile ? `${pounds(setAside)} a month` : `${pounds(yearlyTotal)} a year · ${pounds(setAside)} a month set aside`}>
      {mobile ? <ul className="plan-dates-list" aria-label="Once a year">{yearly.map(row => <li key={row.item.id}>
        <ListRow title={row.item.name} meta={`Renews ${shortDate(row.renews)} · ${how(row)} · ${phoneReminder(row, today)}`} trailing={pounds(row.item.entryAmountPence)} trailingMeta={`${pounds(row.item.amountPence)} a month`} onOpen={() => onEdit(row.item)}/>
      </li>)}</ul>
        : <div className="plan-dates-wrap"><table className="plan-dates-table">
          <caption className="visually-hidden">Once a year, by renewal</caption>
          <thead><tr><th scope="col">Renews</th><th scope="col">Item</th><th scope="col">Paid by</th><th scope="col">Reminder</th><th scope="col" className="is-num">Amount</th></tr></thead>
          <tbody>{yearly.map(row => <tr key={row.item.id} onClick={event => { if (!(event.target as HTMLElement).closest('button')) onEdit(row.item) }}>
            <td className="plan-dates-day">{shortDate(row.renews)}</td>
            <th scope="row"><button type="button" className="plan-dates-name" onClick={() => onEdit(row.item)}>{row.item.name}</button><span className="plan-dates-sub">{labels.destinationLabel(row.item)}</span></th>
            <td>{how(row)}</td><td>{bell(row)}</td>
            <td className="is-num">{pounds(row.item.entryAmountPence)}<span className="plan-dates-sub">{pounds(row.item.amountPence)} a month</span></td>
          </tr>)}</tbody>
        </table></div>}
    </Section>}
  </div>
}
