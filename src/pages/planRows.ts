import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetItem } from '../domain/monthlyBudget'
import { accountTypeLabel } from '../domain/accountTypes'
import type { PlanDestination } from '../state/navigation'
import { destinationLabel } from './budgetLabels'

export type PlanGroup = { name: string; key: string; items: BudgetItem[] }
export type PlanFilterValues = { query: string; owner: string; category: string }

/** Owner bands, and Owner filter options, in household order. */
export const planOwnerOrder = (adults: BudgetDocument['household']['adults']) => ['Joint', ...adults.map(person => person.name), 'Needs owner']

/** Everything the Plan says about an item besides its name and amount. `accountLabels` are the short names from shortAccountLabels. */
export function planItemLabels(document: BudgetDocument, accountLabels: ReadonlyMap<string, string>) {
  const { accounts, pots, categories } = document.budget
  const adults = document.household.adults
  const potNamed = (potId: string) => pots.find(pot => pot.id === potId)?.name
  const accountFor = (item: BudgetItem) => {
    const destination = item.destination
    if (destination.kind === 'account') return accounts.find(account => account.id === destination.accountId)
    return accounts.find(account => account.id === pots.find(pot => pot.id === destination.potId)?.accountId)
  }
  const ownerGroup = (item: BudgetItem) => {
    const account = accountFor(item)
    if (!account || !account.ownerPersonIds.length) return 'Needs owner'
    if (account.ownerPersonIds.length > 1) return 'Joint'
    return adults.find(person => person.id === account.ownerPersonIds[0])?.name ?? 'Needs owner'
  }
  const categoryName = (item: BudgetItem) => categories.find(category => category.id === item.categoryId)?.name
  return {
    accountFor,
    ownerGroup,
    categoryName,
    /** "Bills · Monzo Joint", the same on every screen. */
    destinationLabel(item: BudgetItem) {
      const account = accountFor(item), destination = item.destination
      return destinationLabel((account && accountLabels.get(account.id)) ?? 'Account', destination.kind === 'pot' ? potNamed(destination.potId) ?? 'Pot' : undefined)
    },
    fundingLabel(item: BudgetItem) {
      if (item.funding === 'fixed') return 'Fixed amounts'
      if (item.funding === 'proportional') return 'Income ratio'
      if (item.funding === 'equal') return 'Equal split'
      if (item.funding === 'single') return `One person · ${adults.find(person => person.id === item.singleFunderId)?.name ?? 'Person'}`
      return 'Custom split'
    },
    /** Search covers the item, its category, account (name, bank, type), pot and owner. */
    matchesSearch(item: BudgetItem, query: string) {
      const needle = query.trim().toLocaleLowerCase()
      if (!needle) return true
      const account = accountFor(item), destination = item.destination
      const pot = destination.kind === 'pot' ? potNamed(destination.potId) ?? '' : ''
      return [item.name, categoryName(item) ?? '', account?.name, account?.provider, accountTypeLabel(account?.accountTypeId), pot, ownerGroup(item)].some(value => value?.toLocaleLowerCase().includes(needle))
    },
  }
}
export type PlanItemLabels = ReturnType<typeof planItemLabels>

/** Whether an item goes to the destination Transfers sent us to: a pot, an account's direct items, or anything in the account. */
export function matchesPlanDestination(item: BudgetItem, destination: PlanDestination | null | undefined, labels: PlanItemLabels) {
  if (!destination) return true
  if (destination.kind === 'pot') return item.destination.kind === 'pot' && item.destination.potId === destination.id
  if (destination.kind === 'direct') return item.destination.kind === 'account' && item.destination.accountId === destination.id
  return labels.accountFor(item)?.id === destination.id
}

/** "Bills · Monzo Joint", "Direct to account · Monzo Joint", or a note that it has gone. */
export function planDestinationLabel(document: BudgetDocument, destination: PlanDestination | null | undefined, accountLabels: ReadonlyMap<string, string>) {
  if (!destination) return ''
  const gone = 'Destination no longer available'
  if (destination.kind === 'pot') {
    const pot = document.budget.pots.find(row => row.id === destination.id)
    const account = pot && accountLabels.get(pot.accountId)
    return pot && account ? destinationLabel(account, pot.name) : gone
  }
  const account = accountLabels.get(destination.id)
  if (!account) return gone
  return destination.kind === 'direct' ? `Direct to account · ${account}` : account
}

/** The group an item sits in on the Plan. Items whose category has gone share one "Uncategorised" group. */
export function planGroupKey(item: BudgetItem, labels: PlanItemLabels) {
  return `category:${labels.categoryName(item) === undefined ? '' : item.categoryId}`
}

/**
 * The Plan's rows after search and filters, banded by category in first-appearance order.
 * Owner is a filter only: every screen size shows the same groups.
 */
export function groupPlanItems(items: BudgetItem[], filters: PlanFilterValues, labels: PlanItemLabels): { groups: PlanGroup[]; matching: BudgetItem[] } {
  const matching = items.filter(item => labels.matchesSearch(item, filters.query)
    && (filters.category === 'All' || item.categoryId === filters.category)
    && (filters.owner === 'All' || labels.ownerGroup(item) === filters.owner))
  const groups = new Map<string, PlanGroup>()
  for (const item of matching) {
    const key = planGroupKey(item, labels)
    const group = groups.get(key) ?? { name: labels.categoryName(item) ?? 'Uncategorised', key, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  return { groups: [...groups.values()], matching }
}
