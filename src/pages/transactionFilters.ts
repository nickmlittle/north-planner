import type { BudgetDocument } from '../domain/budgetDocument'
import { destinationsOf } from '../domain/cardSorting'
import { destinationKey, monthOf, type CardTransaction } from '../domain/cardTracker'
import type { MoveState } from '../domain/setAside'

/** Spending › Transactions: what the filters can pick, and the search. Pure, so it's tested on its own. */
export type TransactionStatus = 'to-sort' | 'rule' | 'moved' | 'split' | 'refund'
export type TransactionFilters = { destinations: string[]; people: string[]; statements: string[]; statuses: TransactionStatus[] }
export const NO_FILTERS: TransactionFilters = { destinations: [], people: [], statements: [], statuses: [] }
export const STATUS_LABELS: Record<TransactionStatus, string> = { 'to-sort': 'To sort', rule: 'Sorted by rule', moved: 'Moved to the set-aside pot', split: 'Split', refund: 'Refund' }

export const activeCount = (filters: TransactionFilters) => filters.destinations.length + filters.people.length + filters.statements.length + filters.statuses.length

/** Which statuses a transaction has. */
export function statusesOf(transaction: CardTransaction, moved?: MoveState): TransactionStatus[] {
  return [
    ...!transaction.sort ? ['to-sort' as const] : [],
    ...transaction.sort?.by === 'rule' ? ['rule' as const] : [],
    ...moved === 'moved' || moved === 'changed' ? ['moved' as const] : [],
    ...(transaction.sort?.lines.length ?? 0) > 1 ? ['split' as const] : [],
    ...transaction.kind === 'refund' ? ['refund' as const] : [],
  ]
}

/**
 * The transactions that pass every active filter group (any value within a group) and the search. Search matches
 * the description, where it went, the card ending, the person's name and the amount ("62.40").
 */
export function filterTransactions(document: Pick<BudgetDocument, 'household'>, rows: readonly CardTransaction[], filters: TransactionFilters, query: string, nameOf: (transaction: CardTransaction) => string, movedOf: (transaction: CardTransaction) => MoveState | undefined = () => undefined): CardTransaction[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const person = (transaction: CardTransaction) => document.household.adults.find(adult => adult.id === transaction.personId)?.name ?? ''
  return rows.filter(transaction => {
    if (filters.destinations.length && !destinationsOf(transaction.sort).some(destination => filters.destinations.includes(destinationKey(destination)))) return false
    if (filters.people.length && !filters.people.includes(transaction.personId ?? '')) return false
    if (filters.statements.length && !filters.statements.includes(transaction.statementKey)) return false
    if (filters.statuses.length && !statusesOf(transaction, movedOf(transaction)).some(status => filters.statuses.includes(status))) return false
    if (!words.length) return true
    const pounds = (Math.abs(transaction.amountPence) / 100).toFixed(2)
    const haystack = [transaction.description, nameOf(transaction), transaction.cardSuffix, person(transaction), pounds, pounds.replace(/\.00$/, '')].join(' ').toLocaleLowerCase()
    return words.every(word => haystack.includes(word.replace(/^£/, '')))
  })
}

/** Newest month first, keeping each month's rows in the order given. */
export function groupByMonth(rows: readonly CardTransaction[]): Array<{ month: string; rows: CardTransaction[]; totalPence: number }> {
  const groups = new Map<string, CardTransaction[]>()
  for (const row of rows) groups.set(monthOf(row.date), [...groups.get(monthOf(row.date)) ?? [], row])
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, list]) => ({ month, rows: list, totalPence: list.reduce((sum, row) => sum + row.amountPence, 0) }))
}
