import type { BudgetDocument } from './budgetDocument'
import { cardTracker, destinationKey, localDate, parseStatementKey, type CardAccount, type CardTracker, type CardTransaction, type Front, type MovedLine, type SetAsideMove } from './cardTracker'
import { shareSteps, type SettleAccount, type SettleStep } from './cardStatements'
import { frontedRows, paidBackBy, paysBack } from './fronts'
import type { BudgetDestination } from './monthlyBudget'
import { heldOut, type DestinationTotals } from './expectingBack'

/**
 * Setting money aside in the card's pot (the Amex pot in Monzo) as you review, rather than once per statement.
 * Each "Move to the Amex pot" records, per transaction, what moved out of each pot or account. A transaction
 * re-sorted after it was moved shows the difference as its next move. Rules: docs/card-tracker-rules.md.
 */

/** Does this statement get paid from the card's set-aside pot? Statements before `fromCloseDate` settle once (§6.8). */
export function usesSetAside(card: Pick<CardAccount, 'setAside'> | undefined, statementKey: string): boolean {
  const closeDate = parseStatementKey(statementKey)?.closeDate
  return !!card?.setAside && !!closeDate && closeDate >= card.setAside.fromCloseDate
}

type Totals = Map<string, { destination: BudgetDestination; pence: number }>
const add = (totals: Totals, destination: BudgetDestination, pence: number) => {
  const key = destinationKey(destination)
  const row = totals.get(key) ?? { destination, pence: 0 }
  row.pence += pence
  totals.set(key, row)
}

/** What has moved for each transaction so far, by destination. */
export function movedByTransaction(tracker: Pick<CardTracker, 'moves'>): Map<string, Totals> {
  const moved = new Map<string, Totals>()
  for (const move of tracker.moves ?? []) for (const row of move.transactions) {
    const totals = moved.get(row.transactionId) ?? new Map()
    for (const line of row.lines) add(totals, line.destination, line.amountPence)
    moved.set(row.transactionId, totals)
  }
  return moved
}

/**
 * What still has to move for a transaction: its lines now, less what's held as expecting back (`heldOut`, D11), less
 * what has moved, by destination. An unsorted transaction waits until it's sorted (nothing to move yet), and payments
 * never move.
 */
export function pendingLines(transaction: CardTransaction, moved: Totals | undefined, held?: DestinationTotals): MovedLine[] {
  if (transaction.kind === 'payment' || !transaction.sort) return []
  const totals: Totals = new Map()
  for (const line of transaction.sort.lines) add(totals, line.destination, line.amountPence)
  for (const row of held?.values() ?? []) add(totals, row.destination, -row.pence)
  for (const row of moved?.values() ?? []) add(totals, row.destination, -row.pence)
  return [...totals.values()].filter(row => row.pence !== 0).map(row => ({ destination: row.destination, amountPence: row.pence }))
}

export type MoveState = 'not-moved' | 'moved' | 'changed'
/** "Moved to the Amex pot", or "Changed since moved" when it was re-sorted or split after moving. */
export function moveState(transaction: CardTransaction, moved: Totals | undefined, held?: DestinationTotals): MoveState {
  if (!moved?.size) return 'not-moved'
  if (!transaction.sort) return [...moved.values()].some(row => row.pence !== 0) ? 'changed' : 'not-moved'
  return pendingLines(transaction, moved, held).length ? 'changed' : 'moved'
}

export type ToMoveRow = {
  transaction: CardTransaction
  /** What moves now: all its lines, or the change since it was last moved. */
  lines: MovedLine[]
  pence: number
  changed: boolean
  /** Covered by the buffer when its bill was paid (W11): its money pays the Front's source back, not the Amex pot. */
  front?: Front
}

/**
 * Transactions with money still to move to the card's set-aside pot, newest first: sorted purchases and refunds
 * on statements paid from the pot, optionally on one statement. Held money waits for its bill to close (D11).
 */
export function toMove(document: Pick<BudgetDocument, 'card'>, cardId: string, statementKey?: string, today: string = localDate()): ToMoveRow[] {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  if (!card?.setAside) return []
  const moved = movedByTransaction(tracker)
  const held = heldOut(tracker, today)
  const fronted = frontedRows(tracker)
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  return tracker.transactions
    .filter(row => row.cardId === cardId && (!statementKey || row.statementKey === statementKey) && usesSetAside(card, row.statementKey))
    .map(transaction => {
      const lines = pendingLines(transaction, moved.get(transaction.id), held.get(transaction.id))
      const front = fronted.get(transaction.id)
      return { transaction, lines, pence: lines.reduce((sum, line) => sum + line.amountPence, 0), changed: !!moved.get(transaction.id)?.size, ...front ? { front } : {} }
    })
    .filter(row => row.lines.length > 0)
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date) || order.get(a.transaction.id)! - order.get(b.transaction.id)!)
}

/** Paying a Front's source back (W11): what moves to it, for which bills, and the steps after the money is gathered. */
export type PayBack = {
  source: BudgetDestination
  pence: number
  /** The bills it pays back for, oldest first. */
  statementKeys: string[]
  /**
   * From the set-aside pot's account: nothing when the source is that account's main balance (the money stays there),
   * Into a source pot there, or Send to another account (then Into its pot).
   */
  steps: SettleStep[]
}

export type MovePlan = {
  /** Out of each pot, then Send to the pot's account, as settle-up does (`shareSteps`). */
  accounts: SettleAccount[]
  potId: string
  /** The set-aside pot's account. */
  accountId: string
  /** Into the set-aside pot; negative when refunds outweigh spend and money comes out of it. Pay-backs are left out. */
  totalPence: number
  /** Rows the buffer covered at Pay, now sorted: their money goes back to the Front's source, one entry per source. */
  payBack: PayBack[]
  /** Σ pay-backs. */
  payBackPence: number
}

/** The steps that take a pay-back from the set-aside pot's account to its source. */
function payBackSteps(document: Pick<BudgetDocument, 'budget'>, source: BudgetDestination, pence: number, hubAccountId: string): SettleStep[] {
  const accountId = source.kind === 'account' ? source.accountId : document.budget.pots.find(pot => pot.id === source.potId)?.accountId
  if (!accountId || pence === 0) return []
  const steps: SettleStep[] = []
  if (accountId !== hubAccountId) steps.push(pence > 0 ? { key: `pay-back:send:${accountId}`, kind: 'send', accountId, amountPence: pence } : { key: `pay-back:return:${accountId}`, kind: 'return', accountId, amountPence: -pence })
  if (source.kind === 'pot') steps.push(pence > 0 ? { key: `pay-back:into:${source.potId}`, kind: 'into', accountId, potId: source.potId, amountPence: pence } : { key: `pay-back:out:${source.potId}`, kind: 'out', accountId, potId: source.potId, amountPence: -pence })
  return pence < 0 ? steps.reverse() : steps
}

/**
 * The steps for moving these rows' money to the card's set-aside pot. Lines sorted to that pot itself need no step.
 * Rows the buffer covered at Pay (W11) are gathered the same way, then go to the Front's source instead of the pot; their
 * lines already at the source need no step.
 */
export function moveSteps(document: Pick<BudgetDocument, 'budget' | 'card' | 'household'>, cardId: string, rows: readonly ToMoveRow[]): MovePlan | null {
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = card?.setAside && document.budget.pots.find(row => row.id === card.setAside!.potId)
  if (!pot) return null
  const shares: Totals = new Map()
  const intoPot: Totals = new Map()
  const payBacks = new Map<string, { source: BudgetDestination; pence: number; statementKeys: Set<string> }>()
  for (const row of rows) for (const line of row.lines) {
    if (row.front ? !paysBack(row.front, line.destination, pot.id) : line.destination.kind === 'pot' && line.destination.potId === pot.id) continue
    add(shares, line.destination, line.amountPence)
    if (!row.front) { add(intoPot, line.destination, line.amountPence); continue }
    const key = destinationKey(row.front.source)
    const payBack = payBacks.get(key) ?? { source: row.front.source, pence: 0, statementKeys: new Set() }
    payBack.pence += line.amountPence
    payBack.statementKeys.add(row.front.statementKey)
    payBacks.set(key, payBack)
  }
  const accounts = shareSteps(document, shares.values(), pot.accountId)
  const payBack = [...payBacks.values()].filter(row => row.pence !== 0).map(row => ({ source: row.source, pence: row.pence, statementKeys: [...row.statementKeys].sort(), steps: payBackSteps(document, row.source, row.pence, pot.accountId) }))
  return { accounts, potId: pot.id, accountId: pot.accountId, totalPence: [...intoPot.values()].reduce((sum, row) => sum + row.pence, 0), payBack, payBackPence: payBack.reduce((sum, row) => sum + row.pence, 0) }
}

/** "Moved": record what these transactions still had to move, at `now`. Transactions with nothing to move are skipped. */
export function recordMove<T extends Pick<BudgetDocument, 'card'>>(document: T, cardId: string, transactionIds: readonly string[], now: Date, id: string): T {
  const tracker = cardTracker(document)
  const wanted = new Set(transactionIds)
  const rows = toMove(document, cardId, undefined, localDate(now)).filter(row => wanted.has(row.transaction.id))
  if (!rows.length) return document
  const move: SetAsideMove = { id, cardId, at: now.toISOString(), transactions: rows.map(row => ({ transactionId: row.transaction.id, lines: row.lines })) }
  return { ...document, card: { ...tracker, moves: [...tracker.moves ?? [], move] } }
}

/** Undo a move: its transactions are back to what they had moved before it. */
export function undoMove<T extends Pick<BudgetDocument, 'card'>>(document: T, moveId: string): T {
  const tracker = cardTracker(document)
  const moves = (tracker.moves ?? []).filter(move => move.id !== moveId)
  const next: CardTracker = { ...tracker, moves }
  if (!moves.length) delete next.moves
  return { ...document, card: next }
}

/**
 * Σ a move's lines: what went into the pot (negative: out of it). Lines to the set-aside pot itself are left out, and so
 * are rows paying the buffer back (W11): moved after the Pay tick that covered them, their money went to the Front's source.
 */
export function moveTotal(move: SetAsideMove, setAsidePotId?: string, tracker?: Pick<CardTracker, 'fronts'>): number {
  const fronted = tracker?.fronts?.length ? frontedRows(tracker) : undefined
  return move.transactions.filter(row => !fronted || !paidBackBy(fronted, row.transactionId, move.at)).flatMap(row => row.lines).filter(line => !(line.destination.kind === 'pot' && line.destination.potId === setAsidePotId)).reduce((sum, line) => sum + line.amountPence, 0)
}

/** "Amex pot" as a title, without doubling pot: "Amex" → "Amex pot", "Amex pot" stays. */
export const potTitle = (name: string) => /\bpot$/i.test(name.trim()) ? name.trim() : `${name.trim()} pot`

/** "the Amex pot", or "the Amex savings pot" when the name already ends in pot. */
export function potPhrase(name: string): string {
  return /\bpot$/i.test(name.trim()) ? `the ${name.trim()}` : `the ${name.trim()} pot`
}
