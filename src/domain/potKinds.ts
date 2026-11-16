import type { BudgetDocument } from './budgetDocument'
import { cardTracker, type PotKind } from './cardTracker'

/**
 * What a pot is for (month-health plan §3, D3–D5, P2): Tracked pots get Left and pace, Funded only pots are moved
 * into on payday and no more, Saving pots build up, Carries over pots keep what's left for bills.
 */
export const POT_KINDS: readonly PotKind[] = ['tracked', 'funded-only', 'saving', 'carries-over']

export const POT_KIND_LABELS: Record<PotKind, string> = { tracked: 'Tracked', 'funded-only': 'Funded only', saving: 'Saving', 'carries-over': 'Carries over' }

/** One line each, for the pot settings and Month's group headings. */
export const POT_KIND_HINTS: Record<PotKind, string> = {
  tracked: 'What’s left this month, with pace. For spending you watch, like groceries.',
  'funded-only': 'North moves the money in on payday and stops there. For a person’s own spending.',
  saving: 'Money put by and built up, not spent against a month.',
  'carries-over': 'What’s left stays in the pot, for bills and yearly costs.',
}

const SAVINGS_ACCOUNTS = new Set(['savings-account', 'cash-isa', 'stocks-shares-isa', 'pension'])

/** A savings pot, or any pot in a savings account. */
export function isSavingsPot(document: Pick<BudgetDocument, 'budget'>, potId: string): boolean {
  const pot = document.budget.pots.find(row => row.id === potId)
  const account = pot && document.budget.accounts.find(row => row.id === pot.accountId)
  return pot?.kind === 'savings' || !!account?.accountTypeId && SAVINGS_ACCOUNTS.has(account.accountTypeId)
}

/** The pot a card's money is set aside in (the Amex pot). It's special and has no kind. */
export const isSetAsidePot = (document: Pick<BudgetDocument, 'card'>, potId: string) => cardTracker(document).cards.some(card => card.setAside?.potId === potId)

/** The kind North would pick when nobody has chosen (P2): carries over, else saving, else funded only in one person's account, else tracked. */
export function defaultPotKind(document: Pick<BudgetDocument, 'budget' | 'card'>, potId: string): PotKind {
  if (cardTracker(document).pots[potId]?.carriesOver) return 'carries-over'
  if (isSavingsPot(document, potId)) return 'saving'
  const pot = document.budget.pots.find(row => row.id === potId)
  const owners = document.budget.accounts.find(row => row.id === pot?.accountId)?.ownerPersonIds ?? []
  return owners.length === 1 ? 'funded-only' : 'tracked'
}

/** A pot's kind: the one chosen, else the default. The Amex pot has none. */
export function potKind(document: Pick<BudgetDocument, 'budget' | 'card'>, potId: string): PotKind | undefined {
  if (isSetAsidePot(document, potId)) return undefined
  return cardTracker(document).pots[potId]?.kind ?? defaultPotKind(document, potId)
}

/** Choose a pot's kind. The older pace and carries-over settings are set to match, so everything that reads them agrees. */
export function savePotKind<T extends Pick<BudgetDocument, 'card'>>(document: T, potId: string, kind: PotKind): T {
  const tracker = cardTracker(document)
  const tracking = { ...tracker.pots[potId], kind, carriesOver: kind === 'carries-over', pace: kind === 'tracked' ? 'steady' as const : 'none' as const }
  return { ...document, card: { ...tracker, pots: { ...tracker.pots, [potId]: tracking } } }
}
