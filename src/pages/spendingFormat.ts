import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, daysBetween, isWaiting, lastDayOf, localDate, type CardTransaction, type WaitingOn } from '../domain/cardTracker'
import { refundsOf } from '../domain/cardRefunds'
import { transactionsToSort } from '../domain/cardSorting'
import { formatGBP } from '../formatting/money'
import { dayDate, shortDate } from './cardLabels'
import type { StatementSummary } from '../domain/cardStatements'
import { formatMonth } from '../formatting/month'
import type { MonthSpending } from '../domain/cardSpending'
import type { ClosePlan, MonthStatus } from '../domain/monthStages'
import type { BillSum } from '../domain/billSum'
import type { GoThroughScope } from '../domain/goThrough'

export const pounds = (pence: number) => formatGBP(pence / 100)
/** "£62.40", or "−£24.99" for a refund. */
export const signedPounds = (pence: number) => pence < 0 ? `−${pounds(-pence)}` : pounds(pence)
export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

/** "Ada ··41001": whose card, by its ending. */
export function cardLabel(document: Pick<BudgetDocument, 'household'>, transaction: Pick<CardTransaction, 'personId' | 'cardSuffix'>): string {
  const name = document.household.adults.find(person => person.id === transaction.personId)?.name
  return `${name ?? 'Card'} ··${transaction.cardSuffix}`
}

/** A Waiting reason (W2, W5): "Ask Ada" or "To discuss". */
export function waitingReason(document: Pick<BudgetDocument, 'household'>, on: WaitingOn): string {
  return on.kind === 'discuss' ? 'To discuss' : `Ask ${document.household.adults.find(person => person.id === on.personId)?.name ?? 'them'}`
}

/** The reasons a row can wait on: its cardholder first, then the other adults in household order, then To discuss (W5). */
export function waitingReasons(document: Pick<BudgetDocument, 'household'>, transaction: Pick<CardTransaction, 'personId'>): WaitingOn[] {
  const adults = [...document.household.adults].sort((a, b) => Number(b.id === transaction.personId) - Number(a.id === transaction.personId))
  return [...adults.map(person => ({ kind: 'person' as const, personId: person.id })), { kind: 'discuss' }]
}

export const sameReason = (a: WaitingOn | undefined, b: WaitingOn | undefined) => !!a && !!b && a.kind === b.kind && (a.kind === 'discuss' || a.personId === (b as { personId: string }).personId)

/** Who a go-through is with (W9): "with Ada", or "to discuss". */
const goThroughWho = (document: Pick<BudgetDocument, 'household'>, on: WaitingOn) =>
  on.kind === 'discuss' ? 'to discuss' : `with ${document.household.adults.find(person => person.id === on.personId)?.name ?? 'them'}`

/** The go-through sheet's title: "Go through with Ada", "Go through what’s to discuss", or Close's "Go through November’s waiting". */
export const goThroughTitle = (document: Pick<BudgetDocument, 'household'>, scope: GoThroughScope) =>
  scope.kind === 'month' ? `Go through ${monthName(scope.month)}’s waiting`
    : scope.on.kind === 'discuss' ? 'Go through what’s to discuss' : `Go through ${goThroughWho(document, scope.on)}`

/**
 * The message once a go-through ends: "Gone through 4 with Ada: 3 sorted, 1 still waiting.", or, closed part way,
 * "Gone through 2 of 4 to discuss: 1 sorted, 1 back in To sort." Close's reads "Gone through November’s 6 waiting: …"
 * or "Gone through 2 of November’s 6 waiting: …". Empty when nothing was gone through.
 */
export function goThroughEnded(document: Pick<BudgetDocument, 'household'>, scope: GoThroughScope, of: number, counts: { passed: number; sorted: number; waiting: number; back: number; all: boolean }): string {
  if (!counts.passed) return ''
  const parts = [counts.sorted ? `${counts.sorted} sorted` : '', counts.back ? `${counts.back} back in To sort` : '', counts.waiting ? `${counts.waiting} still waiting` : ''].filter(Boolean)
  const what = scope.kind === 'month' ? `${counts.all ? '' : `${counts.passed} of `}${monthName(scope.month)}’s ${of} waiting`
    : `${counts.passed}${counts.all ? '' : ` of ${of}`} ${goThroughWho(document, scope.on)}`
  return `Gone through ${what}: ${parts.join(', ')}.`
}

/** How long a row has waited, from when it was marked (WP5): "today", "1 day", "8 days". */
export function waitedFor(at: string, today: string): string {
  const days = Math.max(0, daysBetween(localDate(new Date(at)), today))
  return days === 0 ? 'today' : plural(days, 'day')
}

/** "Sun 8 Nov · Ada ··41001". */
export const transactionMeta = (document: Pick<BudgetDocument, 'household'>, transaction: CardTransaction) => `${dayDate(transaction.date)} · ${cardLabel(document, transaction)}`

/** "Mon 9 Nov" for an ISO time, on the device's calendar. */
export const dayOf = (iso: string) => dayDate(localDate(new Date(iso)))

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
/** Statements are named by the month they close in: the 25 Oct – 24 Nov statement is November's. */
export const statementName = (closeDate: string) => `${monthName(closeDate.slice(0, 7))} statement`
/** A bill names its month too (D1): "November bill", or "November bill so far" while it's open. */
export const billName = (closeDate: string, open = false) => `${monthName(closeDate.slice(0, 7))} bill${open ? ' so far' : ''}`

/** Where a statement is: open, waiting for something, ready, part ticked, or settled. */
export function statementStatus(summary: StatementSummary): { text: string; tone: 'open' | 'todo' | 'ready' | 'done' } {
  if (summary.settled) return { text: `Settled${summary.record?.settledAt ? ` ${dayOf(summary.record.settledAt)}` : ''}`, tone: 'done' }
  if (summary.open) return { text: `Open · closes ${dayDate(summary.closeDate)}`, tone: 'open' }
  if (summary.toSort) return { text: `${summary.toSort} to sort`, tone: 'todo' }
  // Waiting rows block only a statement that settles once; on a bill paid from the Amex pot the buffer covers them (W11).
  if (summary.waiting && summary.complete && !summary.ready) return { text: `${summary.waiting} waiting`, tone: 'todo' }
  if (!summary.complete) return { text: 'Needs the final export', tone: 'todo' }
  if (summary.done) return { text: `${summary.done} of ${summary.steps} done`, tone: 'ready' }
  return { text: `Ready to settle · due ${dayDate(summary.dueDate)}`, tone: 'ready' }
}

/** "In progress · 18 days left", "Closing", "To settle", "Settled". */
export function stageLabel(stage: MonthStatus, figures: MonthSpending): string {
  if (stage.stage === 'in-progress') return `In progress · ${figures.daysLeft} ${figures.daysLeft === 1 ? 'day' : 'days'} left`
  if (stage.stage === 'closing') return 'Closing'
  if (stage.stage === 'to-settle') return `To settle${stage.closedAt ? ` · closed ${dayOf(stage.closedAt)}` : ''}`
  if (stage.stage === 'settled') return 'Settled'
  return stage.stage === 'funded' ? 'Funded' : stage.stage === 'funding' ? `Funding · ${stage.funding.done} of ${stage.funding.total}` : 'Not started'
}

/** Why Close <Month> can't be pressed yet, for the button's title and the line beside it; null when it can. */
export function closeBlocker(plan: ClosePlan, month: string, today: string): string | null {
  if (plan.readiness.canClose) return null
  const name = monthName(month)
  if (today <= lastDayOf(month)) return `${name} ends on ${dayDate(lastDayOf(month))}.`
  if (plan.readiness.toSort) return `Sort ${plural(plan.readiness.toSort, 'transaction')} first.`
  if (plan.readiness.waiting) return `Close ${name} once nothing is waiting.`
  return `Waiting for late ${name} transactions to post.`
}

/** Refunds and their purchases point at each other: "Refund of COSTCO £186.40 · 24 Oct", "Refunded −£14.99 · 6 Nov". */
export function transactionLink(document: BudgetDocument, transaction: CardTransaction): string {
  const tracker = cardTracker(document)
  const purchase = transaction.refundOf ? tracker.transactions.find(row => row.id === transaction.refundOf!.transactionId) : undefined
  if (purchase) return `Refund of ${purchase.description} ${signedPounds(purchase.amountPence)} · ${shortDate(purchase.date)}`
  return transaction.kind === 'purchase' ? refundsOf(tracker, transaction.id).map(row => `Refunded ${signedPounds(row.amountPence)} · ${shortDate(row.date)}`).join(' · ') : ''
}

/**
 * How far pace can see (Spending ↔ Month link, design rule 1): the newest card transaction brought in, how many are
 * still to sort, and how many are waiting. Null without a card. "Amex sorted to Fri 13 Nov", 3 to sort, 6 waiting;
 * "Amex not brought in yet".
 */
export function freshness(document: Pick<BudgetDocument, 'card'>): { lead: string; toSort: number; waiting: number; broughtIn: boolean } | null {
  const tracker = cardTracker(document)
  if (!tracker.cards.length) return null
  const card = tracker.cards.length === 1 ? tracker.cards[0]!.name : 'Cards'
  const newest = tracker.transactions.filter(row => row.kind !== 'payment').reduce<string | undefined>((max, row) => !max || row.date > max ? row.date : max, undefined)
  if (!newest) return { lead: `${card} not brought in yet`, toSort: 0, waiting: 0, broughtIn: false }
  return { lead: `${card} sorted to ${dayDate(newest)}`, toSort: transactionsToSort(tracker).length, waiting: tracker.transactions.filter(row => !row.sort && isWaiting(row)).length, broughtIn: true }
}

/** "£727.27 in the Amex pot · £402.00 to move · £24.00 to sort · £212.40 waiting · £79.00 expecting back", or "Covered" once it's all in. */
export function billParts(bill: BillSum, phrase: string): string {
  if (bill.covered) return `Covered · all in ${phrase}`
  const parts = [`${signedPounds(bill.inPotPence)} in ${phrase}`, bill.toMovePence ? `${signedPounds(bill.toMovePence)} to move` : '', bill.toSort ? `${signedPounds(bill.toSortPence)} to sort` : '', bill.waiting ? `${signedPounds(bill.waitingPence)} waiting` : '', bill.expectingBackPence ? `${signedPounds(bill.expectingBackPence)} expecting back` : '']
  return parts.filter(Boolean).join(' · ')
}

/**
 * To sort lists rows under their own month once they span more than one (a bring-in can carry last month's late rows):
 * the heading each row starts under, or none for a row that continues its month. Rows come newest first.
 */
export function monthHeads(rows: ReadonlyArray<Pick<CardTransaction, 'id' | 'date'>>, today: string): Map<string, { month: string; name: string; earlier: boolean }> {
  const heads = new Map<string, { month: string; name: string; earlier: boolean }>()
  if (new Set(rows.map(row => row.date.slice(0, 7))).size < 2) return heads
  let last = ''
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    if (month !== last) heads.set(row.id, { month, name: monthName(month), earlier: month < today.slice(0, 7) })
    last = month
  }
  return heads
}
