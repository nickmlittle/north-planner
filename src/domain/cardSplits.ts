import type { BudgetDocument } from './budgetDocument'
import { destinationKey, monthOf, type CardTransaction, type SplitLine } from './cardTracker'
import { splitByPercent } from './cardSorting'
import { resolveIncomeSources, type BudgetDestination } from './monthlyBudget'

/**
 * Splits (D4): one transaction as lines by amount, half each, the funding share, or receipt items.
 * Lines keep the transaction's sign and must add up to it.
 */

/** Each adult's share of positive employment income in a month: the proportional funding share Transfers uses. */
export function fundingShares(document: Pick<BudgetDocument, 'budget' | 'household'>, month: string): Array<{ personId: string; weight: number }> | null {
  const sources = resolveIncomeSources(document.budget, month).filter(source => source.type === 'employment')
  const shares = document.household.adults.map(person => ({ personId: person.id, weight: sources.filter(source => source.personId === person.id).reduce((sum, source) => sum + Math.max(0, source.amountPence), 0) }))
  return shares.some(share => share.weight > 0) ? shares : null
}

/** "62/38": the shares as whole percentages, for the button. */
export function shareLabel(shares: ReadonlyArray<{ weight: number }>): string {
  return splitByPercent(100, shares.map(share => share.weight)).join('/')
}

/** Where a person's half goes by default: their own pot (A–Z), else their own account, else the joint account. */
export function personDestination(document: Pick<BudgetDocument, 'budget'>, personId: string, fallback: BudgetDestination): BudgetDestination {
  const own = document.budget.accounts.filter(account => account.ownerPersonIds.length === 1 && account.ownerPersonIds[0] === personId)
  const pot = [...document.budget.pots].sort((a, b) => a.name.localeCompare(b.name, 'en-GB')).find(row => own.some(account => account.id === row.accountId))
  if (pot) return { kind: 'pot', potId: pot.id }
  return own[0] ? { kind: 'account', accountId: own[0].id } : fallback
}

/** One line per adult, splitting the amount by these weights (equal for half each). */
export function sharedLines(document: Pick<BudgetDocument, 'budget' | 'household'>, transaction: Pick<CardTransaction, 'amountPence'>, shares: ReadonlyArray<{ personId: string; weight: number }>, fallback: BudgetDestination): SplitLine[] {
  const amounts = splitByPercent(transaction.amountPence, shares.map(share => share.weight))
  return shares.map((share, index) => ({ amountPence: amounts[index]!, destination: personDestination(document, share.personId, fallback) })).filter(line => line.amountPence !== 0)
}

export const halfEach = (document: Pick<BudgetDocument, 'budget' | 'household'>, transaction: Pick<CardTransaction, 'amountPence'>, fallback: BudgetDestination) =>
  sharedLines(document, transaction, document.household.adults.map(person => ({ personId: person.id, weight: 1 })), fallback)

export const byFundingShare = (document: Pick<BudgetDocument, 'budget' | 'household'>, transaction: Pick<CardTransaction, 'amountPence' | 'date'>, fallback: BudgetDestination) => {
  const shares = fundingShares(document, monthOf(transaction.date))
  return shares ? sharedLines(document, transaction, shares, fallback) : null
}

/**
 * Receipt items: each typed item is a line, and "Everything else" takes the remainder. Amounts are typed
 * as positive pence and given the transaction's sign. Null when the items come to more than the transaction.
 */
export function receiptLines(transaction: Pick<CardTransaction, 'amountPence'>, items: ReadonlyArray<{ item: string; pence: number; destination: BudgetDestination }>, rest: BudgetDestination): SplitLine[] | null {
  const sign = transaction.amountPence < 0 ? -1 : 1
  const total = Math.abs(transaction.amountPence)
  const placed = items.reduce((sum, row) => sum + row.pence, 0)
  if (placed > total || items.some(row => row.pence <= 0)) return null
  const lines: SplitLine[] = items.map(row => ({ amountPence: row.pence * sign, destination: row.destination, ...(row.item.trim() ? { item: row.item.trim() } : {}) }))
  return total - placed > 0 ? [...lines, { amountPence: (total - placed) * sign, destination: rest }] : lines
}

/** The total by pot: lines added up per destination, largest first. */
export function totalsByDestination(lines: readonly SplitLine[]): Array<{ destination: BudgetDestination; amountPence: number }> {
  const totals = new Map<string, { destination: BudgetDestination; amountPence: number }>()
  for (const line of lines) {
    const key = destinationKey(line.destination)
    const row = totals.get(key) ?? { destination: line.destination, amountPence: 0 }
    row.amountPence += line.amountPence
    totals.set(key, row)
  }
  return [...totals.values()].sort((a, b) => Math.abs(b.amountPence) - Math.abs(a.amountPence))
}

/** "Split · 4 pots", or "Split · 3 ways" when an account is one of them. */
export function splitLabel(lines: readonly SplitLine[]): string {
  const totals = totalsByDestination(lines)
  return totals.every(row => row.destination.kind === 'pot') ? `Split · ${totals.length} ${totals.length === 1 ? 'pot' : 'pots'}` : `Split · ${totals.length} ways`
}
