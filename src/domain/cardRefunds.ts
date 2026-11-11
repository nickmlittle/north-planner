import { addDays, cardTracker, type CardTracker, type CardTransaction, type SplitLine, type TransactionSort } from './cardTracker'
import { byNewest, splitByPercent } from './cardSorting'
import type { BudgetDocument } from './budgetDocument'
import type { BudgetDestination } from './monthlyBudget'

/**
 * Refunds (D5, §6.4): a refund goes back to the pot of the purchase it refunds, in the month it arrives,
 * and lowers that pot's share of the next statement.
 */
export const REFUND_LOOKBACK_DAYS = 180

/**
 * The purchase a refund most likely refunds: same card ending, same merchant, dated within 180 days before it,
 * for at least the refund's amount. An exact amount wins, then the most recent.
 */
export function findRefundMatch(tracker: Pick<CardTracker, 'transactions'>, refund: CardTransaction): CardTransaction | undefined {
  if (refund.kind !== 'refund') return undefined
  const amount = -refund.amountPence, from = addDays(refund.date, -REFUND_LOOKBACK_DAYS)
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  const candidates = tracker.transactions.filter(row => row.kind === 'purchase' && row.id !== refund.id && row.cardSuffix === refund.cardSuffix && row.merchant === refund.merchant && row.date <= refund.date && row.date >= from && row.amountPence >= amount)
  return candidates.sort((a, b) => Number(b.amountPence === amount) - Number(a.amountPence === amount) || byNewest(a, b, order))[0]
}

/** The purchase a refund is linked to (its `refundOf`), or the best match. */
export function refundPurchase(tracker: Pick<CardTracker, 'transactions'>, refund: CardTransaction): CardTransaction | undefined {
  return refund.refundOf ? tracker.transactions.find(row => row.id === refund.refundOf!.transactionId) : findRefundMatch(tracker, refund)
}

export type RefundPlan =
  /** The purchase went to one place (or one line of its split matches exactly): put the refund there. */
  | { kind: 'single'; purchase: CardTransaction; destination: BudgetDestination; lineIndex?: number }
  /** A split purchase with no exact line: the user chooses a line, or spreads it. */
  | { kind: 'split'; purchase: CardTransaction }
  /** The purchase isn't sorted yet. */
  | { kind: 'unsorted'; purchase: CardTransaction }

export function refundPlan(purchase: CardTransaction, refund: Pick<CardTransaction, 'amountPence'>): RefundPlan {
  const lines = purchase.sort?.lines
  if (!lines?.length) return { kind: 'unsorted', purchase }
  if (lines.length === 1) return { kind: 'single', purchase, destination: lines[0]!.destination }
  const exact = lines.findIndex(line => line.amountPence === -refund.amountPence)
  return exact >= 0 ? { kind: 'single', purchase, destination: lines[exact]!.destination, lineIndex: exact } : { kind: 'split', purchase }
}

/** "Spread across the split": the refund in proportion to each line of the purchase, in pennies that add up. */
export function spreadLines(refundPence: number, purchaseLines: readonly SplitLine[]): SplitLine[] {
  const amounts = splitByPercent(refundPence, purchaseLines.map(line => Math.max(0, line.amountPence)))
  return purchaseLines.map((line, index) => ({ amountPence: amounts[index]!, destination: line.destination, ...(line.item ? { item: line.item } : {}) })).filter(line => line.amountPence !== 0)
}

export type RefundChoice = { lineIndex: number } | { spread: true } | { destination: BudgetDestination }

/** Sort a refund back against its purchase and link them. */
export function sortRefund<T extends Pick<BudgetDocument, 'card'>>(document: T, refundId: string, purchaseId: string, choice: RefundChoice, now: Date, by: TransactionSort['by'] = 'person'): T {
  const tracker = cardTracker(document)
  const refund = tracker.transactions.find(row => row.id === refundId), purchase = tracker.transactions.find(row => row.id === purchaseId)
  if (!refund || !purchase || refund.kind !== 'refund') return document
  const purchaseLines = purchase.sort?.lines ?? []
  let lines: SplitLine[], lineIndex: number | undefined
  if ('spread' in choice) {
    if (!purchaseLines.length) return document
    lines = spreadLines(refund.amountPence, purchaseLines)
  } else if ('lineIndex' in choice) {
    const line = purchaseLines[choice.lineIndex]
    if (!line) return document
    lines = [{ amountPence: refund.amountPence, destination: line.destination, ...(line.item ? { item: line.item } : {}) }]
    lineIndex = choice.lineIndex
  } else lines = [{ amountPence: refund.amountPence, destination: choice.destination }]
  const sort: TransactionSort = { lines, by, at: now.toISOString() }
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => row.id === refundId ? { ...row, sort, refundOf: { transactionId: purchaseId, ...(lineIndex !== undefined ? { lineIndex } : {}) } } : row) } }
}

/**
 * On import (§6.2 step 6): a new refund first tries a refund match. A plain or exactly matching purchase
 * sorts it straight back (shown under Sorted by rules for checking); otherwise it's linked and left to sort.
 */
export function matchRefundOnImport(tracker: Pick<CardTracker, 'transactions'>, refund: CardTransaction, at: string): CardTransaction {
  const purchase = findRefundMatch(tracker, refund)
  if (!purchase) return refund
  const plan = refundPlan(purchase, refund)
  const refundOf = { transactionId: purchase.id, ...(plan.kind === 'single' && plan.lineIndex !== undefined ? { lineIndex: plan.lineIndex } : {}) }
  if (plan.kind !== 'single') return { ...refund, refundOf }
  return { ...refund, refundOf, sort: { lines: [{ amountPence: refund.amountPence, destination: plan.destination }], by: 'rule', at } }
}

/** Refunds linked to a purchase, for "Refunded −£14.99 on 6 Nov" on its row. */
export const refundsOf = (tracker: Pick<CardTracker, 'transactions'>, purchaseId: string) => tracker.transactions.filter(row => row.refundOf?.transactionId === purchaseId)

/** Payments to Amex, newest first. Never sorted or counted as spending. */
export function payments(tracker: Pick<CardTracker, 'transactions'>): CardTransaction[] {
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  return tracker.transactions.filter(row => row.kind === 'payment').sort((a, b) => byNewest(a, b, order))
}
