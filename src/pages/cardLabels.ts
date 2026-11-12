import type { BudgetDocument } from '../domain/budgetDocument'
import { destinationKey } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { accountOwnerGroups, destinationLabel, shortAccountLabels } from './budgetLabels'

type Labelled = Pick<BudgetDocument, 'budget' | 'household'>

/** One name for a pot or account, as Plan and Transfers show it: "Bills · Monzo Joint", or "Monzo Joint" for the account itself. */
export function destinationNamer(document: Labelled) {
  const accounts = shortAccountLabels(document.budget.accounts, document.household.adults)
  const account = (accountId: string) => accounts.get(accountId) ?? 'Account'
  return (destination: BudgetDestination) => {
    if (destination.kind === 'account') return account(destination.accountId)
    const pot = document.budget.pots.find(row => row.id === destination.potId)
    return pot ? destinationLabel(account(pot.accountId), pot.name) : 'Pot'
  }
}

export type DestinationOption = { value: string; label: string; destination: BudgetDestination }
export type DestinationGroup = { key: string; label: string; options: DestinationOption[] }

/** Every pot and account, grouped by owner like Plan (Joint, then each adult): each account, then its pots A–Z. */
export function destinationGroups(document: Labelled): DestinationGroup[] {
  const name = destinationNamer(document)
  return accountOwnerGroups(document.budget.accounts, document.household.adults).map(group => ({
    key: group.key,
    label: group.label,
    options: group.accounts.flatMap(account => {
      const destinations: BudgetDestination[] = [{ kind: 'account', accountId: account.id },
        ...document.budget.pots.filter(pot => pot.accountId === account.id).sort((a, b) => a.name.localeCompare(b.name, 'en-GB')).map(pot => ({ kind: 'pot' as const, potId: pot.id }))]
      return destinations.map(destination => ({ value: destinationKey(destination), label: name(destination), destination }))
    }),
  }))
}

const ordinals = ['th', 'st', 'nd', 'rd']
/** 1st, 2nd, 3rd, 4th … 21st, 24th. */
export function ordinal(day: number): string {
  const mod100 = day % 100
  return `${day}${mod100 >= 11 && mod100 <= 13 ? 'th' : ordinals[day % 10] ?? 'th'}`
}

export { dayDate, shortDate } from '../formatting/date'
