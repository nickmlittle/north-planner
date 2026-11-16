import type { BudgetDocument } from '../domain/budgetDocument'
import type { MonthSummary } from '../domain/monthSummary'
import { cardTracker, shiftMonth } from '../domain/cardTracker'
import { potPhrase } from '../domain/setAside'
import { formatMonth } from '../formatting/month'
import { destinationNamer } from './cardLabels'
import { billName, billParts, dayOf, plural, pounds } from './spendingFormat'
import './MonthSummaryCard.css'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!

/** "£41.80 more than September", "£12.00 less than September"; nothing when the two months spent the same. */
const against = (pence: number, lastPence: number | undefined, last: string) => lastPence === undefined || pence === lastPence ? '' : `${pounds(Math.abs(pence - lastPence))} ${pence > lastPence ? 'more' : 'less'} than ${last}`

/**
 * "How did October go?" (month-health PR 11, P8): the closed month's verdict, its Tracked pots against plan and the
 * month before, Bills, Saving, the covers, what carries into the next month and the bill that's open now. On Home it
 * leads until Seen it; on Month it sits above the close sections, without the button.
 */
export function MonthSummaryCard({ document, summary, onSeen, onOpenMonth, onOpenPot }: { document: BudgetDocument; summary: MonthSummary; onSeen?: () => void; onOpenMonth?: () => void; onOpenPot?: (potId: string) => void }) {
  const name = monthName(summary.month), nextName = monthName(shiftMonth(summary.month, 1)), lastName = monthName(shiftMonth(summary.month, -1))
  const destination = destinationNamer(document)
  const card = cardTracker(document).cards.find(row => row.setAside)
  const amexPot = card?.setAside && document.budget.pots.find(pot => pot.id === card.setAside!.potId)
  const { bill } = summary
  const potLine = (row: MonthSummary['tracked'][number]) => [`${pounds(row.spentPence)} of ${pounds(row.plannedPence)}`, against(row.spentPence, row.lastMonthSpentPence, lastName)].filter(Boolean).join(' · ')
  return <section className="month-summary" aria-label={`How did ${name} go?`}>
    <header><h2>How did {name} go?</h2><span className="month-summary-date">Closed {dayOf(summary.closedAt)}</span></header>
    {summary.verdict && <p className="month-summary-verdict">{summary.verdict}</p>}
    <dl className="month-summary-lines">
      {summary.tracked.length > 0 && <div><dt>Tracked pots</dt><dd>
        <span className="month-summary-total">{[`${pounds(summary.trackedSpentPence)} of ${pounds(summary.trackedPlannedPence)}`, against(summary.trackedSpentPence, summary.lastMonthSpentPence, lastName)].filter(Boolean).join(' · ')}</span>
        <ul>{summary.tracked.map(row => <li key={row.potId}>{onOpenPot ? <button type="button" className="text-button" onClick={() => onOpenPot(row.potId)}>{row.name}</button> : row.name} {potLine(row)}</li>)}</ul>
      </dd></div>}
      {summary.bills && <div><dt>Bills</dt><dd>{pounds(summary.bills.spentPence)} of {pounds(summary.bills.plannedPence)} went out</dd></div>}
      {summary.saving && <div><dt>Saving</dt><dd>{pounds(summary.saving.plannedPence)} put by{summary.saving.spentPence > 0 ? ` · ${pounds(summary.saving.spentPence)} spent from it` : ''}</dd></div>}
      <div><dt>Covers</dt><dd>{summary.covers.length ? <>
        {summary.fromBufferPence > 0 && <span className="month-summary-total">{pounds(summary.fromBufferPence)} from the buffer</span>}
        <ul>{summary.covers.map(row => <li key={row.potId}>{row.name} {pounds(row.pence)} {row.source.kind === 'next-month' ? `from ${nextName}’s ${row.name}` : `from ${destination(row.source)}`} · {row.source.kind === 'next-month' ? 'moves no money' : row.ticked ? 'moved' : 'not moved yet'}</li>)}</ul>
      </> : 'None: no pot went over'}</dd></div>
      <div className="is-carry"><dt>Into {nextName}</dt><dd><ul>
        {summary.leftovers.map(row => <li key={row.potId}>{row.name} {pounds(row.leftPence)} stays in the pot{row.builtUpPence > row.leftPence ? ` · ${pounds(row.builtUpPence)} built up` : ''}</li>)}
        {summary.nextMonthPence > 0 && <li>{nextName} starts {pounds(summary.nextMonthPence)} short, from {plural(summary.covers.filter(row => row.source.kind === 'next-month').length, 'cover')}</li>}
        {!summary.leftovers.length && summary.nextMonthPence === 0 && <li>Nothing carries over</li>}
      </ul></dd></div>
      {bill && <div><dt>{billName(bill.closeDate, bill.open)}</dt><dd>{pounds(bill.billPence)}{amexPot ? ` = ${billParts(bill, potPhrase(amexPot.name))}` : ''}</dd></div>}
    </dl>
    {(onSeen || onOpenMonth) && <div className="month-summary-actions">
      {onSeen && <button type="button" className="primary-button" onClick={onSeen}>Seen it</button>}
      {onOpenMonth && <button type="button" className="secondary-button" onClick={onOpenMonth}>Open {name}</button>}
    </div>}
  </section>
}
