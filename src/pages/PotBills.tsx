import type { BudgetDocument } from '../domain/budgetDocument'
import type { DestinationSpending } from '../domain/cardSpending'
import { cardTracker } from '../domain/cardTracker'
import { yearlyBillsFor, type MonthBill } from '../domain/recurringBills'
import { Section, StatStrip, StatTile, useMobilePresentation } from '../components/ui'
import { formatMonth } from '../formatting/month'
import { billStatus, paidByLabel, spentParts } from './billLabels'
import { dayDate, shortDate } from './cardLabels'
import { pounds } from './spendingFormat'

/** A carry-over pot with bills: Planned · Spent · Left for the month, with Due under Left (P1). */
export function PotMonthFigures({ document, row }: { document: BudgetDocument; row: DestinationSpending }) {
  return <Section title="This month">
    <StatStrip label="Planned, spent and left this month">
      <StatTile label="Planned" value={pounds(row.plannedPence)}/>
      <StatTile label="Spent" value={pounds(row.spentPence)} detail={spentParts(document, row) || undefined}/>
      <StatTile label={row.leftPence < 0 ? 'Over' : 'Left'} value={pounds(Math.abs(row.leftPence))} tone={row.leftPence < 0 ? 'critical' : 'neutral'} detail={row.duePence ? `${pounds(row.duePence)} of it due` : undefined}/>
    </StatStrip>
  </Section>
}

type Line = { kind: 'bill'; bill: MonthBill } | { kind: 'today' }

/** The bills with a Today line before the first one still to come (current month only). */
function withToday(bills: readonly MonthBill[], month: string, today: string): Line[] {
  const lines: Line[] = bills.map(bill => ({ kind: 'bill', bill }))
  if (today.slice(0, 7) !== month) return lines
  const at = bills.findIndex(bill => bill.date > today)
  lines.splice(at < 0 ? lines.length : at, 0, { kind: 'today' })
  return lines
}

/**
 * Bills this month (boards 3–4): every bill to the pot by date, how it's paid, the amount and its status, with a Today
 * line. Bills on a tracked card are muted and read "Via Amex": their spending comes from Sort.
 */
export function BillsThisMonth({ document, bills, month, today }: { document: BudgetDocument; bills: readonly MonthBill[]; month: string; today: string }) {
  const mobile = useMobilePresentation()
  const cards = cardTracker(document).cards
  const lines = withToday(bills, month, today)
  const trackedCard = cards.find(card => bills.some(bill => bill.tracked && bill.cardId === card.id))
  const label = (bill: MonthBill) => `${bill.name}, ${pounds(bill.amountPence)}, ${dayDate(bill.date)}, ${paidByLabel(bill, cards)}, ${billStatus(bill, today, cards)}`
  const status = (bill: MonthBill) => <span className={`pot-bill-status is-${bill.tracked ? 'tracked' : bill.state}`}>{billStatus(bill, today, cards)}</span>
  const total = bills.reduce((sum, bill) => sum + bill.amountPence, 0)
  return <Section title="Bills this month" count={`${bills.length} · ${pounds(total)}`}>
    {mobile ? <ul className="pot-bills" aria-label={`Bills in ${formatMonth(month)}`}>
      {lines.map(line => line.kind === 'today'
        ? <li key="today" className="pot-bills-today">Today · {shortDate(today)}</li>
        : <li key={line.bill.itemId} className={line.bill.tracked ? 'is-tracked' : undefined} aria-label={label(line.bill)}>
          <span className="pot-bills-date" aria-hidden="true"><strong>{Number(line.bill.date.slice(8))}</strong>{shortDate(line.bill.date).split(' ')[1]}</span>
          <span className="pot-bills-text" aria-hidden="true"><span className="pot-bills-name">{line.bill.name}</span><span className="pot-bills-meta">{paidByLabel(line.bill, cards)}</span></span>
          <span className="pot-bills-end" aria-hidden="true"><span className="pot-bills-amount">{pounds(line.bill.amountPence)}</span>{status(line.bill)}</span>
        </li>)}
    </ul>
      : <div className="pot-bills-wrap"><table className="pot-bills-table">
        <caption className="visually-hidden">Bills in {formatMonth(month)}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Item</th><th scope="col">Paid by</th><th scope="col" className="is-num">Amount</th><th scope="col">Status</th></tr></thead>
        <tbody>{lines.map(line => line.kind === 'today'
          ? <tr key="today" className="pot-bills-today"><td colSpan={5}>Today · {dayDate(today)}</td></tr>
          : <tr key={line.bill.itemId} className={line.bill.tracked ? 'is-tracked' : undefined}>
            <td>{dayDate(line.bill.date)}</td><th scope="row">{line.bill.name}</th><td>{paidByLabel(line.bill, cards)}</td>
            <td className="is-num">{pounds(line.bill.amountPence)}</td><td>{status(line.bill)}</td>
          </tr>)}</tbody>
      </table></div>}
    {trackedCard && <p className="pot-bills-note">{trackedCard.name} bills are listed for their date only. Their spending comes in when you sort the statement.</p>}
  </Section>
}

/** Yearly bills set aside here (board 4): each yearly item's renewal, monthly set-aside and yearly price. */
export function YearlyBillsSetAside({ document, potId, month, today }: { document: BudgetDocument; potId: string; month: string; today: string }) {
  const cards = cardTracker(document).cards
  const yearly = yearlyBillsFor(document, potId, month, today)
  if (!yearly.length) return null
  const set = yearly.reduce((sum, row) => sum + row.monthlyPence, 0)
  return <Section title="Yearly bills set aside here" count={`${pounds(set)} a month`}>
    <ul className="pot-yearly" aria-label="Yearly bills set aside here">{yearly.map(row => <li key={row.itemId}>
      <span className="pot-yearly-name">{row.name}</span>
      <span className="pot-yearly-when">{row.renews ? `Renews ${shortDate(row.renews)} · ${paidByLabel({ paidBy: row.paidBy!, tracked: row.tracked, cardId: row.cardId }, cards)}` : 'No renewal date'}</span>
      <span className="pot-yearly-amounts"><strong>{pounds(row.monthlyPence)}</strong> a month</span>
      <span className="pot-yearly-amounts">{pounds(row.yearlyPence)} a year</span>
    </li>)}</ul>
  </Section>
}
