import type { BudgetDocument } from './budgetDocument'
import { bufferSource, cardTracker, isWaiting, parseStatementKey, sameDestination, type CardTracker, type CardTransaction, type Front } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { movedByTransaction, toMove, usesSetAside, type ToMoveRow } from './setAside'

/**
 * Covering the waiting rows at settle up (audit 6, W3, W11). A bill paid from the Amex pot can be paid while rows are
 * still waiting: the Amex pot pays what's in it, and the buffer (or another source) fronts the rest. The Pay tick records
 * a Front: each waiting row and what it still owed the Amex pot. Unticking Pay removes it (WP9).
 * Rules: docs/card-tracker-rules.md, "Settle up with rows waiting".
 */

/** A statement's Front, if its Pay tick covered waiting rows. */
export const frontOf = (tracker: Pick<CardTracker, 'fronts'>, statementKey: string): Front | undefined => tracker.fronts?.find(row => row.statementKey === statementKey)

/** Σ a Front's rows: what the source paid towards the bill. */
export const frontPence = (front: Pick<Front, 'transactions'> | undefined) => front?.transactions.reduce((sum, row) => sum + row.pence, 0) ?? 0

/** Every fronted row: transaction id → its Front. */
export function frontedRows(tracker: Pick<CardTracker, 'fronts'>): Map<string, Front> {
  const rows = new Map<string, Front>()
  for (const front of tracker.fronts ?? []) for (const row of front.transactions) rows.set(row.transactionId, front)
  return rows
}

/** The Front a move pays back for this row: the row was fronted, and the move came after the Pay tick (W11). */
export function paidBackBy(fronted: ReadonlyMap<string, Front>, transactionId: string, at: string): Front | undefined {
  const front = fronted.get(transactionId)
  return front && at > front.at ? front : undefined
}

/** Does this line pay its Front's source back with money? A line already at the source (or in the Amex pot) moves none. */
export const paysBack = (front: Pick<Front, 'source'>, destination: BudgetDestination, setAsidePotId?: string) =>
  !sameDestination(destination, front.source) && !(destination.kind === 'pot' && destination.potId === setAsidePotId)

export type PayBackLine = { front: Front; at: string; transactionId: string; destination: BudgetDestination; amountPence: number }

/**
 * Every line moved for a fronted row after its Pay tick: what has paid its Front's source back (W11). Lines already at
 * the source count as paid back, though no money moved for them.
 */
export function payBackLines(tracker: Pick<CardTracker, 'fronts' | 'moves'>): PayBackLine[] {
  if (!tracker.fronts?.length) return []
  const fronted = frontedRows(tracker)
  return (tracker.moves ?? []).flatMap(move => move.transactions.flatMap(row => {
    const front = paidBackBy(fronted, row.transactionId, move.at)
    return front ? row.lines.map(line => ({ front, at: move.at, transactionId: row.transactionId, destination: line.destination, amountPence: line.amountPence })) : []
  }))
}

/** Money paid back into a source since `after`: lines of fronted rows that moved money to it (a pot's balance, or the buffer's). */
export function paidBackInto(tracker: Pick<CardTracker, 'cards' | 'fronts' | 'moves'>, source: BudgetDestination, after?: string): Array<{ at: string; pence: number }> {
  const setAsidePot = (cardId: string) => tracker.cards.find(card => card.id === cardId)?.setAside?.potId
  return payBackLines(tracker).filter(line => (!after || line.at > after) && sameDestination(line.front.source, source) && paysBack(line.front, line.destination, setAsidePot(line.front.cardId)))
    .map(line => ({ at: line.at, pence: line.amountPence }))
}

export type FrontOwed = {
  front: Front
  /** What the Front's rows still owe its source: each row's amount on the Front, less its lines moved since Pay. */
  owedPence: number
  /** Sorted rows whose pay-back is still to move, and the money that moves (lines already at the source move none). */
  toMove: ToMoveRow[]
  toMovePence: number
  /** Rows not sorted yet (waiting, or back in To sort), and what they still owe. */
  unsorted: number
  unsortedPence: number
  /** Of those, how many are still waiting. */
  waiting: number
}

/** "Pay the buffer back" (W11): what each Front is still owed, what's ready to move now, and what waits on rows still to sort. */
export function frontsOwed(document: Pick<BudgetDocument, 'card'>, today?: string): FrontOwed[] {
  const tracker = cardTracker(document)
  if (!tracker.fronts?.length) return []
  const paid = new Map<string, number>()
  for (const line of payBackLines(tracker)) paid.set(line.transactionId, (paid.get(line.transactionId) ?? 0) + line.amountPence)
  const byId = new Map(tracker.transactions.map(row => [row.id, row]))
  return tracker.fronts.map(front => {
    const setAsidePotId = tracker.cards.find(card => card.id === front.cardId)?.setAside?.potId
    const ids = new Set(front.transactions.map(row => row.transactionId))
    const moving = toMove(document, front.cardId, front.statementKey, today).filter(row => ids.has(row.transaction.id))
    const owing = front.transactions.map(row => ({ transaction: byId.get(row.transactionId), owed: row.pence - (paid.get(row.transactionId) ?? 0) }))
    const unsorted = owing.filter(row => row.transaction && !row.transaction.sort)
    return { front, owedPence: owing.reduce((sum, row) => sum + row.owed, 0), toMove: moving,
      toMovePence: moving.flatMap(row => row.lines).filter(line => paysBack(front, line.destination, setAsidePotId)).reduce((sum, line) => sum + line.amountPence, 0),
      unsorted: unsorted.length, unsortedPence: unsorted.reduce((sum, row) => sum + row.owed, 0), waiting: unsorted.filter(row => isWaiting(row.transaction!)).length }
  }).filter(row => row.owedPence !== 0 || row.toMove.length > 0)
}

/** "Cover the waiting from": what the statement chose, else the card's buffer. Never the Amex pot. Undefined unless paid from the Amex pot. */
export function frontSourceFor(document: Pick<BudgetDocument, 'card'>, statementKey: string): BudgetDestination | undefined {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === parseStatementKey(statementKey)?.cardId)
  if (!card?.setAside || !usesSetAside(card, statementKey)) return undefined
  const chosen = tracker.statements[statementKey]?.frontSource
  return chosen && !(chosen.kind === 'pot' && chosen.potId === card.setAside.potId) ? chosen : bufferSource(card)
}

export type FrontPlan = {
  source: BudgetDestination
  /** The waiting rows on the bill, each with what it still owes the Amex pot. Rows that owe nothing are left out. */
  rows: Array<{ transaction: CardTransaction; pence: number }>
  pence: number
}

/**
 * What the buffer would cover if Pay were ticked now: each waiting row on the bill, less anything it had moved before it
 * was unsorted (the same as `billSum`'s Waiting). Null unless the bill is paid from the Amex pot and something is waiting.
 */
export function frontPlan(document: Pick<BudgetDocument, 'card'>, statementKey: string): FrontPlan | null {
  const source = frontSourceFor(document, statementKey)
  if (!source) return null
  const tracker = cardTracker(document)
  const moved = movedByTransaction(tracker)
  const rows = tracker.transactions.filter(row => row.statementKey === statementKey && row.kind !== 'payment' && !row.sort && isWaiting(row))
    .map(transaction => ({ transaction, pence: transaction.amountPence - [...moved.get(transaction.id)?.values() ?? []].reduce((sum, row) => sum + row.pence, 0) }))
    .filter(row => row.pence !== 0)
  return rows.length ? { source, rows, pence: rows.reduce((sum, row) => sum + row.pence, 0) } : null
}

const withFronts = <T extends Pick<BudgetDocument, 'card'>>(document: T, fronts: Front[]): T => {
  const tracker = cardTracker(document)
  const next: CardTracker = { ...tracker, fronts }
  if (!fronts.length) delete next.fronts
  return { ...document, card: next }
}

/** Pay ticked: record what the source covers now, replacing the statement's Front if it had one. Nothing waiting: no Front. */
export function recordFront<T extends Pick<BudgetDocument, 'card'>>(document: T, statementKey: string, now: Date): T {
  const tracker = cardTracker(document)
  const plan = frontPlan(document, statementKey)
  const others = (tracker.fronts ?? []).filter(row => row.statementKey !== statementKey)
  if (!plan) return tracker.fronts?.some(row => row.statementKey === statementKey) ? withFronts(document, others) : document
  const front: Front = { id: `front:${statementKey}`, cardId: parseStatementKey(statementKey)!.cardId, statementKey, at: now.toISOString(), source: plan.source,
    transactions: plan.rows.map(row => ({ transactionId: row.transaction.id, pence: row.pence })) }
  return withFronts(document, [...others, front])
}

/** Pay unticked (WP9): the Front goes, and its rows owe the Amex pot again. */
export function removeFront<T extends Pick<BudgetDocument, 'card'>>(document: T, statementKey: string): T {
  const tracker = cardTracker(document)
  return tracker.fronts?.some(row => row.statementKey === statementKey) ? withFronts(document, tracker.fronts.filter(row => row.statementKey !== statementKey)) : document
}

/** Choose where the waiting is covered from, before Pay. The buffer is the default, so choosing it clears the choice. */
export function setFrontSource<T extends Pick<BudgetDocument, 'card'>>(document: T, statementKey: string, source: BudgetDestination): T {
  const tracker = cardTracker(document)
  const parsed = parseStatementKey(statementKey)
  const card = tracker.cards.find(row => row.id === parsed?.cardId)
  if (!parsed || !card?.setAside || source.kind === 'pot' && source.potId === card.setAside.potId) return document
  const record = { ...tracker.statements[statementKey] ?? { cardId: parsed.cardId, closeDate: parsed.closeDate } }
  if (sameDestination(source, bufferSource(card))) delete record.frontSource
  else record.frontSource = source
  return { ...document, card: { ...tracker, statements: { ...tracker.statements, [statementKey]: record } } }
}
