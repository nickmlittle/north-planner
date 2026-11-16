import type { BudgetDocument } from '../domain/budgetDocument'
import { carriedOverByMonth, moneyIn, recentMonths, type WeekFigures } from '../domain/potSum'
import { potBalance } from '../domain/potBalances'
import { heldInPot } from '../domain/expectingBack'
import { cardTracker } from '../domain/cardTracker'
import { Section } from '../components/ui'
import { formatMonth } from '../formatting/month'
import { dayDate } from './cardLabels'
import { dayOf, pounds, signedPounds } from './spendingFormat'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!

/** A Tracked pot's weekly line and typical shop, under its Left (P3, P4): "This week £140.00 · to Sun 22 Nov". */
export function WeekLines({ week, shop, onTry }: { week?: WeekFigures; shop?: { pence: number; count: number }; onTry: (pence: number) => void }) {
  return <>
    {week && <p className="pot-lead-week"><strong>{week.label}</strong> {pounds(week.pence)}<small> · {week.pence === 0 ? 'nothing to spend' : `to ${dayDate(week.through)}`}</small></p>}
    {shop && <p className="pot-lead-shop">A typical shop is {pounds(shop.pence)}<small> · average of {shop.count} · <button type="button" className="text-button" onClick={() => onTry(shop.pence)}>Try it</button></small></p>}
  </>
}

/** Held in the pot (D11): items ticked Back, not spent and not moved until the refund or the bill. Nothing when none. */
export function HeldLine({ pence }: { pence: number }) {
  return pence > 0 ? <p className="pot-lead-held">{pounds(pence)} expecting back<small> · held here until the refund or the bill, not spent</small></p> : null
}

/** Can we afford… from a pot page (PR 8): one row that opens the sheet with this pot chosen. */
export function AffordRow({ onOpen }: { onOpen: () => void }) {
  return <p className="pot-afford"><button type="button" className="text-button" onClick={onOpen}>Can we afford…</button><small> an amount before you spend it</small></p>
}

/** A Funded only pot's lead (D3): what payday moved in and what went on the Amex, with the next move. No Left, no pace. */
export function FundedLead({ document, potId, month, today, bank, onCheck }: { document: BudgetDocument; potId: string; month: string; today: string; bank: string; onCheck: () => void }) {
  const money = moneyIn(document, potId, month, today)
  const balance = potBalance(document, potId, today)
  return <section className="pot-lead" aria-labelledby="pot-lead-label">
    <p className="pot-lead-label" id="pot-lead-label">{money.movedInPence !== undefined ? 'Moved in on payday' : 'To move in on payday'}</p>
    <p className="pot-lead-value">{pounds(money.movedInPence ?? money.plannedPence)}</p>
    <p className="pot-lead-status">{pounds(money.onCardPence)} on the Amex</p>
    {balance.waitingPence !== 0 && <p className="pot-lead-pace">Next move to the Amex pot: {pounds(balance.waitingPence)}</p>}
    <HeldLine pence={heldInPot(cardTracker(document), potId, today)}/>
    <p className="pot-lead-bills">North only sees the Amex part of what’s spent. What’s in it now? <button type="button" className="text-button" onClick={onCheck}>Check {bank}</button></p>
  </section>
}

/** A Saving pot's lead (D2): what's built up, what payday put by this month and what was spent from it. */
export function SavingLead({ document, potId, month, today }: { document: BudgetDocument; potId: string; month: string; today: string }) {
  const money = moneyIn(document, potId, month, today)
  const balance = potBalance(document, potId, today)
  const spent = money.onCardPence
  const putBy = money.movedInPence ?? money.plannedPence
  return <section className="pot-lead" aria-labelledby="pot-lead-label">
    <p className="pot-lead-label" id="pot-lead-label">Built up</p>
    <p className="pot-lead-value">{balance.balancePence === undefined ? '—' : signedPounds(balance.balancePence)}</p>
    {(putBy !== 0 || spent !== 0) && <dl className="carry-over-sums">
      {putBy !== 0 && <div><dt>{money.movedInPence !== undefined ? `Put by ${monthName(month)}` : `To put by ${monthName(month)}`}</dt><dd>{pounds(putBy)}</dd></div>}
      {spent !== 0 && <div><dt>Spent from it</dt><dd>{signedPounds(-spent)}</dd></div>}
    </dl>}
  </section>
}

/** Carried over by month (D13): the closed months' leftovers still in the pot, and anything moved out. Absent when there are none. */
export function CarriedOverList({ document, potId, month }: { document: BudgetDocument; potId: string; month: string }) {
  const carried = carriedOverByMonth(document, potId, month)
  if (!carried.months.length && !carried.movedOut.length) return null
  return <Section title="Carried over" count={signedPounds(carried.totalPence)}>
    <dl className="carry-over-sums" aria-label="Carried over by month">
      {carried.months.map(row => <div key={row.month}><dt>{formatMonth(row.month)}</dt><dd>{signedPounds(row.pence)}</dd></div>)}
      {carried.movedOut.map(row => <div key={row.at}><dt>Moved out · {dayOf(row.at)}</dt><dd>{signedPounds(-row.pence)}</dd></div>)}
    </dl>
  </Section>
}

/** The last 3 months of a Tracked pot: planned, spent, and what was left or over. */
export function LastMonths({ document, potId, month, today }: { document: BudgetDocument; potId: string; month: string; today: string }) {
  const months = recentMonths(document, potId, month, today)
  if (!months.length) return null
  return <Section title="Last 3 months">
    <ul className="pot-list pot-months">{months.map(row => <li key={row.month}>
      <span className="pot-month-name">{formatMonth(row.month)}</span>
      <span className="pot-month-meta">{pounds(row.spentPence)} of {pounds(row.plannedPence)}</span>
      <span className={row.leftPence < 0 ? 'pot-month-left is-over' : 'pot-month-left'}>{row.leftPence < 0 ? `${pounds(-row.leftPence)} over` : `${pounds(row.leftPence)} left`}</span>
    </li>)}</ul>
  </Section>
}
