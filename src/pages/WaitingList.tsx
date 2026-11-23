import { ChevronRight } from 'lucide-react'
import { ListRow, Section, useMobilePresentation } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { transactionsWaiting, type WaitingGroup } from '../domain/cardSorting'
import { WAITING_NOTE_MAX, localDate, type CardTransaction, type WaitingOn } from '../domain/cardTracker'
import { dayDate } from './cardLabels'
import { cardLabel, plural, sameReason, signedPounds, waitedFor, waitingReason, waitingReasons } from './spendingFormat'
import './WaitingList.css'

type Props = {
  document: BudgetDocument
  /** Open a waiting row in the sort sheet. */
  onOpen: (id: string) => void
  /** Go through them: a group's rows, in order. */
  onGoThrough: (group: WaitingGroup) => void
  today?: string
}

/**
 * Spending › Waiting (audit 6, W8): the rows that can't be sorted yet, grouped by reason (Ask Ada, Ask Ben, To discuss),
 * each group with its count, total and Go through them. Desktop shows a table (date, merchant with its note, card,
 * amount, days waited); phones a list with the note in the meta line. Waiting rows count in no pot until sorted (W1).
 */
export function WaitingList({ document, onOpen, onGoThrough, today = localDate() }: Props) {
  const compact = useMobilePresentation()
  const groups = transactionsWaiting(document)
  if (!groups.length) return null
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const total = groups.reduce((sum, group) => sum + group.totalPence, 0)
  const reason = (group: WaitingGroup) => waitingReason(document, group.on)
  const person = (transaction: CardTransaction) => document.household.adults.find(adult => adult.id === transaction.personId)?.name
  const note = (transaction: CardTransaction) => transaction.waiting?.note ? `“${transaction.waiting.note}”` : ''
  const goThrough = (group: WaitingGroup) => <button type="button" className="secondary-button waiting-go" aria-label={`Go through them: ${reason(group)}`} onClick={() => onGoThrough(group)}>Go through them</button>
  const groupCount = (group: WaitingGroup) => `${group.rows.length} · ${signedPounds(group.totalPence)}`

  return <Section title="Waiting" count={`${count} · ${signedPounds(total)}`} aside={compact ? undefined : 'Not in any pot until they’re sorted'}>
    {compact ? <div className="waiting-card">{groups.map(group => <section key={group.key} className="waiting-group" aria-label={reason(group)}>
      <div className="waiting-group-head"><h3 className="waiting-group-name">{reason(group)}</h3><span className="waiting-group-count">{groupCount(group)}</span>{goThrough(group)}</div>
      <ul className="waiting-rows">{group.rows.map(transaction => {
        // The cardholder shows when they aren't the one being asked.
        const who = group.on.kind === 'person' && group.on.personId === transaction.personId ? '' : person(transaction) ?? cardLabel(document, transaction)
        const meta = [dayDate(transaction.date), who, waitedFor(transaction.waiting!.at, today), note(transaction)].filter(Boolean).join(' · ')
        return <li key={transaction.id}><ListRow title={transaction.description} meta={meta}
          label={[transaction.description, signedPounds(transaction.amountPence), meta].join(', ')}
          trailing={<span className={transaction.amountPence < 0 ? 'spending-credit' : undefined}>{signedPounds(transaction.amountPence)}</span>} onOpen={() => onOpen(transaction.id)}/></li>
      })}</ul>
    </section>)}</div>
      : <div className="sort-table-wrap">
        <table className="sort-table waiting-table" aria-label={`Waiting, ${plural(count, 'transaction')}`}>
          <colgroup><col className="sort-col-date"/><col/><col className="sort-col-card"/><col className="sort-col-amount"/><col className="waiting-col-days"/><col className="waiting-col-open"/></colgroup>
          <thead><tr><th scope="col">Date</th><th scope="col">Merchant</th><th scope="col">Card</th><th scope="col" className="is-amount">Amount</th><th scope="col">Waiting</th><th scope="col"><span className="visually-hidden">Open</span></th></tr></thead>
          {groups.map(group => <tbody key={group.key}>
            <tr className="waiting-group-row"><th scope="colgroup" colSpan={6}><div className="waiting-group-head"><span className="waiting-group-name">{reason(group)}</span><span className="waiting-group-count">{groupCount(group)}</span>{goThrough(group)}</div></th></tr>
            {group.rows.map(transaction => <tr key={transaction.id} className="sort-table-row waiting-row" data-transaction={transaction.id} onClick={() => onOpen(transaction.id)}>
              <td>{dayDate(transaction.date)}</td>
              <td><span className="sort-table-merchant">{transaction.description}</span>{transaction.waiting?.note && <span className="waiting-note" title={transaction.waiting.note}>{note(transaction)}</span>}</td>
              <td>{cardLabel(document, transaction)}</td>
              <td className={`is-amount${transaction.amountPence < 0 ? ' is-credit' : ''}`}>{signedPounds(transaction.amountPence)}</td>
              <td className="waiting-days">{waitedFor(transaction.waiting!.at, today)}</td>
              <td><button type="button" className="icon-button" aria-label={`Open ${transaction.description}`} onClick={event => { event.stopPropagation(); onOpen(transaction.id) }}><ChevronRight aria-hidden="true"/></button></td>
            </tr>)}
          </tbody>)}
        </table>
      </div>}
  </Section>
}

/**
 * Who it's waiting on and an optional note (W5, W6): the reasons as toggle buttons, the cardholder first, then the note
 * box. The sort sheet uses it to change a mark (waiting/3) and, from waiting/4, to mark one.
 */
export function WaitingFields({ document, transaction, on, note, onChangeOn, onChangeNote }: {
  document: BudgetDocument
  transaction: CardTransaction
  on: WaitingOn | undefined
  note: string
  onChangeOn: (on: WaitingOn) => void
  onChangeNote: (note: string) => void
}) {
  return <div className="waiting-fields">
    <div className="waiting-reasons" role="group" aria-label="Waiting on">
      {waitingReasons(document, transaction).map(reason => <button key={reason.kind === 'person' ? reason.personId : 'discuss'} type="button" className="waiting-reason" aria-pressed={sameReason(reason, on)} onClick={() => onChangeOn(reason)}>{waitingReason(document, reason)}</button>)}
    </div>
    <label className="spending-field">Note (optional)<input className="waiting-note-input" value={note} maxLength={WAITING_NOTE_MAX} onChange={event => onChangeNote(event.target.value)} enterKeyHint="done"/></label>
  </div>
}
