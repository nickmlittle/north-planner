import { formatGBP } from '../../formatting/money'
import type { PaydayWent } from '../../domain/paydayCard'

const pounds = (pence: number) => formatGBP(pence / 100)

/**
 * Payday's Done view: once every step is ticked, where the month's money went, by account and pot. A pot's amount is
 * what it starts the month with.
 */
export function PaydayDone({ monthName, went, label, potName }: { monthName: string; went: PaydayWent; label: (accountId: string) => string; potName: (potId: string) => string }) {
  return <section className="payday-done" aria-label={`Where ${monthName}’s money went`}>
    <h3>{monthName} is funded</h3>
    <p className="payday-done-lead">{pounds(went.totalPence)} went to {went.rows.length === 1 ? 'one account' : `${went.rows.length} accounts`}. Each pot starts {monthName} with its amount.</p>
    <ul className="payday-done-list">
      {went.rows.map(row => <li key={row.accountId}>
        <p className="payday-done-account"><span>{label(row.accountId)}</span><strong>{pounds(row.amountPence)}</strong></p>
        <p className="payday-done-parts">{row.parts.map(part => `${part.potId ? potName(part.potId) : 'Direct to account'} ${pounds(part.amountPence)}`).join(' · ')}</p>
      </li>)}
      {went.unassignedPence > 0 && <li><p className="payday-done-account"><span>Unassigned</span><strong>{pounds(went.unassignedPence)}</strong></p></li>}
    </ul>
  </section>
}
