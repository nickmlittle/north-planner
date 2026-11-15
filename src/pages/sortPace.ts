import type { BudgetDocument } from '../domain/budgetDocument'
import { leftByDestination, monthSpending, paceIfPlaced, potName, potSettings } from '../domain/cardSpending'
import { restoreSort } from '../domain/cardSorting'
import { destinationKey, monthOf, type CardTransaction } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { potBalance } from '../domain/potBalances'
import { impactText, impactTone, optionPaceText, tippedText } from '../formatting/paceLabels'

/**
 * Pace where you sort (Spending ↔ Month link F5): each option's "£130.00 left · £110 ahead", the impact line before
 * placing, and the toast when a placing tips a pot. Used by the phone sort sheet and the desktop To sort table.
 */

export type PickerPace = { text: string; tone?: 'warning' | 'critical' }

/** Each pot's suffix in the picker, against the transaction's month, toned when ahead or over. Accounts have none. */
export function pickerPace(document: BudgetDocument, month: string, today: string): (destination: BudgetDestination) => PickerPace {
  const rows = new Map(monthSpending(document, month, today).rows.map(row => [row.key, row]))
  const left = leftByDestination(document, month)
  return destination => {
    if (destination.kind === 'account') return { text: '' }
    const key = destinationKey(destination)
    const row = rows.get(key)
    if (potSettings(document, destination.potId).carriesOver) return { text: optionPaceText(row, potBalance(document, destination.potId, today).freePence) }
    if (row) return { text: optionPaceText(row), ...row.status === 'over' ? { tone: 'critical' } : row.status === 'ahead' ? { tone: 'warning' } : {} }
    // Not on the month's list: nothing spent yet and no pace, so Left is what's planned.
    const pence = left.get(key)
    return { text: pence ? optionPaceText({ destination, status: 'left', leftPence: pence, carriesOver: false }) : 'nothing planned' }
  }
}

/** The toast's content when a placing tips a pot: "Groceries is now £110 ahead of pace", Open Groceries, Undo. */
export type Tipped = { text: string; potId: string; potName: string; month: string; undo: (document: BudgetDocument) => BudgetDocument; undone: string }

/**
 * What placing `transaction` in `destination` would do: the impact line, its tone, and the toast if it tips the pot.
 * They name the pot alone ("Groceries: On track → £110 ahead"), as Month does: the picker already shows whose it is.
 */
export function placeImpact(document: BudgetDocument, transaction: CardTransaction, destination: BudgetDestination, today: string): { text: string; tone?: 'warning' | 'critical'; tipped?: Tipped } {
  const impact = paceIfPlaced(document, transaction, destination, today)
  const name = potName(document.budget.pots, destination) ?? ''
  const tone = impactTone(impact)
  const text = impactText(name, impact)
  const tip = tippedText(name, impact)
  const previous = transaction.sort
  return {
    text, ...tone && text ? { tone } : {},
    ...tip && destination.kind === 'pot' ? { tipped: { text: tip, potId: destination.potId, potName: name, month: monthOf(transaction.date), undo: current => restoreSort(current, transaction.id, previous), undone: `${transaction.description} is back ${previous ? 'where it was' : 'in To sort'}.` } } : {},
  }
}
