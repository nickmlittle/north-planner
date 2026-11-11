import type { ReactNode } from 'react'
import { CalendarDays, Check, ChevronRight, CreditCard, FileSpreadsheet, PiggyBank, TriangleAlert, Wallet } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, firstDayOf, parseStatementKey } from '../domain/cardTracker'
import { closeMonthPlan, homeMonths, type HomeMonth, type HomeTask } from '../domain/monthStages'
import { potPhrase } from '../domain/setAside'
import { potBalance } from '../domain/potBalances'
import { formatMonth } from '../formatting/month'
import type { SpendingView } from '../state/navigation'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { dayOf, pounds, signedPounds, statementName } from './spendingFormat'

export type SpendingTarget = { view: SpendingView; month?: string; potId?: string; statementKey?: string; close?: boolean }
type Props = { document: BudgetDocument; today: string; onOpenSpending: (target: SpendingTarget) => void; onOpenTransfers: (month: string) => void }

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`

function Row({ icon, title, sub, tone, done, onSelect }: { icon: ReactNode; title: string; sub?: string; tone?: 'warn' | 'done'; done?: boolean; onSelect: () => void }) {
  return <li><button type="button" className={`home-task${tone ? ` is-${tone}` : ''}${done ? ' is-done' : ''}`} onClick={onSelect}>
    <span className="home-task-icon" aria-hidden="true">{done ? <Check/> : icon}</span>
    <span className="home-task-body"><span className="home-task-title">{title}</span>{sub && <span className="home-task-sub">{sub}</span>}</span>
    <ChevronRight className="home-task-chevron" aria-hidden="true"/>
  </button></li>
}

/**
 * Home's month cards (plan §7.1): the current month with its stage, health and what needs care, the previous
 * month's close-and-settle checklist until it's settled, next month with when its money arrives, and a
 * one-line note for the last settled month.
 */
export function HomeMonths({ document, today, onOpenSpending, onOpenTransfers }: Props) {
  const cards = homeMonths(document, today)
  if (!cards.length) return null
  const card = cardTracker(document).cards[0]!
  const name = destinationNamer(document)
  const ordered = [...cards.filter(row => row.role === 'current'), ...cards.filter(row => row.role === 'previous'), ...cards.filter(row => row.role === 'next'), ...cards.filter(row => row.role === 'settled')]
  const taskRow = (task: HomeTask) => {
    const statement = task.statementKey ? parseStatementKey(task.statementKey) : null
    if (task.kind === 'bring-in') return <Row key={task.key} icon={<FileSpreadsheet/>} title={`Bring in ${card.name} transactions`} sub={lastDone(cards)} onSelect={() => onOpenSpending({ view: 'sort' })}/>
    if (task.kind === 'closes-soon') return <Row key={task.key} icon={<CalendarDays/>} title="Statement closes tomorrow" sub={`${card.name} closes the ${statementName(statement!.closeDate)} on ${dayDate(statement!.closeDate)}`} onSelect={() => onOpenSpending({ view: 'sort' })}/>
    if (task.kind === 'final-export') return <Row key={task.key} icon={<FileSpreadsheet/>} title={`Bring in the final ${statementName(statement!.closeDate).replace(' statement', '')} statement`} sub="Amex can export past periods. This checks it’s all here." onSelect={() => onOpenSpending({ view: 'statements', statementKey: task.statementKey })}/>
    if (task.kind === 'move') {
      const pot = document.budget.pots.find(row => row.id === cardTracker(document).cards.find(item => item.id === task.cardId)?.setAside?.potId)
      const phrase = potPhrase(pot?.name ?? card.name)
      const amount = task.amountPence ?? 0
      const balance = pot ? potBalance(document, pot.id).balancePence : undefined
      return <Row key={task.key} icon={<PiggyBank/>} title={amount < 0 ? `Move ${pounds(-amount)} back out of ${phrase}` : amount ? `Move ${pounds(amount)} to ${phrase}` : `Update ${phrase}`} sub={`${plural(task.count ?? 0, 'transaction')} sorted since the last move${balance !== undefined ? ` · ${pot!.name} pot has ${signedPounds(balance)}` : ''}`} onSelect={() => onOpenSpending({ view: 'sort' })}/>
    }
    if (task.kind === 'sorted') return <Row key={task.key} icon={<CreditCard/>} done={task.done} title="All transactions in and sorted" onSelect={() => onOpenSpending({ view: 'sort' })}/>
    if (task.kind === 'close') return <Row key={task.key} icon={<CalendarDays/>} done={task.done} title={`Close ${monthName(task.month)}`} sub={task.done ? 'Closed' : closeSub(document, task.month, today)} onSelect={() => onOpenSpending({ view: 'month', month: task.month, close: true })}/>
    if (task.kind === 'settle') return <Row key={task.key} icon={<Wallet/>} done={task.done} title={`Settle the ${statementName(statement!.closeDate)}`} sub={task.done ? 'Settled' : `${pounds(task.amountPence ?? 0)} by ${dayDate(task.dueDate!)}`} onSelect={() => onOpenSpending({ view: 'statements', statementKey: task.statementKey })}/>
    return <Row key={task.key} icon={<Wallet/>} done={task.done} title={`Finish ${monthName(task.month)}’s Transfers`} sub={`Any time before ${dayDate(firstDayOf(task.month))}`} onSelect={() => onOpenTransfers(task.month)}/>
  }
  return <div className="home-months">{ordered.map(month => month.role === 'settled'
    ? <p key={month.month} className="home-month-settled"><Check aria-hidden="true"/><span><strong>{monthName(month.month)}</strong> · settled{month.settledAt ? ` ${dayOf(month.settledAt)}` : ''}</span></p>
    : <section key={month.month} className={`home-month is-${month.role}`} aria-labelledby={`home-month-${month.month}`}>
      <header><h2 id={`home-month-${month.month}`}>{monthName(month.month)}{month.role === 'next' && month.arrives.length > 0 && <>{' '}<span className="home-month-arrives">· money arrives {month.arrives.map(dayDate).join(' · ')}</span></>}</h2>
        <p className="spending-stage">{chips(month).map(chip => <span key={chip.text} className={`spending-chip${chip.tone ? ` is-${chip.tone}` : ''}`}>{chip.text}</span>)}</p></header>
      {month.role === 'current' && <>
        <p className="home-month-spent"><strong>{pounds(month.figures.spentPence)}</strong> of {pounds(month.figures.plannedPence)} spent</p>
        <ul className="home-month-tasks">
          {month.figures.rows.filter(row => row.needsCare).map(row => <Row key={row.key} icon={<TriangleAlert/>} tone="warn"
            title={row.status === 'over' ? `${name(row.destination)} is ${pounds(-row.leftPence)} over` : `${name(row.destination)} is ${pounds(row.aheadPence ?? 0).replace(/\.\d\d$/, '')} ahead of pace`}
            sub={row.status === 'over' ? `Covered when ${monthName(month.month)} closes` : row.runsOut ? `At this rate it runs out around ${dayDate(row.runsOut)}` : `${pounds(row.leftPence)} left`}
            onSelect={() => onOpenSpending({ view: 'month', month: month.month, ...row.destination.kind === 'pot' ? { potId: row.destination.potId } : {} })}/>)}
          {month.tasks.map(taskRow)}
        </ul>
      </>}
      {month.role === 'previous' && <ul className="home-month-tasks">{month.tasks.map(taskRow)}</ul>}
      {month.role === 'next' && <>
        {month.early && <div className="transfer-done-banner home-month-early" role="status"><span className="transfer-done-icon" aria-hidden="true"><CalendarDays/></span><span><strong>{monthName(month.month)}’s money has arrived early</strong><span>It’s for {monthName(month.month)}, which starts on {shortDate(firstDayOf(month.month))}.</span></span></div>}
        {month.tasks.length > 0 && <ul className="home-month-tasks">{month.tasks.map(taskRow)}</ul>}
      </>}
    </section>)}</div>
}

function lastDone(cards: HomeMonth[]) {
  const current = cards.find(row => row.role === 'current')
  return current?.role === 'current' && current.lastImportAt ? `Last done ${dayOf(current.lastImportAt)}` : 'Nothing brought in yet'
}

/** "Groceries £88.58 over · 3 pots with money left". */
function closeSub(document: BudgetDocument, month: string, today: string) {
  const plan = closeMonthPlan(document, month, today)
  if (!plan) return ''
  const pot = (potId: string) => document.budget.pots.find(row => row.id === potId)?.name ?? 'Pot'
  const over = plan.overspends.length === 1 ? `${pot(plan.overspends[0]!.potId)} ${pounds(plan.overspends[0]!.overPence)} over` : plan.overspends.length ? `${plural(plan.overspends.length, 'pot')} over` : 'Nothing over'
  return `${over} · ${plural(plan.leftovers.length, 'pot')} with money left`
}

/** Stage and health chips: "In progress · 18 days left", "Funded", "Sorted to 10 Nov", "2 pots need care". */
function chips(month: Exclude<HomeMonth, { role: 'settled' }>): Array<{ text: string; tone?: string }> {
  const funding = month.status.funding
  const fundingChip = funding.total ? [{ text: funding.done === funding.total ? 'Funded' : `Funding · ${funding.done} of ${funding.total}`, tone: funding.done === funding.total ? undefined : 'closing' }] : []
  if (month.role === 'current') return [
    { text: `In progress · ${month.figures.daysLeft} ${month.figures.daysLeft === 1 ? 'day' : 'days'} left`, tone: 'in-progress' },
    ...fundingChip,
    ...month.figures.sortedTo ? [{ text: `Sorted to ${shortDate(month.figures.sortedTo)}` }] : [],
    ...month.figures.needsCare ? [{ text: `${month.figures.needsCare} ${month.figures.needsCare === 1 ? 'pot needs' : 'pots need'} care`, tone: 'closing' }] : [],
  ]
  if (month.role === 'previous') return [{ text: month.status.stage === 'closing' ? 'Closing' : `To settle${month.status.closedAt ? ` · closed ${dayOf(month.status.closedAt)}` : ''}`, tone: 'closing' }]
  return month.status.stage === 'upcoming' ? [] : fundingChip
}
