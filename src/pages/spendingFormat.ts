import type { BudgetDocument } from '../domain/budgetDocument'
import { lastDayOf, localDate, type CardTransaction } from '../domain/cardTracker'
import { formatGBP } from '../formatting/money'
import { dayDate } from './cardLabels'
import type { StatementSummary } from '../domain/cardStatements'
import { formatMonth } from '../formatting/month'
import type { MonthSpending } from '../domain/cardSpending'
import type { ClosePlan, MonthStatus } from '../domain/monthStages'

export const pounds = (pence: number) => formatGBP(pence / 100)
/** "£62.40", or "−£24.99" for a refund. */
export const signedPounds = (pence: number) => pence < 0 ? `−${pounds(-pence)}` : pounds(pence)
export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

/** "Ada ··41001": whose card, by its ending. */
export function cardLabel(document: Pick<BudgetDocument, 'household'>, transaction: Pick<CardTransaction, 'personId' | 'cardSuffix'>): string {
  const name = document.household.adults.find(person => person.id === transaction.personId)?.name
  return `${name ?? 'Card'} ··${transaction.cardSuffix}`
}

/** "Sun 8 Nov · Ada ··41001". */
export const transactionMeta = (document: Pick<BudgetDocument, 'household'>, transaction: CardTransaction) => `${dayDate(transaction.date)} · ${cardLabel(document, transaction)}`

/** "Mon 9 Nov" for an ISO time, on the device's calendar. */
export const dayOf = (iso: string) => dayDate(localDate(new Date(iso)))

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
/** Statements are named by the month they close in: the 25 Oct – 24 Nov statement is November's. */
export const statementName = (closeDate: string) => `${monthName(closeDate.slice(0, 7))} statement`

/** Where a statement is: open, waiting for something, ready, part ticked, or settled. */
export function statementStatus(summary: StatementSummary): { text: string; tone: 'open' | 'todo' | 'ready' | 'done' } {
  if (summary.settled) return { text: `Settled${summary.record?.settledAt ? ` ${dayOf(summary.record.settledAt)}` : ''}`, tone: 'done' }
  if (summary.open) return { text: `Open · closes ${dayDate(summary.closeDate)}`, tone: 'open' }
  if (summary.toSort) return { text: `${summary.toSort} to sort`, tone: 'todo' }
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
  return `Waiting for late ${name} transactions to post.`
}

