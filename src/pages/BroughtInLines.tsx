import type { BudgetDocument } from '../domain/budgetDocument'
import type { BroughtIn } from '../domain/bringIn'
import { cardTracker } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { potPhrase } from '../domain/setAside'
import { formatMonth } from '../formatting/month'
import { dayDate, destinationNamer } from './cardLabels'
import { billName, billParts, plural, pounds, signedPounds } from './spendingFormat'
import './BroughtInLines.css'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
/** "On track" mid-sentence. */
const midSentence = (text: string) => text === 'On track' ? 'on track' : text

/**
 * What a bring-in did, in lines (month-health PR 7): where it sorted to, the rows that belong to an earlier month,
 * how the month's pots moved, the bills that went out, the refunds and the bill's sum. Shared by the Bring in result
 * and Home's "Just brought in" card. Home's is `compact`: no verdict (it's just above), and no sorted-to, bills or bill lines (the pot cards and the Amex card carry those).
 */
export function BroughtInLines({ document, broughtIn, verdict, month, compact = false }: { document: BudgetDocument; broughtIn: BroughtIn; verdict?: string | undefined; month: string; compact?: boolean }) {
  const name = destinationNamer(document)
  /** The pot's own name, without its account. */
  const potName = (destination: BudgetDestination) => name(destination).split(' · ')[0]!
  const { sortedTo, earlier, changes, bills, refunds, bill } = broughtIn
  const card = cardTracker(document).cards.find(row => row.id === broughtIn.cardId)
  const amexPot = card?.setAside && document.budget.pots.find(pot => pot.id === card.setAside!.potId)
  return <dl className="brought-in-lines">
    {!compact && sortedTo.length > 0 && <div><dt>Sorted to</dt><dd>{sortedTo.map(row => `${potName(row.destination)} ${signedPounds(row.pence)}`).join(' · ')}</dd></div>}
    {earlier.length > 0 && <div className="is-flag"><dt>Earlier months</dt><dd>{earlier.map(row => `${row.count} ${row.count === 1 ? 'is' : 'are'} ${monthName(row.month)}’s`).join(', ')}. They count in their own month.</dd></div>}
    {(verdict || changes.length > 0) && <div><dt>{monthName(month)}</dt><dd>
      {verdict && <span className="brought-in-verdict">{verdict}</span>}
      {changes.length > 0 && <ul>{changes.map(change => <li key={change.key}>{potName(change.destination)} went from {midSentence(change.from.text)} to {midSentence(change.to.text)}</li>)}</ul>}
    </dd></div>}
    {!compact && bills.length > 0 && <div><dt>{bills.length === 1 ? 'Bill gone out' : 'Bills gone out'}</dt><dd>{bills.map(row => `${row.description} ${pounds(row.pence)}`).join(' · ')}</dd></div>}
    {refunds.length > 0 && <div><dt>{plural(refunds.length, 'refund')}</dt><dd><ul>{refunds.map(row => <li key={row.id}>
      {row.description} {signedPounds(row.pence)}, {dayDate(row.date)}{row.of ? `, refund of ${row.of}` : ', no purchase found'}{row.destination ? `, back to ${potName(row.destination)}` : ', to sort'}
    </li>)}</ul></dd></div>}
    {!compact && bill && <div><dt>{billName(bill.closeDate, bill.open)}</dt><dd>{pounds(bill.billPence)}{amexPot ? ` = ${billParts(bill, potPhrase(amexPot.name))}` : ''}</dd></div>}
  </dl>
}
