import type { BudgetDocument } from './budgetDocument'
import { cardTracker, destinationKey, localDate, parseStatementKey, type CardTracker, type CardTransaction, type SplitLine } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'

/**
 * Expecting back (month-health plan D11, P7). A receipt item ticked **Back** is a return on its way:
 * - **Held** while its bill is open: not spent, not moved to the Amex pot. It's the bill's fifth part.
 * - **Linking** (`linkRefund`, health 9b): when the refund lands, you link it to the order. On the same bill the refund
 *   cancels what it covers: neither is spent nor moved, ever. **That's everything back** closes the order, so any
 *   difference (a discount code, postage) counts as spending; **More to come** leaves the rest expecting back.
 * - **Settle up:** once the bill has closed, whatever is still held has to be paid, so it counts as spending (in the
 *   purchase's month) and moves with the rest. A refund that lands later is an ordinary refund: it moves back out of
 *   the Amex pot, and it clears the purchase from the Expecting back list.
 * - **Not coming back** / **That's everything back:** one stored mark, `notComingBackAt`: nothing more is coming back.
 *   What linked refunds cancelled stays cancelled; the rest counts as spending from then on.
 * Rules: docs/card-tracker-rules.md, "Expecting back".
 */

export type DestinationTotals = Map<string, { destination: BudgetDestination; pence: number }>
/** Per transaction id, by destination: the part of its lines left out of spending and moves today (signed like the lines). */
export type Held = Map<string, DestinationTotals>

/** A purchase line that's still expected back (ticked Back, not marked Not coming back). */
export const isHeld = (line: SplitLine) => !!line.expectingBack && !line.notComingBackAt
/** A purchase line ticked Back, still out or not: linked refunds cancel against it. */
const isReturn = (line: SplitLine) => !!line.expectingBack

const add = (totals: DestinationTotals, destination: BudgetDestination, pence: number) => {
  if (!pence) return
  const key = destinationKey(destination)
  const row = totals.get(key) ?? { destination, pence: 0 }
  row.pence += pence
  totals.set(key, row)
}

/** Its bill is still open today: held money stays in its pot. */
export const billOpen = (transaction: Pick<CardTransaction, 'statementKey'>, today: string) => today <= (parseStatementKey(transaction.statementKey)?.closeDate ?? '')

export type HeldPurchase = {
  purchase: CardTransaction
  /** The held lines, with their index in the purchase's sort. */
  lines: Array<{ index: number; line: SplitLine }>
  heldPence: number
  /** Refunded against the held lines so far. */
  backPence: number
  /** Still expected back: held − refunded. */
  outPence: number
  /** The purchase's bill is still open: the money is held in its pot. Closed: it moved at settle up. */
  open: boolean
  /** Nothing more is coming back (That's everything back, or Not coming back). */
  closed: boolean
  /** When the items were ticked Back (the sort's time). */
  markedAt: string
  byDestination: Array<{ destination: BudgetDestination; heldPence: number; backPence: number; outPence: number; cancelledPence: number }>
}

/** A refund's lines that refund held lines of its purchase. */
const refundHeldLines = (refund: CardTransaction) => (refund.sort?.lines ?? []).filter(line => line.expectingBack)

function heldPurchase(tracker: Pick<CardTracker, 'transactions'>, purchase: CardTransaction, today: string): HeldPurchase | null {
  if (purchase.kind !== 'purchase' || !purchase.sort) return null
  const lines = purchase.sort.lines.flatMap((line, index) => isReturn(line) ? [{ index, line }] : [])
  if (!lines.length) return null
  const closed = lines.every(({ line }) => !!line.notComingBackAt)
  const held: DestinationTotals = new Map(), back: DestinationTotals = new Map(), cancelled: DestinationTotals = new Map()
  for (const { line } of lines) add(held, line.destination, line.amountPence)
  for (const refund of tracker.transactions) if (refund.kind === 'refund' && refund.refundOf?.transactionId === purchase.id) for (const line of refundHeldLines(refund)) {
    add(back, line.destination, -line.amountPence)
    // On the same bill, the refund cancels the held money: it never moves.
    if (refund.statementKey === purchase.statementKey) add(cancelled, line.destination, -line.amountPence)
  }
  const byDestination = [...held.entries()].map(([key, row]) => {
    const backPence = Math.min(row.pence, back.get(key)?.pence ?? 0)
    return { destination: row.destination, heldPence: row.pence, backPence, outPence: closed ? 0 : row.pence - backPence, cancelledPence: Math.min(row.pence, cancelled.get(key)?.pence ?? 0) }
  })
  const heldPence = byDestination.reduce((sum, row) => sum + row.heldPence, 0), backPence = byDestination.reduce((sum, row) => sum + row.backPence, 0)
  const outPence = byDestination.reduce((sum, row) => sum + row.outPence, 0)
  return { purchase, lines, heldPence, backPence, outPence, open: billOpen(purchase, today), closed, markedAt: purchase.sort.at, byDestination }
}

/** Every purchase with lines ticked Back, newest first. */
export function heldPurchases(tracker: Pick<CardTracker, 'transactions'>, today: string = localDate()): HeldPurchase[] {
  return tracker.transactions.flatMap(row => { const held = heldPurchase(tracker, row, today); return held ? [held] : [] })
    .sort((a, b) => b.purchase.date.localeCompare(a.purchase.date) || a.purchase.id.localeCompare(b.purchase.id))
}

/** Still expected back: purchases with something not refunded yet (Spending › Expecting back). */
export const expectingBack = (tracker: Pick<CardTracker, 'transactions'>, today: string = localDate()) => heldPurchases(tracker, today).filter(row => row.outPence > 0)

/**
 * What North leaves out of spending and moves today, per transaction. A purchase: all its held lines while its bill is
 * open, then only the part a refund on the same bill cancelled. That refund: the part it cancelled.
 */
export function heldOut(tracker: Pick<CardTracker, 'transactions'>, today: string = localDate()): Held {
  const out: Held = new Map()
  const totals = (id: string) => { const row = out.get(id) ?? new Map(); out.set(id, row); return row }
  for (const held of heldPurchases(tracker, today)) {
    // What a same-bill refund cancelled never counts; what's still out is held while the bill is open.
    for (const row of held.byDestination) add(totals(held.purchase.id), row.destination, row.cancelledPence + (held.open ? row.outPence : 0))
    // Share each destination's cancelled amount over the same-bill refunds, oldest first.
    const left = new Map(held.byDestination.map(row => [destinationKey(row.destination), row.cancelledPence]))
    const refunds = tracker.transactions.filter(row => row.kind === 'refund' && row.refundOf?.transactionId === held.purchase.id && row.statementKey === held.purchase.statementKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    for (const refund of refunds) for (const line of refundHeldLines(refund)) {
      const key = destinationKey(line.destination)
      const take = Math.min(left.get(key) ?? 0, -line.amountPence)
      if (take <= 0) continue
      left.set(key, left.get(key)! - take)
      add(totals(refund.id), line.destination, -take)
    }
  }
  for (const [id, row] of out) if (!row.size) out.delete(id)
  return out
}

/** A transaction's lines by destination, less what's held: what counts as spending and what moves. */
export function countedTotals(transaction: CardTransaction, held?: Held): DestinationTotals {
  const totals: DestinationTotals = new Map()
  for (const line of transaction.sort?.lines ?? []) add(totals, line.destination, line.amountPence)
  for (const row of held?.get(transaction.id)?.values() ?? []) add(totals, row.destination, -row.pence)
  for (const [key, row] of totals) if (!row.pence) totals.delete(key)
  return totals
}

/** Σ what's held for these transactions: a bill's Expecting back part. */
export const heldPence = (held: Held, transactions: readonly Pick<CardTransaction, 'id'>[]) =>
  transactions.reduce((sum, row) => sum + [...held.get(row.id)?.values() ?? []].reduce((total, part) => total + part.pence, 0), 0)

/** What's held in a pot today (purchases only): "Held £79.00 · expecting back". */
export function heldInPot(tracker: Pick<CardTracker, 'transactions'>, potId: string, today: string = localDate()): number {
  const key = `pot:${potId}`
  return heldPurchases(tracker, today).filter(row => row.open && row.outPence > 0).reduce((sum, row) => sum + (row.byDestination.find(part => destinationKey(part.destination) === key)?.outPence ?? 0), 0)
}

/** The tracker without one refund: what a purchase had out before that refund was linked (for relinking it). */
const without = (tracker: Pick<CardTracker, 'transactions'>, refundId: string) => ({ transactions: tracker.transactions.filter(row => row.id !== refundId) })

/**
 * Orders a refund could be the return for (health 9b): purchases with something still expected back, dated on or before
 * it. The same shop first, then the rest, newest first within each. The refund itself never counts against them.
 */
export function ordersWithReturns(tracker: Pick<CardTracker, 'transactions'>, refund: Pick<CardTransaction, 'id' | 'date' | 'merchant'>, today: string = localDate()): HeldPurchase[] {
  return expectingBack(without(tracker, refund.id), today).filter(row => row.purchase.date <= refund.date)
    .sort((a, b) => Number(b.purchase.merchant === refund.merchant) - Number(a.purchase.merchant === refund.merchant) || b.purchase.date.localeCompare(a.purchase.date))
}

/**
 * A linked refund's lines: against the order's items still out, in line order (marked `expectingBack`, with the item's
 * name), and anything over what's out goes back to the order's biggest kept line as an ordinary refund.
 */
export function linkLines(tracker: Pick<CardTracker, 'transactions'>, purchase: CardTransaction, refund: Pick<CardTransaction, 'id' | 'amountPence'>): SplitLine[] {
  const held = heldPurchase(without(tracker, refund.id), purchase, '')
  if (!held) return [{ amountPence: refund.amountPence, destination: purchase.sort?.lines[0]?.destination ?? { kind: 'account', accountId: '' } }]
  let left = -refund.amountPence
  const out = new Map(held.byDestination.map(row => [destinationKey(row.destination), row.outPence]))
  // Items earlier refunds already covered, by name and pot, so the next refund names the item still out.
  const itemKey = (line: SplitLine) => `${destinationKey(line.destination)}|${line.item ?? ''}`
  const covered = new Map<string, number>()
  for (const row of tracker.transactions) if (row.id !== refund.id && row.kind === 'refund' && row.refundOf?.transactionId === purchase.id) for (const line of refundHeldLines(row)) covered.set(itemKey(line), (covered.get(itemKey(line)) ?? 0) - line.amountPence)
  const lines: SplitLine[] = []
  for (const { line } of held.lines) {
    const key = destinationKey(line.destination)
    const already = Math.min(line.amountPence, covered.get(itemKey(line)) ?? 0)
    covered.set(itemKey(line), (covered.get(itemKey(line)) ?? 0) - already)
    const take = Math.min(left, out.get(key) ?? 0, line.amountPence - already)
    if (take <= 0) continue
    out.set(key, out.get(key)! - take)
    left -= take
    lines.push({ amountPence: -take, destination: line.destination, expectingBack: true, ...line.item ? { item: line.item } : {} })
  }
  if (left > 0) {
    const kept = (purchase.sort?.lines ?? []).filter(line => !line.expectingBack).sort((a, b) => b.amountPence - a.amountPence)[0] ?? held.lines[0]!.line
    lines.push({ amountPence: -left, destination: kept.destination })
  }
  return lines
}

/**
 * Link a refund to the order it's the return for (health 9b). `everything`: That's everything back, so the order is
 * settled and any difference counts as spending. Otherwise what's still out stays expecting back (More to come).
 */
export function linkRefund<T extends Pick<BudgetDocument, 'card'>>(document: T, refundId: string, purchaseId: string, everything: boolean, now: Date): T {
  const tracker = cardTracker(document)
  const refund = tracker.transactions.find(row => row.id === refundId), purchase = tracker.transactions.find(row => row.id === purchaseId)
  if (!refund || refund.kind !== 'refund' || !purchase || purchase.kind !== 'purchase' || !purchase.sort) return document
  const at = now.toISOString()
  const lines = linkLines(tracker, purchase, refund)
  const firstReturn = purchase.sort.lines.findIndex(isReturn)
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => {
    if (row.id === refundId) return { ...row, refundOf: { transactionId: purchaseId, ...firstReturn >= 0 ? { lineIndex: firstReturn } : {} }, sort: { lines, by: 'person' as const, at } }
    if (row.id === purchaseId && everything && row.sort) return { ...row, sort: { ...row.sort, lines: row.sort.lines.map(line => isHeld(line) ? { ...line, notComingBackAt: at } : line) } }
    return row
  }) } }
}

/** The order a refund is linked to as its return: a purchase with items ticked Back, and the refund marked against them. */
export function linkedOrder(tracker: Pick<CardTracker, 'transactions'>, refund: CardTransaction): CardTransaction | undefined {
  if (refund.kind !== 'refund' || !refund.refundOf || !refund.sort?.lines.some(line => line.expectingBack)) return undefined
  return tracker.transactions.find(row => row.id === refund.refundOf!.transactionId)
}

/** Put transactions back as they were (Undo for a link). */
export function restoreTransactions<T extends Pick<BudgetDocument, 'card'>>(document: T, rows: readonly CardTransaction[]): T {
  const tracker = cardTracker(document)
  const byId = new Map(rows.map(row => [row.id, row]))
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => byId.get(row.id) ?? row) } }
}

/** "Not coming back" (P7): the purchase's held lines count as spending from now. */
export function notComingBack<T extends Pick<BudgetDocument, 'card'>>(document: T, purchaseId: string, now: Date): T {
  const tracker = cardTracker(document)
  const at = now.toISOString()
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => row.id === purchaseId && row.sort ? { ...row, sort: { ...row.sort, lines: row.sort.lines.map(line => isHeld(line) ? { ...line, notComingBackAt: at } : line) } } : row) } }
}

/** Undo "Not coming back": the lines marked at `at` are expected back again. */
export function comingBackAgain<T extends Pick<BudgetDocument, 'card'>>(document: T, purchaseId: string, at: string): T {
  const tracker = cardTracker(document)
  const restore = (line: SplitLine) => { if (line.notComingBackAt !== at) return line; const next = { ...line }; delete next.notComingBackAt; return next }
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => row.id === purchaseId && row.sort ? { ...row, sort: { ...row.sort, lines: row.sort.lines.map(restore) } } : row) } }
}
