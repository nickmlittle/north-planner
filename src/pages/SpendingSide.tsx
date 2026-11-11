import type { BudgetDocument } from '../domain/budgetDocument'
import { monthSpending } from '../domain/cardSpending'
import { statementKeys, statementSummary } from '../domain/cardStatements'
import { cardTracker, monthOf } from '../domain/cardTracker'
import { formatMonth } from '../formatting/month'
import { dayDate, destinationNamer } from './cardLabels'
import { pounds, signedPounds, statementName, statementStatus } from './spendingFormat'

type Props = { document: BudgetDocument; today: string; onOpenMonth: () => void; onOpenPot: (potId: string) => void; onOpenStatement: (key: string) => void }

/** Desktop: the month and the statement to settle stay beside the list, so a sort lands where you can see it (board 7). */
export function SpendingSide({ document, today, onOpenMonth, onOpenPot, onOpenStatement }: Props) {
  const month = monthOf(today)
  const figures = monthSpending(document, month, today)
  const name = destinationNamer(document)
  const card = cardTracker(document).cards[0]
  // The statement to act on: the oldest closed one not settled, else the open one.
  const summaries = statementKeys(cardTracker(document)).map(key => statementSummary(document, key, today)!).filter(Boolean).reverse()
  const statement = summaries.find(row => !row.open && !row.settled) ?? summaries.find(row => row.open)
  return <aside className="spending-side" aria-label={`${formatMonth(month)} and the current statement`}>
    <section className="spending-side-card" aria-labelledby="side-month">
      <h2 id="side-month" className="spending-eyebrow">{formatMonth(month).split(' ')[0]} so far</h2>
      <p className="spending-big">{pounds(figures.spentPence)} <small>of {pounds(figures.plannedPence)}</small></p>
      <ul className="spending-side-pots">{figures.rows.filter(row => row.destination.kind === 'pot').map(row => <li key={row.key}><button type="button" className="text-button" onClick={() => onOpenPot((row.destination as { potId: string }).potId)}>{name(row.destination)}</button>
        <span className={`spending-pot-status is-${row.status}`}>{row.carriesOver ? `${signedPounds(row.spentPence)} this month` : row.status === 'over' ? `${pounds(-row.leftPence)} over` : `${pounds(row.leftPence)} left`}</span></li>)}</ul>
      <button type="button" className="secondary-button" onClick={onOpenMonth}>Open This month</button>
    </section>
    {statement && card && <section className="spending-side-card" aria-labelledby="side-statement">
      <h2 id="side-statement" className="spending-eyebrow">{statementName(statement.closeDate)}</h2>
      <p className="spending-big">{signedPounds(statement.totalPence)} <small>due {dayDate(statement.dueDate)}</small></p>
      <p className={`statement-status is-${statementStatus(statement).tone}`}>{statementStatus(statement).text}</p>
      <button type="button" className={statement.ready ? 'primary-button' : 'secondary-button'} onClick={() => onOpenStatement(statement.key)}>Open statement</button>
    </section>}
  </aside>
}
