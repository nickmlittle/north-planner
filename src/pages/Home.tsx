import { useSyncExternalStore, type ReactNode } from 'react'
import { ArrowLeftRight, CalendarDays, Check, ChevronRight, TriangleAlert, Wallet } from 'lucide-react'
import { MOBILE_QUERY } from '../breakpoints'
import { AllocationMeter } from '../components/AllocationMeter'
import { PageFrame } from '../components/PageFrame'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { incomeDateMarkers, resolveBudget } from '../domain/monthlyBudget'
import { orderTransferAccounts, personTransferPlans } from '../domain/personTransfers'
import { buildTransferInstructions, type TransferInstructions } from '../domain/transferInstructions'
import { personProgress } from '../domain/transferTicks'
import { formatGBP } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { rememberTransferPerson } from '../state/transferPerson'
import { accountOptionLabels, stepSummary } from './budgetLabels'
import { HomeMonths, type SpendingTarget } from './HomeMonths'
import { localDate } from '../domain/cardTracker'

const pounds = (pence: number) => formatGBP(pence / 100)
const subscribeMobile = (callback: () => void) => { const query = window.matchMedia?.(MOBILE_QUERY); query?.addEventListener('change', callback); return () => query?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches
const shiftMonth = (month: string, by: number) => { const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + by, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
const list = (values: string[]) => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`

type Props = {
  document: BudgetDocument
  /** The month Home summarises: this month, unless a link says otherwise. */
  month: string
  onOpenPlan: () => void
  onOpenTransfers: () => void
  /** Plan filtered to one person's accounts. */
  onReviewPerson: (personId: string) => void
  /** The card tracker's month cards open Spending, and next month's Transfers. */
  onOpenSpending?: (target: SpendingTarget) => void
  onOpenTransfersMonth?: (month: string) => void
  /** Today, for the month cards; tests pass a fixed one. */
  today?: string
}

type Task = { key: string; title: string; sub: string; tone?: 'warn' | 'review' | 'done'; icon: 'transfers' | 'warn' | 'done'; progress?: number; counts: boolean; open: boolean; onSelect: () => void }

/** One row of the to-do list: an icon, what to do, and where it goes. Done rows sink to the bottom of their group. */
function TaskRow({ task }: { task: Task }) {
  const Icon = task.icon === 'warn' ? TriangleAlert : task.icon === 'done' ? Check : ArrowLeftRight
  return <li><button type="button" className={`home-task${task.tone ? ` is-${task.tone}` : ''}`} onClick={task.onSelect}>
    <span className="home-task-icon" aria-hidden="true"><Icon/></span>
    <span className="home-task-body"><span className="home-task-title">{task.title}</span><span className="home-task-sub">{task.sub}</span>
      {task.progress !== undefined && <span className="home-task-progress" aria-hidden="true"><span style={{ width: `${task.progress}%` }}/></span>}</span>
    <ChevronRight className="home-task-chevron" aria-hidden="true"/>
  </button></li>
}

function ComingUpRow({ icon, title, sub, onSelect }: { icon: ReactNode; title: string; sub: string; onSelect: () => void }) {
  return <li><button type="button" className="home-task" onClick={onSelect}>
    <span className="home-task-icon" aria-hidden="true">{icon}</span>
    <span className="home-task-body"><span className="home-task-title">{title}</span><span className="home-task-sub">{sub}</span></span>
    <ChevronRight className="home-task-chevron" aria-hidden="true"/>
  </button></li>
}

/** Where the app opens: this month at a glance, what each person has left to do, and what's new. */
export function Home({ document, month, onOpenPlan, onOpenTransfers, onReviewPerson, onOpenSpending = () => {}, onOpenTransfersMonth = () => onOpenTransfers(), today = localDate() }: Props) {
  const compact = useSyncExternalStore(subscribeMobile, getMobile, () => false)
  const adults = document.household.adults
  const adultIds = adults.map(person => person.id)
  const name = (personId: string) => adults.find(person => person.id === personId)?.name ?? 'Person'
  const resolved = resolveBudget(document.budget, month), items = resolved.items
  const transfers = budgetTransfers(document.budget, adultIds, month, items)
  const planned = items.reduce((sum, item) => sum + item.amountPence, 0)
  const people = transfers.people.map(row => ({ personId: row.personId, name: name(row.personId), availablePence: row.availablePence, plannedPence: row.plannedPence }))
  const monthLabel = formatMonth(month), monthName = monthLabel.split(' ')[0]

  // The same payday steps and ticks as Transfers.
  let instructions: TransferInstructions | undefined
  try { instructions = buildTransferInstructions(document, month) } catch { /* Transfers explains it; Home just has no steps. */ }
  const accounts = orderTransferAccounts(transfers.accounts, instructions, document.budget.accounts, adultIds, accountOptionLabels(document.budget.accounts, adults))
  const plans = personTransferPlans(accounts, instructions, adultIds)
  const ticks = document.ticks?.[month]
  const openTransfersFor = (personId: string) => { rememberTransferPerson(personId); onOpenTransfers() }

  const groups = adults.map(person => {
    const tasks: Task[] = []
    const meter = transfers.people.find(row => row.personId === person.id)
    if (meter && adults.length > 1 && meter.plannedPence > meter.availablePence) tasks.push({
      key: 'over', icon: 'warn', tone: 'warn', counts: false, open: true, onSelect: () => onReviewPerson(person.id),
      title: `${pounds(meter.plannedPence - meter.availablePence)} over this month`,
      sub: `${pounds(meter.plannedPence)} planned of ${pounds(meter.availablePence)} available. Review ${person.name}’s items.`,
    })
    const plan = plans.people.find(row => row.personId === person.id)
    const progress = personProgress(plan, ticks)
    if (plan && progress.total) tasks.push(progress.complete
      ? { key: 'transfers', icon: 'done', tone: 'done', counts: true, open: false, onSelect: () => openTransfersFor(person.id), title: 'Payday transfers', sub: `All ${progress.total} steps ticked` }
      : {
        key: 'transfers', icon: 'transfers', tone: progress.changed ? 'review' : undefined, counts: true, open: true, onSelect: () => openTransfersFor(person.id), title: 'Payday transfers',
        sub: progress.changed ? `${progress.changed} changed since ticked · ${progress.differencePence >= 0 ? `send ${pounds(progress.differencePence)} more` : `${pounds(-progress.differencePence)} less needed`}` : `${stepSummary(plan)} · ${progress.done} of ${progress.total} done`,
        progress: progress.done ? progress.done / progress.total * 100 : undefined,
      })
    tasks.sort((a, b) => Number(b.open) - Number(a.open))
    const left = tasks.filter(task => task.open && task.counts).length
    return { key: person.id, name: person.name, initial: person.name.charAt(0), tasks, status: left ? `${left} to do` : tasks.length ? 'All done' : 'Nothing to move' }
  })
  if (plans.needsReview.length) groups.push({
    key: 'either', name: 'Either of you', initial: '+', status: '1 to do',
    tasks: [{ key: 'review', icon: 'warn', tone: 'warn', counts: true, open: true, onSelect: onOpenTransfers, title: `${plans.needsReview.length} ${plans.needsReview.length === 1 ? 'account needs' : 'accounts need'} review`, sub: 'Its steps are held back until the plan is fixed.' }],
  })
  const openCount = groups.reduce((sum, group) => sum + group.tasks.filter(task => task.open && task.counts).length, 0)
  const anySteps = plans.people.some(plan => plan.rows.length > 0)
  const upToDate = anySteps && openCount === 0

  // Coming up: what changed in this month's budget and income.
  const previous = resolveBudget(document.budget, shiftMonth(month, -1)).items
  const added = resolved.hasExplicitBudget ? items.filter(item => !previous.some(old => old.id === item.id)) : []
  const comingUp: ReactNode[] = []
  if (added.length) comingUp.push(<ComingUpRow key="added" icon={<CalendarDays/>} title={`New in ${monthName}’s budget`} sub={list([...added.slice(0, 3).map(item => item.name), ...added.length > 3 ? [`${added.length - 3} more`] : []])} onSelect={onOpenPlan}/>)
  else if (resolved.hasExplicitBudget) comingUp.push(<ComingUpRow key="updated" icon={<CalendarDays/>} title={`${monthName}’s budget was updated`} sub="Changes apply from this month" onSelect={onOpenPlan}/>)
  else if (resolved.sourceMonth) comingUp.push(<ComingUpRow key="inherited" icon={<CalendarDays/>} title={`Using the ${formatMonth(resolved.sourceMonth)} budget`} sub={`Nothing changed for ${monthName}`} onSelect={onOpenPlan}/>)
  if (incomeDateMarkers(document.budget).includes(month)) comingUp.push(<ComingUpRow key="income" icon={<Wallet/>} title={`Income changed in ${monthName}`} sub="The Plan summary uses the new amounts" onSelect={onOpenPlan}/>)

  return <PageFrame className="home-page" headingClass="home-heading" eyebrow="This month" title={monthLabel} contentWidth="wide"
    headerActions={<div className="home-heading-actions"><button type="button" className="secondary-button" onClick={onOpenTransfers}>Open Transfers</button><button type="button" className="primary-button" onClick={onOpenPlan}>Open Plan</button></div>}
    summary={<>
      <AllocationMeter label="Plan summary" compact={compact} eyebrow={`${monthName} plan`} availablePence={transfers.availablePence} plannedPence={planned} people={people} onReview={onReviewPerson}
        actions={<button type="button" className="allocation-meter-review home-open-plan" onClick={onOpenPlan}>Open Plan<ChevronRight aria-hidden="true"/></button>}/>
      {upToDate && <div className="transfer-done-banner home-done-banner" role="status"><span className="transfer-done-icon" aria-hidden="true"><Check/></span><span><strong>You’re up to date for {monthName}</strong><span>Every payday step is ticked.</span></span></div>}
    </>}>
    <HomeMonths document={document} today={today} onOpenSpending={onOpenSpending} onOpenTransfers={onOpenTransfersMonth}/>
    <section className="home-section" aria-labelledby="home-todo-title">
      <div className="home-section-heading"><h2 id="home-todo-title">To do</h2><span>{openCount ? `${openCount} left` : anySteps ? 'All done' : ''}</span></div>
      {!anySteps && !plans.needsReview.length && <p className="home-empty">Nothing to move in {monthName} yet. Add items on the Plan to see each person’s payday steps here.</p>}
      <div className="home-groups">{groups.filter(group => group.tasks.length).map(group => <section key={group.key} className="home-group" aria-label={group.name}>
        <header><span className={`home-avatar${group.key === 'either' ? ' is-joint' : ''}`} aria-hidden="true">{group.initial}</span><h3>{group.name}</h3><span className="home-group-status">{group.status}</span></header>
        <ul>{group.tasks.map(task => <TaskRow key={task.key} task={task}/>)}</ul>
      </section>)}</div>
    </section>
    {comingUp.length > 0 && <section className="home-section" aria-labelledby="home-coming-title">
      <div className="home-section-heading"><h2 id="home-coming-title">Coming up</h2></div>
      <ul className="home-group home-coming">{comingUp}</ul>
    </section>}
  </PageFrame>
}
