import type { BudgetDocument } from './budgetDocument'
import type { BudgetItem, RecurringBill } from './monthlyBudget'

/**
 * Recurring bills: plan items that come out on a set date (docs/recurring-bills-rules.md). The details live on the
 * item (`BudgetItem.bill`), so they follow the plan's snapshot rules. Everything here is pure.
 */

/** A bill is seen through a card's statement only when it's on a card North tracks; otherwise it's assumed paid on its day. */
export function billTracked(bill: RecurringBill, document: Pick<BudgetDocument, 'card'>): boolean {
  return bill.paidBy === 'card' && !!bill.cardId && !!document.card?.cards.some(card => card.id === bill.cardId)
}

/**
 * The names of the items, in any month, whose bill is paid on this card: what removing it would change. Each item is
 * counted once, by its latest name.
 */
export function billsOnCard(document: Pick<BudgetDocument, 'budget'>, cardId: string): string[] {
  const { snapshots, importedBaseline } = document.budget
  const months = Object.keys(snapshots).sort()
  const lists: BudgetItem[][] = [importedBaseline ?? [], ...months.map(month => snapshots[month]!.items)]
  const names = new Map<string, string>()
  for (const items of lists) for (const item of items) if (item.bill?.paidBy === 'card' && item.bill.cardId === cardId) names.set(item.id, item.name)
  return [...names.values()]
}
