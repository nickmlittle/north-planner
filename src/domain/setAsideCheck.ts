import type { BudgetDocument } from './budgetDocument'
import { bufferSource, cardTracker, localDate, parseStatementKey, type CardAccount, type CardTracker, type GapMove, type SetAsideMove } from './cardTracker'
import { SETTLE_PAY_KEY, settleIntoKey, shareSteps, statementTransactions, type SettleStep } from './cardStatements'
import type { BudgetDestination } from './monthlyBudget'
import { potBalance } from './potBalances'
import { toMove, usesSetAside } from './setAside'
import { frontPlan } from './fronts'

/**
 * Checking the Amex pot: what the card's set-aside pot should hold against what it holds.
 * - Should hold = what has moved in for the statements paid from the pot that aren't paid yet (no Pay tick). It is
 *   worked out from the moves alone, never from a balance check, so extra money can't hide in a checked balance.
 * - Holds = the pot's balance (`potBalance`): the last check plus every move and payment since.
 * Moves and payments shift both together, so the gap only opens with something North doesn't know about: a transfer
 * that wasn't made, a rounded-up one, money moved early, a fee. Extra goes to the card's buffer; a top-up comes from it.
 * Rules: docs/card-tracker-rules.md, "Checking the Amex pot".
 */

export type SetAsideState = 'unchecked' | 'matches' | 'extra' | 'short'

export type SetAsideCheck = {
  cardId: string
  potId: string
  shouldHoldPence: number
  /** The pot's balance; absent until it has been checked against the bank. */
  holdsPence?: number
  /** Holds − Should hold: extra when positive, short when negative. Absent until checked. */
  gapPence?: number
  state: SetAsideState
  checkedAt?: string
  /** Sorted and not moved yet: the Move sheet's total, and how many transactions. */
  toMovePence: number
  toMove: number
  /** Closed statements paid from the pot, with money moved in but no Pay tick: paid but not ticked reads as short. */
  unpaidClosed: Array<{ statementKey: string; closeDate: string }>
  /** The card's last moves (up to `RECENT_MOVES`), newest first: where to look when it's short. */
  recentMoves: SetAsideMove[]
}

export const RECENT_MOVES = 5

const unpaid = (tracker: Pick<CardTracker, 'statements'>, statementKey: string) => !tracker.statements[statementKey]?.ticks?.[SETTLE_PAY_KEY]

/** What has moved in for each of the card's statements: Σ every moved line, lines sorted to the pot itself included. */
function movedByStatement(tracker: CardTracker, cardId: string): Map<string, number> {
  const statementOf = new Map(tracker.transactions.map(row => [row.id, row.statementKey]))
  const moved = new Map<string, number>()
  for (const move of tracker.moves ?? []) if (move.cardId === cardId) for (const row of move.transactions) {
    const key = statementOf.get(row.transactionId)
    if (key) moved.set(key, (moved.get(key) ?? 0) + row.lines.reduce((sum, line) => sum + line.amountPence, 0))
  }
  return moved
}

/** The unpaid statements paid from the pot, with what has moved in for each. */
function unpaidMoved(tracker: CardTracker, card: CardAccount): Array<[string, number]> {
  return [...movedByStatement(tracker, card.id)].filter(([key, pence]) => pence !== 0 && usesSetAside(card, key) && unpaid(tracker, key))
}

/** Should hold: what has moved into the card's set-aside pot for statements not paid yet. 0 without a set-aside pot. */
export function shouldHold(document: Pick<BudgetDocument, 'card'>, cardId: string): number {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  return card?.setAside ? unpaidMoved(tracker, card).reduce((sum, [, pence]) => sum + pence, 0) : 0
}

/** The Amex pot's check: Should hold against Holds, and what helps explain a gap. Null without a set-aside pot. */
export function setAsideCheck(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, cardId: string, today: string = localDate()): SetAsideCheck | null {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  if (!card?.setAside || !document.budget.pots.some(pot => pot.id === card.setAside!.potId)) return null
  const potId = card.setAside.potId
  const balance = potBalance(document, potId, today)
  const unpaidRows = unpaidMoved(tracker, card)
  const shouldHoldPence = unpaidRows.reduce((sum, [, pence]) => sum + pence, 0)
  const holdsPence = balance.balancePence
  const gapPence = holdsPence === undefined ? undefined : holdsPence - shouldHoldPence
  const state: SetAsideState = gapPence === undefined ? 'unchecked' : gapPence === 0 ? 'matches' : gapPence > 0 ? 'extra' : 'short'
  const rows = toMove(document, cardId, undefined, today)
  const unpaidClosed = unpaidRows.map(([statementKey]) => ({ statementKey, closeDate: parseStatementKey(statementKey)?.closeDate ?? '' }))
    .filter(row => row.closeDate && row.closeDate < today).sort((a, b) => a.closeDate.localeCompare(b.closeDate))
  const recentMoves = (tracker.moves ?? []).filter(move => move.cardId === cardId).slice(-RECENT_MOVES).reverse()
  return {
    cardId, potId, shouldHoldPence, ...holdsPence === undefined ? {} : { holdsPence, gapPence, checkedAt: balance.checked!.at }, state,
    toMovePence: rows.reduce((sum, row) => sum + row.pence, 0), toMove: rows.length, unpaidClosed, recentMoves,
  }
}

/**
 * Where extra goes, and where a top-up comes from: the card's buffer (Buffer for overspends), else the main balance of
 * the account the card is paid from. Never the set-aside pot itself.
 */
export const gapDestination = (card: Pick<CardAccount, 'bufferDestination' | 'payFromAccountId' | 'setAside'>): BudgetDestination => bufferSource(card)

export type GapPlan = {
  /** Extra: Out of the Amex pot, Send to the buffer's account (another account), Into the buffer pot (a pot). A top-up runs the other way. */
  steps: SettleStep[]
  /** Where a Send step sends to. */
  toAccountId: string
  destination: BudgetDestination
  /** + extra out of the pot, − a top-up into it. */
  pence: number
}

/** The banking steps for moving `pence` of extra out of the card's set-aside pot to its buffer (or, negative, topping it up from it). */
export function gapSteps(document: Pick<BudgetDocument, 'budget' | 'card' | 'household'>, cardId: string, pence: number): GapPlan | null {
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = card?.setAside && document.budget.pots.find(row => row.id === card.setAside!.potId)
  if (!card || !pot || !pence) return null
  const destination = gapDestination(card)
  const destinationAccountId = destination.kind === 'account' ? destination.accountId : document.budget.pots.find(row => row.id === destination.potId)?.accountId
  if (!destinationAccountId) return null
  const amount = Math.abs(pence)
  if (pence > 0) {
    const steps = shareSteps(document, [{ destination: { kind: 'pot', potId: pot.id }, pence: amount }], destinationAccountId).flatMap(account => account.steps)
    if (destination.kind === 'pot') steps.push({ key: settleIntoKey(destination.potId), kind: 'into', accountId: destinationAccountId, potId: destination.potId, amountPence: amount })
    return { steps, toAccountId: destinationAccountId, destination, pence }
  }
  const steps = shareSteps(document, [{ destination, pence: amount }], pot.accountId).flatMap(account => account.steps)
  steps.push({ key: settleIntoKey(pot.id), kind: 'into', accountId: pot.accountId, potId: pot.id, amountPence: amount })
  return { steps, toAccountId: pot.accountId, destination, pence }
}

/** "Moved £42.10 to Monzo Joint" (or a top-up, negative): record it, to the card's buffer as it is now. */
export function recordGapMove<T extends Pick<BudgetDocument, 'card'>>(document: T, cardId: string, pence: number, now: Date, id: string): T {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  if (!card?.setAside || !Number.isSafeInteger(pence) || !pence) return document
  const gap: GapMove = { id, cardId, at: now.toISOString(), pence, destination: gapDestination(card) }
  return { ...document, card: { ...tracker, gapMoves: [...tracker.gapMoves ?? [], gap] } }
}

/** Undo a recorded extra or top-up. */
export function undoGapMove<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string): T {
  const tracker = cardTracker(document)
  const gapMoves = (tracker.gapMoves ?? []).filter(row => row.id !== id)
  const next: CardTracker = { ...tracker, gapMoves }
  if (!gapMoves.length) delete next.gapMoves
  return { ...document, card: next }
}

export type BillCover = {
  /** The statement's purchases and refunds. */
  billPence: number
  /** What the buffer will cover for rows still waiting (audit 6, W11): the Amex pot doesn't pay that part. */
  waitingPence: number
  /** Holds, less what has moved in for the card's other unpaid statements. */
  availablePence: number
  /** Available − (bill − waiting): to spare when positive, short when negative. */
  coverPence: number
}

/**
 * Does the Amex pot cover this statement's bill, less what the buffer covers for rows waiting? Money moved in for other
 * unpaid statements (the next one, say) doesn't count towards it. Null unless the statement is paid from the pot, isn't paid yet, and the pot is checked.
 */
export function billCover(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, statementKey: string, today: string = localDate()): BillCover | null {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === parseStatementKey(statementKey)?.cardId)
  if (!card?.setAside || !usesSetAside(card, statementKey) || !unpaid(tracker, statementKey)) return null
  const holds = potBalance(document, card.setAside.potId, today).balancePence
  if (holds === undefined) return null
  const others = unpaidMoved(tracker, card).filter(([key]) => key !== statementKey).reduce((sum, [, pence]) => sum + pence, 0)
  const billPence = statementTransactions(tracker, statementKey).filter(row => row.kind !== 'payment').reduce((sum, row) => sum + row.amountPence, 0)
  const availablePence = holds - others
  const waitingPence = frontPlan(document, statementKey)?.pence ?? 0
  return { billPence, waitingPence, availablePence, coverPence: availablePence - (billPence - waitingPence) }
}
