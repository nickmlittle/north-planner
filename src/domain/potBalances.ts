import type { BudgetDocument } from './budgetDocument'
import { cardTracker, parseStatementKey, type CardTracker } from './cardTracker'
import { SETTLE_PAY_KEY, settleIntoKey, settleOutKey, statementShares, statementTransactions } from './cardStatements'
import { moveTotal, usesSetAside } from './setAside'

/**
 * Every pot's balance, worked out (§6.6, extended for the Amex pot): the balance last checked against the bank,
 * plus every move North knows about since. Card spend doesn't touch a pot until its money moves (to the Amex
 * pot, or at settle up), so what's free is the balance less the spend still waiting to move.
 * Rules: docs/card-tracker-rules.md.
 */

export type BalanceFlow = 'payday' | 'covers' | 'built-up' | 'settled' | 'set-aside' | 'paid'
export type FlowEntry = { at: string; pence: number; flow: BalanceFlow }
export type WaitingShare = { statementKey: string; closeDate: string; pence: number }

export type PotBalance = {
  potId: string
  checked?: { pence: number; at: string }
  /** Money in (+) and out (−) since the check, by what moved it; flows with nothing in them are left out. */
  since: Array<{ flow: BalanceFlow; pence: number }>
  /** Checked + everything since; absent until the balance has been checked. */
  balancePence?: number
  /** Card spend on the pot that hasn't moved out of it yet (to the Amex pot or at settle up), per statement. */
  waiting: WaitingShare[]
  waitingPence: number
  /** Balance − waiting. */
  freePence?: number
  /** The card's set-aside pot (the Amex pot): it holds money for the bill, so nothing waits on it. */
  setAside: boolean
}

const FLOW_ORDER: BalanceFlow[] = ['payday', 'covers', 'built-up', 'settled', 'set-aside', 'paid']

/** The card whose set-aside pot this is, if any. */
export const setAsideCardFor = (tracker: Pick<CardTracker, 'cards'>, potId: string) => tracker.cards.find(card => card.setAside?.potId === potId)

/**
 * Every move in or out of a pot that North knows about: payday Move ticks, Close month covers into it or out of
 * it, built-up money moved out, settle-up Out of / Into ticks, moves to the Amex pot (out of a spending pot, into
 * the Amex pot), and paying the card from the Amex pot.
 */
export function potFlows(document: Pick<BudgetDocument, 'card' | 'ticks'>, potId: string): FlowEntry[] {
  const tracker = cardTracker(document)
  const flows: FlowEntry[] = []
  for (const steps of Object.values(document.ticks ?? {})) for (const [key, tick] of Object.entries(steps)) if (key.endsWith(`:move:${potId}`)) flows.push({ at: tick.at, pence: tick.amountPence, flow: 'payday' })
  for (const month of Object.values(tracker.months)) for (const cover of month.covers ?? []) {
    // Same key as Close month's cover steps (`coverKey` in monthStages).
    const tick = month.coverTicks?.[`cover:${cover.potId}`]
    if (!tick || cover.source.kind === 'next-month') continue
    if (cover.potId === potId) flows.push({ at: tick.at, pence: tick.amountPence, flow: 'covers' })
    if (cover.source.kind === 'pot' && cover.source.potId === potId) flows.push({ at: tick.at, pence: -tick.amountPence, flow: 'covers' })
  }
  for (const row of tracker.pots[potId]?.movedOut ?? []) flows.push({ at: row.at, pence: -row.pence, flow: 'built-up' })
  const card = setAsideCardFor(tracker, potId)
  for (const [key, statement] of Object.entries(tracker.statements)) {
    const out = statement.ticks?.[settleOutKey(potId)], into = statement.ticks?.[settleIntoKey(potId)]
    if (out) flows.push({ at: out.at, pence: -out.amountPence, flow: 'settled' })
    if (into) flows.push({ at: into.at, pence: into.amountPence, flow: 'settled' })
    const pay = statement.ticks?.[SETTLE_PAY_KEY]
    if (card && pay && statement.cardId === card.id && usesSetAside(card, key)) flows.push({ at: pay.at, pence: -pay.amountPence, flow: 'paid' })
  }
  for (const move of tracker.moves ?? []) {
    const moveCard = tracker.cards.find(row => row.id === move.cardId)
    if (moveCard?.setAside?.potId === potId) { const total = moveTotal(move, potId); if (total) flows.push({ at: move.at, pence: total, flow: 'set-aside' }); continue }
    const out = move.transactions.flatMap(row => row.lines).filter(line => line.destination.kind === 'pot' && line.destination.potId === potId).reduce((sum, line) => sum + line.amountPence, 0)
    if (out) flows.push({ at: move.at, pence: -out, flow: 'set-aside' })
  }
  return flows
}

/** Card spend on a pot still to move out of it, per statement: its share, less settle-up ticks and moves to the Amex pot. */
export function waitingShares(tracker: CardTracker, potId: string): WaitingShare[] {
  const movedByTransaction = new Map<string, number>()
  for (const move of tracker.moves ?? []) for (const row of move.transactions) for (const line of row.lines) if (line.destination.kind === 'pot' && line.destination.potId === potId) movedByTransaction.set(row.transactionId, (movedByTransaction.get(row.transactionId) ?? 0) + line.amountPence)
  const keys = new Set(tracker.transactions.filter(row => row.sort?.lines.some(line => line.destination.kind === 'pot' && line.destination.potId === potId) || movedByTransaction.has(row.id)).map(row => row.statementKey))
  const waiting: WaitingShare[] = []
  for (const statementKey of [...keys].sort()) {
    const share = statementShares(tracker, statementKey).get(`pot:${potId}`)?.pence ?? 0
    const ticks = tracker.statements[statementKey]?.ticks
    const settled = (ticks?.[settleOutKey(potId)]?.amountPence ?? 0) - (ticks?.[settleIntoKey(potId)]?.amountPence ?? 0)
    const moved = statementTransactions(tracker, statementKey).reduce((sum, row) => sum + (movedByTransaction.get(row.id) ?? 0), 0)
    const pence = share - settled - moved
    if (pence !== 0) waiting.push({ statementKey, closeDate: parseStatementKey(statementKey)?.closeDate ?? '', pence })
  }
  return waiting
}

/** A pot's balance: checked + every move since, and what's free once the spend waiting to move is taken off. */
export function potBalance(document: Pick<BudgetDocument, 'card' | 'ticks'>, potId: string): PotBalance {
  const tracker = cardTracker(document)
  const checked = tracker.pots[potId]?.checkedBalance
  const setAside = !!setAsideCardFor(tracker, potId)
  const totals = new Map<BalanceFlow, number>()
  if (checked) for (const entry of potFlows(document, potId)) if (entry.at > checked.at) totals.set(entry.flow, (totals.get(entry.flow) ?? 0) + entry.pence)
  const since = FLOW_ORDER.filter(flow => totals.get(flow)).map(flow => ({ flow, pence: totals.get(flow)! }))
  const waiting = setAside ? [] : waitingShares(tracker, potId)
  const waitingPence = waiting.reduce((sum, row) => sum + row.pence, 0)
  const balancePence = checked ? checked.pence + since.reduce((sum, row) => sum + row.pence, 0) : undefined
  return { potId, ...checked ? { checked, balancePence, freePence: balancePence! - waitingPence } : {}, since, waiting, waitingPence, setAside }
}

/** "Check against Monzo": record what's in the pot now. */
export function checkPotBalance<T extends Pick<BudgetDocument, 'card'>>(document: T, potId: string, pence: number, now: Date): T {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, pots: { ...tracker.pots, [potId]: { ...tracker.pots[potId], checkedBalance: { pence, at: now.toISOString() } } } } }
}

/** Check several pots at once (Check balances): pot id → pence. */
export function checkPotBalances<T extends Pick<BudgetDocument, 'card'>>(document: T, balances: ReadonlyMap<string, number>, now: Date): T {
  let next = document
  for (const [potId, pence] of balances) next = checkPotBalance(next, potId, pence, now)
  return next
}

export type SetAsideStatement = {
  statementKey: string
  closeDate: string
  /** What the statement will cost: Σ its purchases and refunds. */
  totalPence: number
  /** Moved to the pot for its transactions (lines sorted to the pot itself count as there already). */
  movedPence: number
  /** Total − moved: sorted or not, still to go into the pot. */
  toMovePence: number
  /** Paid to the card from the pot (its Pay tick). */
  paidPence: number
}

/** The statements paid from a card's set-aside pot, newest first: what each costs, what's in the pot for it, and what's paid. */
export function setAsideStatements(document: Pick<BudgetDocument, 'card'>, cardId: string): SetAsideStatement[] {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  if (!card?.setAside) return []
  const moved = new Map<string, number>()
  for (const move of tracker.moves ?? []) if (move.cardId === cardId) for (const row of move.transactions) moved.set(row.transactionId, (moved.get(row.transactionId) ?? 0) + row.lines.reduce((sum, line) => sum + line.amountPence, 0))
  const keys = new Set([...tracker.transactions.filter(row => row.cardId === cardId).map(row => row.statementKey), ...Object.keys(tracker.statements).filter(key => tracker.statements[key]!.cardId === cardId)])
  return [...keys].filter(key => usesSetAside(card, key)).sort().reverse().map(statementKey => {
    const rows = statementTransactions(tracker, statementKey).filter(row => row.kind !== 'payment')
    const totalPence = rows.reduce((sum, row) => sum + row.amountPence, 0)
    const movedPence = rows.reduce((sum, row) => sum + (moved.get(row.id) ?? 0), 0)
    return { statementKey, closeDate: parseStatementKey(statementKey)?.closeDate ?? '', totalPence, movedPence, toMovePence: totalPence - movedPence, paidPence: tracker.statements[statementKey]?.ticks?.[SETTLE_PAY_KEY]?.amountPence ?? 0 }
  })
}
