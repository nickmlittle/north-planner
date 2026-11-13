import { ArrowLeftRight, CalendarCheck, Check, FileText, Inbox, ListPlus, PiggyBank, TrendingUp, TriangleAlert, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState, ListKeysHint, ListRow, PageHeader, Section, StatStrip, StatTile, StatusChip } from '../components/ui'
import { useListNavigation } from '../state/useListNavigation'
import type { BudgetDocument } from '../domain/budgetDocument'
import { localDate } from '../domain/cardTracker'
import { homeCount, homeInbox, type HomeTarget, type InboxKind, type InboxTask } from '../domain/homeInbox'
import { dayDate, weekday } from '../formatting/date'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { destinationNamer } from './cardLabels'
import { WhatMoved } from './WhatMoved'
import './Home.css'

type Props = {
  document: BudgetDocument
  /** The month Home summarises: this month, unless a link says otherwise. */
  month: string
  /** Every row and figure opens somewhere: Plan, Month (a pot, Close), Spending (a statement, To sort) or Settings. */
  onOpen: (target: HomeTarget) => void
  /** Today; tests pass a fixed one. */
  today?: string
}

const icons: Record<InboxKind, ReactNode> = {
  plan: <ListPlus/>, settle: <FileText/>, 'final-export': <Upload/>, close: <CalendarCheck/>, fund: <ArrowLeftRight/>, sort: <Inbox/>,
  'set-aside': <PiggyBank/>, 'bring-in': <Upload/>, 'over-plan': <TriangleAlert/>, 'review-accounts': <TriangleAlert/>, pace: <TrendingUp/>,
}
const monthName = (month: string) => formatMonth(month).split(' ')[0]!
/** "Wednesday 11 November". */
const longDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** A To do row: the task, what it needs, and its figure, due date or chip. Fund rows show each person's steps. */
function TaskRow({ task, onOpen }: { task: InboxTask; onOpen: (target: HomeTarget) => void }) {
  const meta = task.progress ? <span className="home-progress">{task.progress.map(row => <span key={row.personId} className="home-progress-person">
    {row.name} {row.done} of {row.total}<span className="home-progress-bar" aria-hidden="true"><span style={{ width: `${row.total ? row.done / row.total * 100 : 0}%` }}/></span>
  </span>)}{task.note && <span>{task.note}</span>}</span> : task.meta
  return <li><ListRow icon={icons[task.kind]} tone={task.tone ?? 'neutral'} title={task.title} meta={meta}
    trailing={task.chip ? <StatusChip>{task.chip}</StatusChip> : task.trailing && <span className={task.tone === 'critical' ? 'home-figure is-critical' : 'home-figure'}>{task.trailing}</span>}
    trailingMeta={task.trailingMeta} onOpen={() => onOpen(task.target)} listRow/></li>
}

/**
 * Home: where we stand and what to do next. A three-figure strip (Plan, Spent, the card), then one To do list in
 * the order things are due, heads-ups last; Coming up and Done beside it on wide screens. Built by `homeInbox`.
 */
export function Home({ document, month, onOpen, today = localDate() }: Props) {
  const todoKeys = useListNavigation({ label: 'To do', keys: { enter: 'Open the task' } })
  const names = shortAccountLabels(document.budget.accounts, document.household.adults)
  const inbox = homeInbox(document, { month, today, nameDestination: destinationNamer(document), nameAccount: id => names.get(id) ?? 'Account' })
  const { strip, todo, headsUp, comingUp, done } = inbox
  const count = homeCount(inbox)
  const name = monthName(month)
  const next = comingUp[0]
  return <div className="page-frame home-page">
    <PageHeader titleText="Home" titlePrefix="Home, " title={name}
      chip={<StatusChip tone="positive" dot>{inbox.stage}</StatusChip>} context={longDate(today)}/>
    <WhatMoved/>
    <StatStrip label={`${name} at a glance`}>
      <StatTile label="Plan" value={strip.plan.value} detail={strip.plan.detail} tone={strip.plan.tone ?? 'neutral'} onOpen={() => onOpen({ view: 'plan' })} openLabel="Open Plan"/>
      {strip.spent && <StatTile label="Spent this month" value={<>{strip.spent.value} <small className="home-tile-sub">{strip.spent.sub}</small></>}
        detail={<span className={strip.spent.detailTone ? 'home-tile-warning' : undefined}>{strip.spent.detail}</span>} onOpen={() => onOpen({ view: 'month', month })} openLabel="Open Month"/>}
      {strip.card && <StatTile label={strip.card.name} value={<>{strip.card.value} <small className="home-tile-sub">{strip.card.sub}</small></>} detail={strip.card.detail} onOpen={() => onOpen({ view: 'spending', section: 'sort' })} openLabel="Open Spending"/>}
    </StatStrip>
    <div className="home-columns">
      <Section title="To do" count={count} aside={count ? <ListKeysHint keys={[['J K', 'move'], ['↵', 'open']]}/> : undefined}>
        {todoKeys.hint}
        {count ? <ul className="home-list" aria-label="To do" {...todoKeys.listProps}>
          {todo.map(task => <TaskRow key={task.key} task={task} onOpen={onOpen}/>)}
          {headsUp.length > 0 && <li className="home-list-label" aria-hidden="true">Heads-up</li>}
          {headsUp.map(task => <TaskRow key={task.key} task={task} onOpen={onOpen}/>)}
        </ul> : <EmptyState title="Nothing to do">{`You’re set for ${name}.${next ? ` Next: ${next.title} ${dayDate(next.date)}.` : ''}`}</EmptyState>}
      </Section>
      <div className="home-side">
        {comingUp.length > 0 && <Section title="Coming up">
          <ul className="home-list home-coming" aria-label="Coming up">{comingUp.map(row => <li key={row.key}>
            <ListRow icon={<span className="home-date"><span>{weekday(row.date)}</span> {Number(row.date.slice(8))}</span>} title={row.title} meta={row.meta} chevron={!!row.target} {...row.target ? { onOpen: () => onOpen(row.target!) } : {}}/>
          </li>)}</ul>
        </Section>}
        {done.length > 0 && <Section title="Done" count={done.length}>
          <ul className="home-list home-done" aria-label="Done">{done.map(task => <li key={task.key}><ListRow icon={<Check/>} tone="done" title={task.title} meta={task.meta || undefined} onOpen={() => onOpen(task.target)}/></li>)}</ul>
        </Section>}
      </div>
    </div>
  </div>
}
