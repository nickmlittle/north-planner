import type { BudgetDocument } from './budgetDocument'
import { bufferOf, cardTracker, localDate, sameDestination, type CardTracker } from './cardTracker'
import { checkPotBalance, potBalance } from './potBalances'
import { frontPence, paidBackInto } from './fronts'
import type { BudgetDestination } from './monthlyBudget'

/**
 * The card's buffer (month-health P9): where overspend covers come from and where the Amex pot's extra goes.
 * It's checked against the bank like a pot. A buffer pot is just a pot, so its check and worked-out balance are the pot's.
 * A buffer that is an account's main balance keeps its own check in `CardTracker.accounts`, and North works it out from
 * there: the covers ticked since, the Amex pot's extra and top-ups since, what it covered for waiting rows at Pay, and what
 * has paid it back since (W11).
 */
export type BufferBalance = {
  destination: BudgetDestination
  checked?: { pence: number; at: string }
  /** Checked + the covers and gap moves since; absent until the buffer has been checked. */
  balancePence?: number
}

/** The first card's buffer, with what it holds as far as North knows. Absent without a card. */
export function bufferBalance(document: Pick<BudgetDocument, 'budget' | 'card' | 'ticks'>, today: string = localDate()): BufferBalance | undefined {
  const tracker = cardTracker(document)
  const card = tracker.cards[0]
  if (!card) return undefined
  const destination = bufferOf(card)
  if (destination.kind === 'pot') {
    const balance = potBalance(document, destination.potId, today)
    return { destination, ...balance.checked ? { checked: balance.checked, balancePence: balance.balancePence! } : {} }
  }
  const checked = tracker.accounts?.[destination.accountId]?.checkedBalance
  if (!checked) return { destination }
  return { destination, checked, balancePence: checked.pence + movesSince(tracker, destination, checked.at) }
}

/**
 * What moved through the buffer after `at`: covers ticked out of it (−), the Amex pot's extra (+) or top-ups (−), waiting
 * rows it covered at Pay (−), and their pots paying it back once they're sorted (+).
 */
function movesSince(tracker: CardTracker, buffer: BudgetDestination, at: string): number {
  let pence = 0
  for (const month of Object.values(tracker.months)) for (const cover of month.covers ?? []) {
    const tick = month.coverTicks?.[`cover:${cover.potId}`]
    if (tick && tick.at > at && cover.source.kind !== 'next-month' && sameDestination(cover.source, buffer)) pence -= tick.amountPence
  }
  for (const gap of tracker.gapMoves ?? []) if (gap.at > at && sameDestination(gap.destination, buffer)) pence += gap.pence
  for (const front of tracker.fronts ?? []) if (front.at > at && sameDestination(front.source, buffer)) pence -= frontPence(front)
  for (const row of paidBackInto(tracker, buffer, at)) pence += row.pence
  return pence
}

/** Record what the buffer shows in the bank now. */
export function checkBuffer<T extends Pick<BudgetDocument, 'card'>>(document: T, destination: BudgetDestination, pence: number, now: Date): T {
  if (destination.kind === 'pot') return checkPotBalance(document, destination.potId, pence, now)
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, accounts: { ...tracker.accounts, [destination.accountId]: { ...tracker.accounts?.[destination.accountId], checkedBalance: { pence, at: now.toISOString() } } } } }
}
