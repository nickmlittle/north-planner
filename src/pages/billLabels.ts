import type { BillDay, RemindWeeks } from '../domain/monthlyBudget'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { DestinationSpending } from '../domain/cardSpending'
import { cardTracker, daysBetween } from '../domain/cardTracker'
import { pounds } from './spendingFormat'
import { ordinal, shortDate } from './cardLabels'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A monthly bill's day: "the 3rd each month", "the last day of each month". */
export function monthlyBillDay(day: BillDay): string {
  return day === 'last' ? 'the last day of each month' : `the ${ordinal(day)} each month`
}

/** A yearly bill's date: "3 March", "the last day of February". */
export function yearlyBillDate(day: BillDay, month: number): string {
  const name = MONTH_NAMES[month - 1] ?? ''
  return day === 'last' ? `the last day of ${name}` : `${day}\u00a0${name}`
}

/** The Remind me choices, in the order shown. */
export function remindLabel(weeks: RemindWeeks): string {
  return weeks === 0 ? 'Don’t remind me' : `${weeks} weeks before`
}

/** "Direct debit", "Card · Amex" (a tracked card), or "Card" (another card). */
export function paidByLabel(bill: { paidBy: 'direct-debit' | 'card'; tracked: boolean; cardId?: string }, cards: ReadonlyArray<{ id: string; name: string }>): string {
  if (bill.paidBy === 'direct-debit') return 'Direct debit'
  const card = bill.tracked ? cards.find(row => row.id === bill.cardId) : undefined
  return card ? `Card · ${card.name}` : 'Card'
}

/** A bill's status on a date: "Paid", "Via Amex", "Due tomorrow", "Due in 5 days" (within a week) or "Due 22 Nov". */
export function billStatus(bill: { date: string; state: 'paid' | 'due'; tracked: boolean; cardId?: string }, today: string, cards: ReadonlyArray<{ id: string; name: string }>): string {
  if (bill.tracked) return `Via ${cards.find(row => row.id === bill.cardId)?.name ?? 'card'}`
  if (bill.state === 'paid') return 'Paid'
  const days = daysBetween(today, bill.date)
  if (days === 1) return 'Due tomorrow'
  if (days > 1 && days <= 7) return `Due in ${days} days`
  return `Due ${shortDate(bill.date)}`
}

/** "sorted from Amex" with one card, "sorted from cards" with more. */
function cardWord(document: BudgetDocument) {
  const cards = cardTracker(document).cards
  return cards.length === 1 ? cards[0]!.name : 'cards'
}

/** What Spent is made of: "£234.82 direct debits and cards, on their day · £19.99 sorted from Amex". */
export function spentParts(document: BudgetDocument, row: DestinationSpending): string {
  const cardPence = row.spentPence - row.billsPaidPence
  return [
    row.billsPaidPence ? `${pounds(row.billsPaidPence)} direct debits and cards, on their day` : '',
    cardPence ? `${pounds(cardPence)} sorted from ${cardWord(document)}` : '',
  ].filter(Boolean).join(' · ')
}
