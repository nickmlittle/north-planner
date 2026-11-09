import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetItem } from '../domain/monthlyBudget'
import { accountTypeLabel } from '../domain/accountTypes'
import type { PlanDestination } from '../state/navigation'

export type PlanGroup = { name: string; key: string; items: BudgetItem[] }
export type PlanOwnerGroup = PlanGroup & { categories: PlanGroup[] }
export type PlanFilterValues = { query: string; owner: string; category: string }

/** Owner bands, and Owner filter options, in household order. */
export const planOwnerOrder = (adults: BudgetDocument['household']['adults']) => ['Joint', ...adults.map(person => person.name), 'Needs owner']

const potLabel = (name: string) => /\bpot$/i.test(name) ? name : `${name} pot`

/** Everything the Plan says about an item besides its name and amount. */
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
    destinationLabel(item: BudgetItem) {
      const account = accountFor(item), destination = item.destination
      if (destination.kind === 'pot') return `${potNamed(destination.potId) ?? 'Pot'} · ${account ? accountLabels.get(account.id) : 'Account'}`
      return account ? accountLabels.get(account.id) ?? 'Account' : 'Account'
    },
    /** Owner and bank are already in the group band; rows only need the pot, or the account for direct items. */
    shortDestinationLabel(item: BudgetItem) {
      const destination = item.destination
      if (destination.kind === 'pot') return potLabel(potNamed(destination.potId) ?? 'Pot')
      return accountFor(item)?.name ?? 'Account'
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

/** "Bills pot · Joint Monzo", "Direct to account · Joint Monzo", or a note that it has gone. */
export function planDestinationLabel(document: BudgetDocument, destination: PlanDestination | null | undefined, compactLabels: ReadonlyMap<string, string>) {
  if (!destination) return ''
  const gone = 'Destination no longer available'
  if (destination.kind === 'pot') {
    const pot = document.budget.pots.find(row => row.id === destination.id)
    const account = pot && compactLabels.get(pot.accountId)
    return pot && account ? `${potLabel(pot.name)} · ${account}` : gone
  }
  const account = compactLabels.get(destination.id)
  if (!account) return gone
  return destination.kind === 'direct' ? `Direct to account · ${account}` : account
}

/**
 * The Plan's rows after search and filters. Phones band by owner then category (owners in household order);
 * desktop (`flat`) bands by category only, under a single "All" owner, in first-appearance order.
 */
export function groupPlanItems(items: BudgetItem[], filters: PlanFilterValues, flat: boolean, ownerOrder: string[], labels: PlanItemLabels): { owners: PlanOwnerGroup[]; matching: BudgetItem[] } {
  const byOwner = new Map<string, Map<string, BudgetItem[]>>()
  for (const item of items) {
    if (!labels.matchesSearch(item, filters.query) || (filters.category !== 'All' && item.categoryId !== filters.category)) continue
    const owner = labels.ownerGroup(item), category = labels.categoryName(item) ?? 'Uncategorised'
    const categories = byOwner.get(owner) ?? new Map<string, BudgetItem[]>()
    categories.set(category, [...(categories.get(category) ?? []), item])
    byOwner.set(owner, categories)
  }
  const visible = [...byOwner].filter(([owner]) => filters.owner === 'All' || owner === filters.owner)
  const matching = visible.flatMap(([, categories]) => [...categories.values()].flat())
  if (flat) {
    const shown = new Set(matching), byCategory = new Map<string, BudgetItem[]>()
    for (const item of items) {
      if (!shown.has(item)) continue
      const category = labels.categoryName(item) ?? 'Uncategorised'
      byCategory.set(category, [...(byCategory.get(category) ?? []), item])
    }
    const categories = [...byCategory].map(([name, rows]) => ({ name, key: `category:${name}`, items: rows }))
    return { owners: categories.length ? [{ name: 'All', key: 'owner:All', items: categories.flatMap(category => category.items), categories }] : [], matching }
  }
  const owners = ownerOrder.flatMap(owner => {
    const categories = visible.find(([name]) => name === owner)?.[1]
    if (!categories) return []
    return [{ name: owner, key: `owner:${owner}`, items: [...categories.values()].flat(), categories: [...categories].map(([name, rows]) => ({ name, key: `${owner}:${name}`, items: rows })) }]
  })
  return { owners, matching }
}
