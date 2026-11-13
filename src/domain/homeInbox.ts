import type { BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { monthSpending, type DestinationSpending } from './cardSpending'
import { statementSummary } from './cardStatements'
import { transactionsToSort } from './cardSorting'
import { addDays, cardTracker, closeDateFor, daysBetween, firstDayOf, lastDayOf, localDate, monthOf, parseStatementKey, shiftMonth, statementKey } from './cardTracker'
import { resolveBudget, type BudgetDestination } from './monthlyBudget'
import { closeMonthPlan, homeMonths, moneyArrivesDates, type HomeMonth, type HomeTask } from './monthStages'
import { orderTransferAccounts, personTransferPlans } from './personTransfers'
import { potBalance } from './potBalances'
import { potPhrase } from './setAside'
import { buildTransferInstructions, type TransferInstructions } from './transferInstructions'
import { personProgress } from './transferTicks'
import { moneyArrives } from './workingDays'
import { formatGBP } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { dayDate } from '../formatting/date'

/**
 * Home as an inbox (audit 3 PR 10): a three-figure strip, one To do list ordered by when it matters, heads-ups,
 * Coming up and Done. Pure: it maps `homeMonths()` and the payday plans into rows and never recomputes the
 * stage, settle or pace rules.
 */

/** Where a row opens. */
export type HomeTarget =
  | { view: 'plan'; reviewPersonId?: string }
  | { view: 'month'; month: string; potId?: string; close?: boolean }
  | { view: 'spending'; section: 'sort' | 'statements'; statementKey?: string; bringIn?: boolean }
  | { view: 'settings'; section: 'accounts' }

export type InboxKind = 'plan' | 'settle' | 'close' | 'fund' | 'sort' | 'set-aside' | 'bring-in' | 'final-export' | 'over-plan' | 'review-accounts' | 'pace'
export type InboxTask = {
  key: string
  kind: InboxKind
  title: string
  meta: string
  trailing?: string
  trailingMeta?: string
  /** A small chip instead of a figure: "Ended 31 Oct". */
  chip?: string
  tone?: 'warning' | 'critical'
  /** YYYY-MM-DD the task is due by; orders the list. */
  due?: string
  target: HomeTarget
  progress?: Array<{ personId: string; name: string; done: number; total: number }>
  /** Beside the progress: "1 changed since ticked". */
  note?: string
}
export type Upcoming = { key: string; date: string; title: string; meta?: string; target?: HomeTarget }
export type StripFigure = { value: string; sub?: string; detail?: string; detailTone?: 'warning' | 'critical'; tone?: 'critical' }
export type HomeInbox = {
  strip: { plan: StripFigure; spent?: StripFigure; card?: StripFigure & { name: string } }
  todo: InboxTask[]
  headsUp: InboxTask[]
  comingUp: Upcoming[]
  done: InboxTask[]
  /** "In progress · 19 days left". */
  stage: string
  firstRun: boolean
}
type Options = {
  month: string
  today?: string
  /** "Groceries · Monzo Joint": pages name destinations; the domain doesn't. */
  nameDestination?: (destination: BudgetDestination) => string
  nameAccount?: (accountId: string) => string
}

const pounds = (pence: number) => formatGBP(pence / 100)
const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`
const statementName = (closeDate: string) => `${monthName(closeDate.slice(0, 7))} statement`
/** "£62" for a pace gap: pounds without pence reads quicker in a heads-up. */
const roundPounds = (pence: number) => pounds(pence).replace(/\.\d\d$/, '')
/** How far ahead Coming up looks. */
export const COMING_UP_DAYS = 45
/** Next month's payday steps join To do this many days before its money arrives. */
export const FUND_AHEAD_DAYS = 7

/** The To do order: by due date first, then the everyday card work, then plan fixes. */
const RANK: Record<InboxKind, number> = { plan: 0, settle: 1, 'final-export': 1, close: 2, fund: 3, sort: 4, 'set-aside': 5, 'bring-in': 6, 'over-plan': 7, 'review-accounts': 8, pace: 9 }
const order = (a: InboxTask, b: InboxTask) => RANK[a.kind] - RANK[b.kind] || (a.due ?? '').localeCompare(b.due ?? '') || a.key.localeCompare(b.key)

/** The payday steps for a month, per person: the same plans and ticks as Month. */
function fundingFor(document: BudgetDocument, month: string) {
  const ids = document.household.adults.map(person => person.id)
  const items = resolveBudget(document.budget, month).items
  const transfers = budgetTransfers(document.budget, ids, month, items)
  let instructions: TransferInstructions | undefined
  try { instructions = buildTransferInstructions(document, month) } catch { /* Month explains it; Home has no steps. */ }
  const plans = personTransferPlans(orderTransferAccounts(transfers.accounts, instructions, document.budget.accounts, ids, new Map()), instructions, ids)
  const people = plans.people.map(plan => ({ personId: plan.personId, ...personProgress(plan, document.ticks?.[month]) })).filter(row => row.total > 0)
  return { transfers, items, plans, people }
}

export function homeInbox(document: BudgetDocument, { month, today = localDate(), nameDestination = () => 'Pot', nameAccount = () => 'Account' }: Options): HomeInbox {
  const adults = document.household.adults
  const name = (personId: string) => adults.find(person => person.id === personId)?.name ?? 'Someone'
  const tracker = cardTracker(document)
  const card = tracker.cards[0]
  const todo: InboxTask[] = [], headsUp: InboxTask[] = [], done: InboxTask[] = [], comingUp: Upcoming[] = []
  const current = fundingFor(document, month)
  const planned = current.items.reduce((sum, item) => sum + item.amountPence, 0)
  const firstRun = planned === 0

  // ——— Strip: Plan ———
  const people = current.transfers.people.map(row => ({ ...row, gap: row.availablePence - row.plannedPence }))
  const overPence = planned - current.transfers.availablePence
  const personText = (row: typeof people[number]) => `${name(row.personId)} ${row.gap < 0 ? `${pounds(-row.gap)} over` : row.gap > 0 ? `${pounds(row.gap)} left` : 'balanced'}`
  const plan: StripFigure = firstRun ? { value: `Nothing planned for ${monthName(month)} yet` }
    : { value: overPence > 0 ? `${pounds(overPence)} over` : overPence < 0 ? `${pounds(-overPence)} left` : 'Balanced', ...overPence > 0 ? { tone: 'critical' as const } : {},
      detail: adults.length > 1 ? people.map(personText).join(' · ') : `${pounds(planned)} of ${pounds(current.transfers.availablePence)}` }

  // ——— Strip: Spent and the card ———
  const figures = card && !firstRun ? monthSpending(document, month, today) : undefined
  const care = figures?.rows.filter(row => row.needsCare) ?? []
  const worst = [...care].sort((a, b) => (a.leftPence < 0 ? a.leftPence : -(a.aheadPence ?? 0)) - (b.leftPence < 0 ? b.leftPence : -(b.aheadPence ?? 0)))[0]
  // The strip is short: the pot's own name ("Groceries"), without its account.
  const shortName = (destination: BudgetDestination) => nameDestination(destination).split(' · ')[0]!
  const careText = (row: DestinationSpending) => row.leftPence < 0 ? `${shortName(row.destination)} ${pounds(-row.leftPence)} over` : `${shortName(row.destination)} ${roundPounds(row.aheadPence ?? 0)} ahead of pace`
  const spent: StripFigure | undefined = figures && { value: pounds(figures.spentPence), sub: `of ${pounds(figures.plannedPence)}`, detail: worst ? careText(worst) : 'On track', ...worst ? { detailTone: 'warning' as const } : {} }
  let cardFigure: HomeInbox['strip']['card']
  if (card) {
    const close = closeDateFor(today, card.closeDay)
    const open = statementSummary(document, statementKey(card.id, close), today)
    const pot = card.setAside && document.budget.pots.find(row => row.id === card.setAside!.potId)
    const balance = pot ? potBalance(document, pot.id).balancePence : undefined
    cardFigure = { name: card.name, value: pounds(open?.totalPence ?? 0), sub: 'this statement', detail: [balance !== undefined ? `${pounds(balance)} set aside` : '', `closes ${dayDate(close)}`].filter(Boolean).join(' · ') }
  }

  // ——— First run: plan the month first ———
  if (firstRun) todo.push({ key: 'plan', kind: 'plan', title: `Plan ${monthName(month)}`, meta: 'Add what the household pays for each month', target: { view: 'plan' } })

  // ——— The card's months (homeMonths) ———
  const months: HomeMonth[] = card ? homeMonths(document, today) : []
  const lastImportAt = [...tracker.imports].reverse()[0]?.at
  const lastDone = lastImportAt ? `Last done ${dayDate(localDate(new Date(lastImportAt)))}` : 'Nothing brought in yet'
  const closesSoon = new Set<string>()
  const mapTask = (task: HomeTask, role: HomeMonth['role']) => {
    const statement = task.statementKey ? statementSummary(document, task.statementKey, today) : null
    const closeDate = task.statementKey ? parseStatementKey(task.statementKey)?.closeDate : undefined
    switch (task.kind) {
      case 'sorted': {
        if (task.done) done.push({ key: task.key, kind: 'close', title: `All ${monthName(task.month)} transactions sorted`, meta: '', target: { view: 'month', month: task.month, close: true } })
        // Not done yet: Close <Month> says what's missing (its meta below).
        return
      }
      case 'close': {
        const target: HomeTarget = { view: 'month', month: task.month, close: true }
        if (task.done) { done.push({ key: task.key, kind: 'close', title: `${monthName(task.month)} closed`, meta: '', target }); return }
        todo.push({ key: task.key, kind: 'close', title: `Close ${monthName(task.month)}`, meta: closeMeta(document, task.month, today, nameDestination), chip: `Ended ${dayDate(lastDayOf(task.month)).slice(4)}`, due: lastDayOf(task.month), target })
        return
      }
      case 'settle': {
        if (!statement || !closeDate) return
        const target: HomeTarget = { view: 'spending', section: 'statements', statementKey: task.statementKey }
        if (task.done) { done.push({ key: task.key, kind: 'settle', title: `${statementName(closeDate)} settled`, meta: '', target }); return }
        // An open statement is Coming up, and one waiting for its final export asks for that instead.
        if (statement.open || !statement.complete) return
        const check = statement.summaryCheck ? statement.summaryCheck.matches ? ' · matches Amex’s summary' : ' · doesn’t match Amex’s summary' : ''
        todo.push({ key: task.key, kind: 'settle', title: `Settle the ${statementName(closeDate)}`, meta: `${statement.toSort ? `${statement.toSort} to sort` : `All ${statement.transactions} sorted`}${check}`, trailing: pounds(statement.totalPence), trailingMeta: `due ${dayDate(statement.dueDate)}`, due: statement.dueDate, target })
        return
      }
      case 'final-export':
        if (!closeDate) return
        todo.push({ key: task.key, kind: 'final-export', title: `Bring in the final ${monthName(closeDate.slice(0, 7))} export`, meta: `${card!.name} can export past periods. This checks it’s all here.`, ...statement ? { trailingMeta: `due ${dayDate(statement.dueDate)}`, due: statement.dueDate } : {}, target: { view: 'spending', section: 'statements', statementKey: task.statementKey } })
        return
      case 'bring-in':
        todo.push({ key: task.key, kind: 'bring-in', title: `Bring in ${card!.name} transactions`, meta: lastDone, target: { view: 'spending', section: 'sort', bringIn: true } })
        return
      case 'closes-soon':
        if (task.statementKey) closesSoon.add(task.statementKey)
        return
      case 'move': {
        const owner = tracker.cards.find(row => row.id === task.cardId)
        const pot = document.budget.pots.find(row => row.id === owner?.setAside?.potId)
        const phrase = potPhrase(pot?.name ?? owner?.name ?? 'card')
        const amount = task.amountPence ?? 0
        todo.push({ key: task.key, kind: 'set-aside', title: amount < 0 ? `Take money back out of ${phrase}` : `Set aside in ${phrase}`, meta: `${plural(task.count ?? 0, 'transaction')} sorted since the last move`, trailing: pounds(Math.abs(amount)), target: { view: 'spending', section: 'sort' } })
        return
      }
      case 'transfers':
        // Next month's steps, once started: the Fund rows below cover them.
        if (task.done && role === 'next') done.push({ key: task.key, kind: 'fund', title: `${monthName(task.month)} funded`, meta: '', target: { view: 'month', month: task.month } })
        return
    }
  }
  for (const row of months) if (row.role !== 'settled') for (const task of row.tasks) mapTask(task, row.role)

  // ——— Sort: anything waiting to be sorted ———
  const toSort = transactionsToSort(tracker)
  if (card && toSort.length) todo.push({ key: 'sort', kind: 'sort', title: `Sort ${plural(toSort.length, `${card.name} transaction`)}`, meta: lastImportAt ? `Brought in ${dayDate(localDate(new Date(lastImportAt)))}` : 'Added by hand', trailing: pounds(toSort.reduce((sum, row) => sum + row.amountPence, 0)), target: { view: 'spending', section: 'sort' } })

  // ——— Fund: this month after its payday, and next month a week before (or once started) ———
  const fund = (target: string, data: ReturnType<typeof fundingFor>) => {
    const total = data.people.reduce((sum, row) => sum + row.total, 0), doneSteps = data.people.reduce((sum, row) => sum + row.done, 0)
    if (!total) return
    const changed = data.people.reduce((sum, row) => sum + row.changed, 0)
    if (doneSteps === total) { if (target === month) done.push({ key: `fund:${target}`, kind: 'fund', title: `${monthName(target)} funded`, meta: `All ${plural(total, 'step')} ticked`, target: { view: 'month', month: target } }); return }
    const arrives = moneyArrivesDates(document, target)[0]
    const started = doneSteps > 0 || changed > 0
    if (target !== month && !started && !(arrives && daysBetween(today, arrives) <= FUND_AHEAD_DAYS)) return
    todo.push({
      key: `fund:${target}`, kind: 'fund', title: `Fund ${monthName(target)}`,
      meta: [data.people.map(row => `${name(row.personId)} ${row.done} of ${row.total}`).join(' · '), changed ? `${changed} changed since ticked` : ''].filter(Boolean).join(' · '),
      trailing: plural(total, 'step'), due: arrives ?? firstDayOf(target), target: { view: 'month', month: target }, ...changed ? { note: `${changed} changed since ticked` } : {},
      progress: data.people.map(row => ({ personId: row.personId, name: name(row.personId), done: row.done, total: row.total })),
    })
  }
  if (!firstRun) fund(month, current)
  const next = shiftMonth(month, 1)
  fund(next, fundingFor(document, next))

  // ——— Plan fixes ———
  const overPeople = people.filter(row => row.gap < 0)
  if (!firstRun && (overPence > 0 || adults.length > 1 && overPeople.length)) {
    const worstPerson = [...overPeople].sort((a, b) => a.gap - b.gap)[0]
    todo.push({ key: 'over-plan', kind: 'over-plan', title: 'Bring the plan back to Available', meta: adults.length > 1 ? overPeople.map(personText).join(' · ') : `${pounds(planned)} planned of ${pounds(current.transfers.availablePence)}`,
      trailing: `${pounds(overPence > 0 ? overPence : overPeople.reduce((sum, row) => sum - row.gap, 0))} over`, tone: 'critical', target: { view: 'plan', ...worstPerson ? { reviewPersonId: worstPerson.personId } : {} } })
  }
  if (current.plans.needsReview.length) {
    const count = current.plans.needsReview.length
    todo.push({ key: 'review-accounts', kind: 'review-accounts', title: `${plural(count, 'account')} ${count === 1 ? 'needs' : 'need'} review`, meta: `${current.plans.needsReview.map(row => nameAccount(row.accountId)).join(' · ')}. Their steps wait until it’s fixed.`, target: { view: 'month', month } })
  }

  // ——— Heads-up: pots over or ahead of pace this month ———
  for (const row of care) headsUp.push({
    key: `pace:${row.key}`, kind: 'pace', tone: 'warning',
    title: row.leftPence < 0 ? `${nameDestination(row.destination)} ${pounds(-row.leftPence)} over` : `${nameDestination(row.destination)} ${roundPounds(row.aheadPence ?? 0)} ahead of pace`,
    meta: row.leftPence < 0 ? `Covered when ${monthName(month)} closes` : row.runsOut ? `At this rate it runs out around ${dayDate(row.runsOut)}` : 'Spending faster than planned',
    ...row.leftPence >= 0 ? { trailing: `${pounds(row.leftPence)} left` } : {},
    target: { view: 'month', month, ...row.destination.kind === 'pot' ? { potId: row.destination.potId } : {} },
  })

  // ——— Coming up: the next 45 days ———
  const until = addDays(today, COMING_UP_DAYS)
  const within = (date: string) => date >= today && date <= until
  for (const each of tracker.cards) {
    const close = closeDateFor(today, each.closeDay)
    const key = statementKey(each.id, close)
    const summary = statementSummary(document, key, today)
    const soFar = summary?.totalPence ? `${pounds(summary.totalPence)} so far` : undefined
    if (within(close)) comingUp.push({ key: `closes:${key}`, date: close, title: `${statementName(close)} closes`, meta: closesSoon.has(key) ? ['Tomorrow', soFar].filter(Boolean).join(' · ') : soFar, target: { view: 'spending', section: 'sort' } })
    const due = addDays(close, each.dueDaysAfterClose)
    if (within(due)) comingUp.push({ key: `due:${key}`, date: due, title: `${statementName(close)} due`, target: { view: 'spending', section: 'statements', statementKey: key } })
  }
  for (const source of document.budget.incomeSources) {
    if (source.type !== 'employment' || !source.payday || !adults.some(person => person.id === source.personId)) continue
    for (const forMonth of [monthOf(today), shiftMonth(monthOf(today), 1), shiftMonth(monthOf(today), 2)]) {
      const date = moneyArrives(forMonth, source.payday)
      if (!within(date) || comingUp.some(row => row.key === `pay:${source.personId}:${forMonth}`)) continue
      comingUp.push({ key: `pay:${source.personId}:${forMonth}`, date, title: `${name(source.personId)}’s pay arrives`, meta: `${monthName(forMonth)}’s money`, target: { view: 'month', month: forMonth } })
    }
  }
  const nextBudget = resolveBudget(document.budget, next)
  if (nextBudget.hasExplicitBudget && within(firstDayOf(next))) {
    const before = current.items
    const added = nextBudget.items.filter(item => !before.some(old => old.id === item.id))
    comingUp.push({ key: `budget:${next}`, date: firstDayOf(next), title: `${monthName(next)} budget: ${added.length ? 'new items' : 'changes'}`, meta: added.length ? [...added.slice(0, 3).map(item => item.name), ...added.length > 3 ? [`${added.length - 3} more`] : []].join(', ') : 'Changes apply from this month', target: { view: 'plan' } })
  }
  comingUp.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))

  const daysLeft = daysBetween(today, lastDayOf(monthOf(today)))
  const stage = month === monthOf(today) ? `In progress · ${plural(daysLeft, 'day')} left` : month < monthOf(today) ? 'Ended' : 'Upcoming'
  return { strip: { plan, ...spent ? { spent } : {}, ...cardFigure ? { card: cardFigure } : {} }, todo: todo.sort(order), headsUp, comingUp, done, stage, firstRun }
}

/** "Groceries £88.58 over · 3 pots with money left", or what's still missing before it can close. */
function closeMeta(document: BudgetDocument, month: string, today: string, nameDestination: (destination: BudgetDestination) => string) {
  const plan = closeMonthPlan(document, month, today)
  if (!plan) return ''
  if (plan.readiness.toSort) return `${plural(plan.readiness.toSort, 'transaction')} to sort first`
  if (!plan.readiness.postingsIn && !plan.readiness.allIn) return 'Waiting for late postings, or mark them all in'
  const pot = (potId: string) => nameDestination({ kind: 'pot', potId }).split(' · ')[0]
  const over = plan.overspends.length === 1 ? `${pot(plan.overspends[0]!.potId)} ${pounds(plan.overspends[0]!.overPence)} over` : plan.overspends.length ? `${plural(plan.overspends.length, 'pot')} over` : 'Nothing over'
  return `${over} · ${plural(plan.leftovers.length, 'pot')} with money left`
}

/** The sidebar's Home count: every To do row, heads-ups included. */
export const homeCount = (inbox: Pick<HomeInbox, 'todo' | 'headsUp'>) => inbox.todo.length + inbox.headsUp.length
