import type { BudgetDocument } from '../domain/budgetDocument'
import { affordCheck, type AffordAnswer } from '../domain/afford'
import { parsePence } from '../domain/cardTracker'
import { carriedOverByMonth, moneyIn, recentMonths, type WeekFigures } from '../domain/potSum'
import { potBalance } from '../domain/potBalances'
import { Section } from '../components/ui'
import { formatGBPWhole } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { dayDate } from './cardLabels'
import { dayOf, plural, pounds, signedPounds } from './spendingFormat'

const whole = (pence: number) => formatGBPWhole(Math.round(pence / 100))
const monthName = (month: string) => formatMonth(month).split(' ')[0]!

/** A Tracked pot's weekly line and typical shop, under its Left (P3, P4): "This week £140.00 · to Sun 22 Nov". */
export function WeekLines({ week, shop, onTry }: { week?: WeekFigures; shop?: { pence: number; count: number }; onTry: (pence: number) => void }) {
  return <>
    {week && <p className="pot-lead-week"><strong>{week.label}</strong> {pounds(week.pence)}<small> · {week.pence === 0 ? 'nothing to spend' : `to ${dayDate(week.through)}`}</small></p>}
    {shop && <p className="pot-lead-shop">A typical shop is {pounds(shop.pence)}<small> · average of {shop.count} · <button type="button" className="text-button" onClick={() => onTry(shop.pence)}>Try it</button></small></p>}
  </>
}

/** What the answer says, as sentences: nothing is recorded. */
function answerLines(answer: AffordAnswer, bank: string, month: string): { tone: 'yes' | 'over' | 'check'; lines: string[] } | null {
  if (answer.kind === 'not-offered') return null
  if (answer.kind === 'funded-only') return { tone: 'check', lines: [`Check ${bank}: North only sees what goes on the Amex.`, ...answer.goesOnAmex ? ['If it goes on the Amex, it moves to the Amex pot at your next move.'] : []] }
  const sorted = answer.toSort && `${answer.toSort.leftIfSortedPence < 0 ? `${pounds(-answer.toSort.leftIfSortedPence)} over` : `${pounds(answer.toSort.leftIfSortedPence)} left`} if the ${plural(answer.toSort.count, 'row')} to sort (${pounds(answer.toSort.pence)}) went here too.`
  if (answer.kind === 'over') return { tone: 'over', lines: [`${pounds(answer.overPence)} over.`, `Covered when ${monthName(month)} closes.`, ...sorted ? [sorted] : []] }
  return { tone: 'yes', lines: [
    `Yes. ${pounds(answer.leftAfterPence)} left${answer.daysLeft > 0 ? ` for the last ${plural(answer.daysLeft, 'day')}` : ''}.`,
    ...answer.pace === 'ahead' ? [`About ${whole(answer.aheadPence!)} ahead of pace.`] : answer.pace === 'on-pace' ? ['Still on pace.'] : [],
    ...sorted ? [sorted] : [],
  ] }
}

/** Try an amount (`affordCheck`): type what you're about to spend, see the answer. Nothing is saved. */
export function TryAnAmount({ document, potId, today, bank, month, value, onChange }: { document: BudgetDocument; potId: string; today: string; bank: string; month: string; value: string; onChange: (value: string) => void }) {
  const pence = parsePence(value)
  const answer = pence && pence > 0 ? affordCheck(document, potId, pence, today) : undefined
  const shown = answer && answerLines(answer, bank, month)
  return <Section title="Try an amount">
    <div className="pot-try">
      <label className="spending-field">Before you spend it
        <input inputMode="decimal" value={value} placeholder="£0.00" onChange={event => onChange(event.target.value)} aria-describedby="pot-try-answer"/>
      </label>
      <div id="pot-try-answer" role="status" className={`pot-try-answer${shown ? ` is-${shown.tone}` : ''}`}>
        {shown ? shown.lines.map(line => <p key={line}>{line}</p>) : <p>{value.trim() && pence === null ? 'Enter an amount, like 42.50.' : 'Nothing is saved.'}</p>}
      </div>
    </div>
  </Section>
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
