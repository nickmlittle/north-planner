import type { BudgetDocument } from './budgetDocument'
import { cardTracker, destinationKey, localDate, parseStatementKey, type CardTracker, type CardTransaction, type SplitLine } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'

/**
 * Expecting back (month-health plan D11, P7). A receipt item ticked **Back** is a return on its way:
 * - **Held** while its bill is open: not spent, not moved to the Amex pot. It's the bill's fifth part.
 * - A refund for the purchase is matched to its held lines first. On the same bill the two cancel out: neither is spent
 *   nor moved, ever. A partial refund leaves the rest held.
 * - **Settle up:** once the bill has closed, whatever is still held has to be paid, so it counts as spending (in the
 *   purchase's month) and moves with the rest. A refund that lands later is an ordinary refund: it moves back out of
 *   the Amex pot, and it clears the purchase from the Expecting back list.
 * - **Not coming back:** the held lines count as spending from then on.
 * Rules: docs/card-tracker-rules.md, "Expecting back".
 */

export type DestinationTotals = Map<string, { destination: BudgetDestination; pence: number }>
/** Per transaction id, by destination: the part of its lines left out of spending and moves today (signed like the lines). */
export type Held = Map<string, DestinationTotals>

/** A purchase line that's still expected back (ticked Back, not marked Not coming back). */
export const isHeld = (line: SplitLine) => !!line.expectingBack && !line.notComingBackAt

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
  /** When the items were ticked Back (the sort's time). */
  markedAt: string
  byDestination: Array<{ destination: BudgetDestination; heldPence: number; backPence: number; outPence: number; cancelledPence: number }>
}

/** A refund's lines that refund held lines of its purchase. */
const refundHeldLines = (refund: CardTransaction) => (refund.sort?.lines ?? []).filter(line => line.expectingBack)

function heldPurchase(tracker: Pick<CardTracker, 'transactions'>, purchase: CardTransaction, today: string): HeldPurchase | null {
  if (purchase.kind !== 'purchase' || !purchase.sort) return null
  const lines = purchase.sort.lines.flatMap((line, index) => isHeld(line) ? [{ index, line }] : [])
  if (!lines.length) return null
  const held: DestinationTotals = new Map(), back: DestinationTotals = new Map(), cancelled: DestinationTotals = new Map()
  for (const { line } of lines) add(held, line.destination, line.amountPence)
  for (const refund of tracker.transactions) if (refund.kind === 'refund' && refund.refundOf?.transactionId === purchase.id) for (const line of refundHeldLines(refund)) {
    add(back, line.destination, -line.amountPence)
    // On the same bill, the refund cancels the held money: it never moves.
    if (refund.statementKey === purchase.statementKey) add(cancelled, line.destination, -line.amountPence)
  }
  const byDestination = [...held.entries()].map(([key, row]) => {
    const backPence = Math.min(row.pence, back.get(key)?.pence ?? 0)
    return { destination: row.destination, heldPence: row.pence, backPence, outPence: row.pence - backPence, cancelledPence: Math.min(row.pence, cancelled.get(key)?.pence ?? 0) }
  })
  const heldPence = byDestination.reduce((sum, row) => sum + row.heldPence, 0), backPence = byDestination.reduce((sum, row) => sum + row.backPence, 0)
  return { purchase, lines, heldPence, backPence, outPence: heldPence - backPence, open: billOpen(purchase, today), markedAt: purchase.sort.at, byDestination }
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
    for (const row of held.byDestination) add(totals(held.purchase.id), row.destination, held.open ? row.heldPence : row.cancelledPence)
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
  return heldPurchases(tracker, today).filter(row => row.open).reduce((sum, row) => sum + (row.byDestination.find(part => destinationKey(part.destination) === key)?.outPence ?? 0), 0)
}

/**
 * A refund for a purchase with money still expected back: its lines go to the held lines first (marked
 * `expectingBack`), in the purchase's line order; anything over goes to the purchase's biggest kept line. Null when
 * nothing is expected back.
 */
export function heldRefundLines(tracker: Pick<CardTracker, 'transactions'>, purchase: CardTransaction, refund: Pick<CardTransaction, 'amountPence'>): { lines: SplitLine[]; lineIndex: number } | null {
  const held = heldPurchase(tracker, purchase, '')
  if (!held || held.outPence <= 0) return null
  let left = -refund.amountPence
  const out = new Map(held.byDestination.map(row => [destinationKey(row.destination), row.outPence]))
  const lines: SplitLine[] = []
  let lineIndex = -1
  for (const { index, line } of held.lines) {
    const key = destinationKey(line.destination)
    const take = Math.min(left, out.get(key) ?? 0, line.amountPence)
    if (take <= 0) continue
    out.set(key, out.get(key)! - take)
    left -= take
    if (lineIndex < 0) lineIndex = index
    lines.push({ amountPence: -take, destination: line.destination, expectingBack: true, ...line.item ? { item: line.item } : {} })
  }
  if (!lines.length) return null
  if (left > 0) {
    const kept = (purchase.sort?.lines ?? []).filter(line => !line.expectingBack).sort((a, b) => b.amountPence - a.amountPence)[0] ?? held.lines[0]!.line
    lines.push({ amountPence: -left, destination: kept.destination })
  }
  return { lines, lineIndex }
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
