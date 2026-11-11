import { normaliseDescription, type CardTracker, type CardTransaction, type SortRule, type SplitLine, type TransactionSort } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'

/** The first rule, in list order, whose text appears in the normalised description (and whose card matches, if it names one). */
export function matchRule(rules: readonly SortRule[], transaction: Pick<CardTransaction, 'description' | 'cardSuffix'>): SortRule | undefined {
  const description = normaliseDescription(transaction.description)
  return rules.find(rule => {
    const text = normaliseDescription(rule.contains)
    return !!text && description.includes(text) && (!rule.cardSuffix || rule.cardSuffix === transaction.cardSuffix)
  })
}

/**
 * Splits an amount by percentages into whole pennies that add up exactly: floor each share,
 * then hand out the spare pennies by largest remainder (earlier parts win ties). Keeps the sign.
 */
export function splitByPercent(amountPence: number, percents: readonly number[]): number[] {
  const sign = amountPence < 0 ? -1 : 1, total = Math.abs(amountPence)
  const sum = percents.reduce((a, b) => a + b, 0)
  const exact = percents.map(percent => sum > 0 ? total * percent / sum : 0)
  const shares = exact.map(Math.floor)
  let spare = total - shares.reduce((a, b) => a + b, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of order) { if (spare <= 0) break; shares[index]! += 1; spare -= 1 }
  return shares.map(share => share === 0 ? 0 : share * sign)
}

/** The lines a rule gives a transaction: one line, or its split by percent. */
export function ruleLines(rule: SortRule, amountPence: number): SplitLine[] {
  if (rule.split?.length) {
    const shares = splitByPercent(amountPence, rule.split.map(part => part.percent))
    const lines = rule.split.map((part, index) => ({ amountPence: shares[index]!, destination: part.destination })).filter(line => line.amountPence !== 0)
    return lines.length ? lines : [{ amountPence, destination: rule.split[0]!.destination }]
  }
  return [{ amountPence, destination: rule.destination! }]
}

export function ruleSort(rule: SortRule, amountPence: number, at: string): TransactionSort {
  return { lines: ruleLines(rule, amountPence), by: 'rule', ruleId: rule.id, at }
}

/** A simple sort: the whole transaction to one pot or account. */
export function singleSort(destination: BudgetDestination, amountPence: number, at: string): TransactionSort {
  return { lines: [{ amountPence, destination }], by: 'person', at }
}

/** Newest first: by date, then the order they came in. */
export function byNewest(a: CardTransaction, b: CardTransaction, order: ReadonlyMap<string, number>): number {
  return b.date.localeCompare(a.date) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
}

/** Purchases and refunds with no pot or account yet, newest first. Payments are never sorted. */
export function transactionsToSort(tracker: Pick<CardTracker, 'transactions'>): CardTransaction[] {
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  return tracker.transactions.filter(row => row.kind !== 'payment' && !row.sort).sort((a, b) => byNewest(a, b, order))
}

/** The latest import, for "Last brought in Mon 9 Nov". */
export const lastImport = (tracker: Pick<CardTracker, 'imports'>, cardId?: string) => [...tracker.imports].reverse().find(row => !cardId || row.cardId === cardId)
