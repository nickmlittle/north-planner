import { ArrowLeftRight, BellRing, CalendarCheck, Check, ChevronRight, FileText, Inbox, ListPlus, PiggyBank, TrendingUp, TriangleAlert, Upload } from 'lucide-react'
import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { EmptyState, ListKeysHint, ListRow, PageHeader, Section, StatStrip, StatTile, StatusChip } from '../components/ui'
import { Sheet } from '../components/ui/Sheet'
import { useToast } from '../components/ui/useToast'
import { useListNavigation } from '../state/useListNavigation'
import type { BudgetDocument } from '../domain/budgetDocument'
import { localDate } from '../domain/cardTracker'
import { homeCount, homeInbox, type AppHomeTarget, type HomeInbox, type HomeTarget, type InboxKind, type InboxTask, type PaydayCard } from '../domain/homeInbox'
import { resolveBudget } from '../domain/monthlyBudget'
import { answerRenewal, undoRenewalAnswer } from '../domain/recurringBills'
import { dayDate, weekday } from '../formatting/date'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { destinationNamer } from './cardLabels'
import { FreshnessLine } from './Freshness'
import { RenewalSheet } from './RenewalSheet'
import { WhatMoved } from './WhatMoved'
import './Home.css'

type Props = {
  document: BudgetDocument
  /** Answering a renewal (Same price, Save new price) edits the document. */
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  /** The month Home summarises: this month, unless a link says otherwise. */
  month: string
  /** Every row and figure opens somewhere: Plan, Month (a pot, Close), Spending (a statement, To sort) or Settings. */
  onOpen: (target: AppHomeTarget) => void
  /** Today; tests pass a fixed one. */
  today?: string
}

const icons: Record<InboxKind, ReactNode> = {
  plan: <ListPlus/>, settle: <FileText/>, 'final-export': <Upload/>, close: <CalendarCheck/>, fund: <ArrowLeftRight/>, sort: <Inbox/>,
  'set-aside': <PiggyBank/>, 'bring-in': <Upload/>, 'over-plan': <TriangleAlert/>, 'review-accounts': <TriangleAlert/>, pace: <TrendingUp/>, renewal: <BellRing/>,
}
const monthName = (month: string) => formatMonth(month).split(' ')[0]!
/** "Wednesday 11 November". */
const longDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** A To do row: the task, what it needs, and its figure, due date or chip. Fund rows show each person's steps. */
function TaskRow({ task, onOpen, onSamePrice }: { task: InboxTask; onOpen: (target: HomeTarget) => void; onSamePrice?: () => void }) {
  const meta = task.progress ? <span className="home-progress">{task.progress.map(row => <span key={row.personId} className="home-progress-person">
    {row.name} {row.done} of {row.total}<span className="home-progress-bar" aria-hidden="true"><span style={{ width: `${row.total ? row.done / row.total * 100 : 0}%` }}/></span>
  </span>)}{task.note && <span>{task.note}</span>}{task.landed && <span className="home-landed">{task.landed}</span>}</span> : task.meta
  return <li><ListRow icon={icons[task.kind]} tone={task.tone ?? 'neutral'} title={task.title} meta={meta}
    trailing={task.chip ? <StatusChip>{task.chip}</StatusChip> : task.trailing && <span className={task.tone === 'critical' ? 'home-figure is-critical' : 'home-figure'}>{task.trailing}</span>}
    trailingMeta={task.trailingMeta} onOpen={() => onOpen(task.target)} listRow/>
    {onSamePrice && <div className="home-task-actions"><button type="button" className="secondary-button" onClick={onSamePrice}>Same price</button></div>}</li>
}

/** D10: from next month's first payday to the 1st, its payday leads: what has landed, the household total and each person's steps. */
function PaydayCardView({ card, onOpen }: { card: PaydayCard; onOpen: (target: HomeTarget) => void }) {
  const month = monthName(card.month)
  return <section className="home-payday" aria-label={`${month}’s payday`}>
    <header><h2>{month}’s payday</h2><span className="home-payday-count">{card.done} of {card.total} steps</span></header>
    {card.landed && <p className="home-payday-landed">{card.landed}</p>}
    <span className="home-progress">{card.progress.map(row => <span key={row.personId} className="home-progress-person">
      {row.name} {row.done} of {row.total}<span className="home-progress-bar" aria-hidden="true"><span style={{ width: `${row.total ? row.done / row.total * 100 : 0}%` }}/></span>
    </span>)}{card.changed > 0 && <span>{card.changed} changed since ticked</span>}</span>
    <button type="button" className="secondary-button" onClick={() => onOpen(card.target)}>{card.done ? `Carry on with ${month}’s steps` : `Open ${month}’s steps`}</button>
  </section>
}

/** A card on Home (D14): a Tracked pot or the Amex bill. The whole card opens its page. */
function HomeCard({ name, value, status, week, tone, label, onOpen }: { name: string; value: string; status?: string; week?: string; tone?: 'warning' | 'critical'; label: string; onOpen: () => void }) {
  return <li><button type="button" className={`home-card${tone ? ` is-${tone}` : ''}`} onClick={onOpen} aria-label={label}>
    <span className="home-card-name">{name}</span><span className="home-card-value">{value}</span>
    {status && <span className="home-card-status">{status}</span>}
    {week && <span className="home-card-week">{week}</span>}
  </button></li>
}

/** The To do sheet (P10): every task, the heads-ups, Coming up and Done. */
function TodoSheet({ inbox, onOpen, samePrice, onClose }: { inbox: HomeInbox; onOpen: (target: HomeTarget) => void; samePrice: (task: InboxTask) => (() => void) | undefined; onClose: () => void }) {
  const { todo, headsUp, comingUp, done } = inbox
  return <Sheet title="To do" size="lg" onClose={onClose} dismissOnScrim>
    <div className="home-sheet">
      {todo.length + headsUp.length > 0 ? <ul className="home-list" aria-label="All to do">
        {todo.map(task => <TaskRow key={task.key} task={task} onOpen={onOpen} onSamePrice={samePrice(task)}/>)}
        {headsUp.length > 0 && <li className="home-list-label" aria-hidden="true">Heads-up</li>}
        {headsUp.map(task => <TaskRow key={task.key} task={task} onOpen={onOpen}/>)}
      </ul> : <EmptyState title="Nothing to do"/>}
      {comingUp.length > 0 && <Section title="Coming up">
        <ul className="home-list home-coming" aria-label="Coming up">{comingUp.map(row => <li key={row.key}>
          <ListRow icon={<span className="home-date"><span>{weekday(row.date)}</span> {Number(row.date.slice(8))}</span>} title={row.title} meta={row.meta} chevron={!!row.target} {...row.target ? { onOpen: () => onOpen(row.target!) } : {}}/>
        </li>)}</ul>
      </Section>}
      {done.length > 0 && <Section title="Done" count={done.length}>
        <ul className="home-list home-done" aria-label="Done">{done.map(task => <li key={task.key}><ListRow icon={<Check/>} tone="done" title={task.title} meta={task.meta || undefined} onOpen={() => onOpen(task.target)}/></li>)}</ul>
      </Section>}
    </div>
  </Sheet>
}

/**
 * Home (D14): how the month is going, then what to do. The payday card (D10) leads from the first payday to the 1st,
 * then the dated verdict, the top 3 jobs (Open shows them all), a card per Tracked pot and the Amex bill, and a strip
 * for Bills, Saving and Plan. Built by `homeInbox`.
 */
export function Home({ document, setDocument, month, onOpen: onOpenElsewhere, today = localDate() }: Props) {
  const [renewal, setRenewal] = useState<{ itemId: string; date: string }>()
  const { show: showToast, toast } = useToast()
  const onOpen = (target: HomeTarget) => { if (target.view === 'renewal') setRenewal({ itemId: target.itemId, date: target.date }); else onOpenElsewhere(target) }
  const answered = (text: string, undo: (current: BudgetDocument) => BudgetDocument) => showToast(text, { label: 'Undo', onClick: () => setDocument(undo) })
  /** "Same price" on a renewal's To do row: answers it without opening the sheet. */
  const samePrice = (task: InboxTask) => {
    if (task.target.view !== 'renewal') return undefined
    const { itemId, date } = task.target
    return () => { setDocument(current => answerRenewal(current, itemId, date)); answered(`${resolveBudget(document.budget, date.slice(0, 7)).items.find(item => item.id === itemId)?.name ?? 'Renewal'}: same price`, undoRenewalAnswer(document, itemId, date)) }
  }
  const [sheet, setSheet] = useState(false)
  const todoKeys = useListNavigation({ label: 'To do', keys: { enter: 'Open the task' } })
  const names = shortAccountLabels(document.budget.accounts, document.household.adults)
  const inbox = homeInbox(document, { month, today, nameDestination: destinationNamer(document), nameAccount: id => names.get(id) ?? 'Account' })
  const { strip, todo, headsUp, comingUp, pots, bills, saving } = inbox
  const count = homeCount(inbox)
  const name = monthName(month)
  const next = comingUp[0]
  const top = [...todo, ...headsUp].slice(0, 3)
  return <div className="page-frame home-page">
    <PageHeader titleText="Home" titlePrefix="Home, " title={name}
      chip={<StatusChip tone="positive" dot>{inbox.stage}</StatusChip>} context={longDate(today)}/>
    <WhatMoved/>
    {inbox.payday && <PaydayCardView card={inbox.payday} onOpen={onOpen}/>}
    {inbox.verdict && <section className="home-verdict" aria-label={`How ${name} is going`}>
      <p className="home-verdict-text">{inbox.verdict}</p>
      <FreshnessLine document={document} onSort={() => onOpen({ view: 'spending', section: 'sort' })}/>
    </section>}
    <Section title="To do" count={count} aside={<>{count > 0 && <ListKeysHint keys={[['J K', 'move'], ['↵', 'open']]}/>}<button type="button" className="text-button home-open-todo" onClick={() => setSheet(true)}>Open<ChevronRight aria-hidden="true"/></button></>}>
      {todoKeys.hint}
      {top.length ? <ul className="home-list" aria-label="To do" {...todoKeys.listProps}>
        {top.map(task => <TaskRow key={task.key} task={task} onOpen={onOpen} onSamePrice={samePrice(task)}/>)}
      </ul> : <EmptyState title="Nothing to do">{`You’re set for ${name}.${next ? ` Next: ${next.title} ${dayDate(next.date)}.` : ''}`}</EmptyState>}
    </Section>
    {(pots.length > 0 || strip.card) && <ul className="home-cards" aria-label={`${name}’s pots and the bill`}>
      {pots.map(pot => <HomeCard key={pot.key} name={pot.name} value={pot.value} status={pot.status} week={pot.week} tone={pot.tone} label={`Open ${pot.name}`} onOpen={() => onOpen(pot.target)}/>)}
      {strip.card && <HomeCard name={strip.card.name} value={strip.card.value} status={[strip.card.sub, strip.card.detail].filter(Boolean).join(' · ')} label={`Open ${strip.card.name}`} onOpen={() => onOpen({ view: 'spending', section: 'sort' })}/>}
    </ul>}
    <StatStrip label={`${name} at a glance`}>
      {bills && <StatTile label={bills.label} value={<>{bills.value} <small className="home-tile-sub">{bills.sub}</small></>} detail={bills.detail} onOpen={() => onOpen(bills.target)} openLabel="Open Bills"/>}
      {saving && <StatTile label={saving.label} value={<>{saving.value} <small className="home-tile-sub">{saving.sub}</small></>} detail={saving.detail} onOpen={() => onOpen(saving.target)} openLabel="Open Saving"/>}
      <StatTile label="Plan" value={strip.plan.value} detail={strip.plan.detail} tone={strip.plan.tone ?? 'neutral'} onOpen={() => onOpen({ view: 'plan' })} openLabel="Open Plan"/>
    </StatStrip>
    {toast}
    {sheet && <TodoSheet inbox={inbox} samePrice={samePrice} onClose={() => setSheet(false)} onOpen={target => { setSheet(false); onOpen(target) }}/>}
    {renewal && <RenewalSheet document={document} setDocument={setDocument} itemId={renewal.itemId} date={renewal.date} today={today} onClose={() => setRenewal(undefined)}
      onAnswered={(text, undo) => { setRenewal(undefined); answered(text, undo) }}
      onEditItem={(itemId, itemMonth) => { setRenewal(undefined); onOpenElsewhere({ view: 'plan', editItemId: itemId, month: itemMonth }) }}/>}
  </div>
}
