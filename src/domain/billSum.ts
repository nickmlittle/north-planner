import type { BudgetDocument } from './budgetDocument'
import { cardTracker, closeDateFor, isWaiting, localDate, parseStatementKey, statementKey as keyOf, type CardAccount, type CardTracker } from './cardTracker'
import { SETTLE_PAY_KEY, statementTransactions } from './cardStatements'
import { potBalance } from './potBalances'
import { movedByTransaction, toMove, usesSetAside } from './setAside'
import { setAsideCheck } from './setAsideCheck'
import { heldOut, heldPence } from './expectingBack'

/**
 * One sum per bill (month-health plan D1, D11; audit 6 W1): Bill = In the Amex pot + To move + To sort + Expecting back + Waiting.
 * - In the Amex pot: what has moved in for the bill's purchases and refunds (lines sorted to the pot itself count).
 * - To move: sorted, not moved yet (`toMove`).
 * - To sort: purchases and refunds not sorted yet and not waiting, less anything they had moved before they were unsorted.
 * - Waiting: rows parked in Waiting, worked out the same way as To sort.
 * - Expecting back: held returns, not refunded yet, while the bill is open (`heldOut`). Closed, they're To move.
 * The parts add up to the bill by construction. Only for statements paid from the card's set-aside pot.
 * Rules: docs/card-tracker-rules.md, "Bill and pot sums".
 */

/**
 * How In the Amex pot is known. **Checked** only after a real check made after the last move, with nothing extra or
 * short: the screens say "Matches Monzo". Otherwise it's **worked out** from the moves.
 */
export type BillKnown = 'worked-out' | 'checked'

export type BillSum = {
  statementKey: string
  cardId: string
  closeDate: string
  /** Today ≤ the close date: "November bill so far". */
  open: boolean
  /** Its Pay tick is in. */
  paid: boolean
  inPotPence: number
  toMovePence: number
  /** Sorted transactions with something to move. */
  toMove: number
  toSortPence: number
  toSort: number
  /** Rows in Waiting, less anything they had moved before they were unsorted. */
  waitingPence: number
  waiting: number
  /** Held returns (D11), less refunds on the same bill. Once the bill has closed they're part of To move. */
  expectingBackPence: number
  /** Σ purchases and refunds. */
  billPence: number
  /** Closed, and all of it is in the Amex pot, with nothing to sort or waiting: "covered" until the Pay tick. */
  covered: boolean
  known: BillKnown
}

const unpaid = (tracker: Pick<CardTracker, 'statements'>, key: string) => !tracker.statements[key]?.ticks?.[SETTLE_PAY_KEY]

/** "Checked" once the Amex pot was checked after its last move and matched; else "worked out". */
export function amexPotKnown(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, cardId: string, today: string = localDate()): BillKnown {
  const check = setAsideCheck(document, cardId, today)
  if (!check || check.state !== 'matches') return 'worked-out'
  return potBalance(document, check.potId, today).since.length === 0 ? 'checked' : 'worked-out'
}

/** A bill's sum. Null unless the statement is paid from the card's set-aside pot. */
export function billSum(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, statementKey: string, today: string = localDate()): BillSum | null {
  const tracker = cardTracker(document)
  const parsed = parseStatementKey(statementKey)
  const card = tracker.cards.find(row => row.id === parsed?.cardId)
  if (!parsed || !card?.setAside || !usesSetAside(card, statementKey)) return null
  const moved = movedByTransaction(tracker)
  const movedFor = (id: string) => [...moved.get(id)?.values() ?? []].reduce((sum, row) => sum + row.pence, 0)
  const rows = statementTransactions(tracker, statementKey).filter(row => row.kind !== 'payment')
  const billPence = rows.reduce((sum, row) => sum + row.amountPence, 0)
  const inPotPence = rows.reduce((sum, row) => sum + movedFor(row.id), 0)
  const moving = toMove(document, card.id, statementKey, today)
  const sorted = rows.filter(row => row.sort)
  const expectingBackPence = heldPence(heldOut(tracker, today), sorted)
  const toMovePence = moving.reduce((sum, row) => sum + row.pence, 0)
  const unsorted = rows.filter(row => !row.sort)
  const owed = (list: typeof rows) => list.reduce((sum, row) => sum + row.amountPence - movedFor(row.id), 0)
  const waiting = unsorted.filter(isWaiting), toSort = unsorted.filter(row => !isWaiting(row))
  const open = today <= parsed.closeDate
  return {
    statementKey, cardId: card.id, closeDate: parsed.closeDate, open, paid: !unpaid(tracker, statementKey),
    inPotPence, toMovePence, toMove: moving.length, toSortPence: owed(toSort), toSort: toSort.length, waitingPence: owed(waiting), waiting: waiting.length, expectingBackPence, billPence,
    covered: !open && moving.length === 0 && unsorted.length === 0, known: amexPotKnown(document, card.id, today),
  }
}

/** The card North pays from a pot (the Amex), if any. */
export const potCard = (document: Pick<BudgetDocument, 'card'>): CardAccount | undefined => cardTracker(document).cards.find(card => card.setAside)

/**
 * The bills the Amex pot is paying, oldest first: every statement paid from it with no Pay tick that has
 * something on it, then the open one (even when empty).
 */
export function potBills(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, cardId: string, today: string = localDate()): BillSum[] {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  if (!card?.setAside) return []
  const openKey = keyOf(card.id, closeDateFor(today, card.closeDay))
  const keys = new Set([...tracker.transactions.filter(row => row.cardId === cardId).map(row => row.statementKey), ...Object.keys(tracker.statements).filter(key => tracker.statements[key]!.cardId === cardId), openKey])
  return [...keys].sort().flatMap(key => {
    const sum = billSum(document, key, today)
    if (!sum || sum.paid) return []
    // A closed bill with nothing on it and nothing in the pot isn't one to pay.
    return key === openKey || sum.billPence !== 0 || sum.inPotPence !== 0 ? [sum] : []
  })
}

/** Home's bill (D1): the oldest unpaid bill until it's paid, then the open one. Null without a set-aside pot. */
export function homeBill(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, today: string = localDate()): BillSum | null {
  const card = potCard(document)
  return card ? potBills(document, card.id, today)[0] ?? null : null
}
