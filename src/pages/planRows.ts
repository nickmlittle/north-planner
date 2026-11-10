import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetItem } from '../domain/monthlyBudget'
import { accountTypeLabel } from '../domain/accountTypes'
import type { PlanDestination } from '../state/navigation'
import { destinationLabel } from './budgetLabels'

/** A second level inside a group: whose account (by Category), or Direct / a pot (by Destination). */
export type PlanSubgroup = { name: string; key: string; items: BudgetItem[] }
/** `subgroups` is empty when every item would share one, so the group lists its items directly. */
export type PlanGroup = { name: string; key: string; items: BudgetItem[]; subgroups: PlanSubgroup[] }
/** How the Plan bands its items: by what they are for, or by where the money goes. */
export type PlanGrouping = 'category' | 'destination'
export type PlanFilterValues = { query: string; owner: string; category: string }

/** Owner bands, and Owner filter options, in household order. */
export const planOwnerOrder = (adults: BudgetDocument['household']['adults']) => ['Joint', ...adults.map(person => person.name), 'Needs owner']

/** An owner as whose accounts it means: "Immy’s accounts", "Joint accounts", "Accounts needing an owner". */
export const ownerAccountsLabel = (owner: string) => owner === 'Joint' ? 'Joint accounts' : owner === 'Needs owner' ? 'Accounts needing an owner' : `${owner}’s accounts`

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
    potName: potNamed,
    categoryName,
    /** The account's short name, "Monzo Joint", for a pot's item too. */
    accountLabel(item: BudgetItem) {
      const account = accountFor(item)
      return (account && accountLabels.get(account.id)) ?? 'Account'
    },
    /** "Bills · Monzo Joint", the same on every screen. */
    destinationLabel(item: BudgetItem) {
      const account = accountFor(item), destination = item.destination
      return destinationLabel((account && accountLabels.get(account.id)) ?? 'Account', destination.kind === 'pot' ? potNamed(destination.potId) ?? 'Pot' : undefined)
    },
    /** Where on Transfers the item's money goes: the account, and the pot's place in the budget (-1 for direct to the account). */
    destinationPlace(item: BudgetItem) {
      const destination = item.destination
      return { accountId: accountFor(item)?.id, potIndex: destination.kind === 'pot' ? pots.findIndex(pot => pot.id === destination.potId) : -1 }
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

/** The group an item sits in on the Plan: its category, or the account its money goes to. Items whose category has gone share one "Uncategorised" group. */
export function planGroupKey(item: BudgetItem, grouping: PlanGrouping, labels: PlanItemLabels) {
  if (grouping === 'destination') return `destination:account:${labels.accountFor(item)?.id ?? ''}`
  return `category:${labels.categoryName(item) === undefined ? '' : item.categoryId}`
}

/** Split a group's items into its second level, in `order`; none when they would all share one. */
function subgroupsOf(groupKey: string, items: BudgetItem[], keyOf: (item: BudgetItem) => { key: string; name: string; rank: number }): PlanSubgroup[] {
  const subgroups = new Map<string, PlanSubgroup & { rank: number }>()
  for (const item of items) {
    const { key, name, rank } = keyOf(item)
    const subgroup = subgroups.get(key) ?? { key: `${groupKey}/${key}`, name, rank, items: [] }
    subgroup.items.push(item)
    subgroups.set(key, subgroup)
  }
  if (subgroups.size < 2) return []
  return [...subgroups.values()].sort((a, b) => a.rank - b.rank).map(({ key, name, items: rows }) => ({ key, name, items: rows }))
}

/**
 * The Plan's rows after search and filters. Owner is a filter, and by Category the second level:
 * Category → whose account → item. By Destination: account → Direct, then each pot → item.
 * Categories keep first-appearance order. Accounts follow Transfers' `accountOrder`; pots follow the budget's order.
 */
export function groupPlanItems(items: BudgetItem[], filters: PlanFilterValues, labels: PlanItemLabels, grouping: PlanGrouping = 'category', accountOrder: readonly string[] = [], ownerOrder: readonly string[] = []): { groups: PlanGroup[]; matching: BudgetItem[] } {
  const matching = items.filter(item => labels.matchesSearch(item, filters.query)
    && (filters.category === 'All' || item.categoryId === filters.category)
    && (filters.owner === 'All' || labels.ownerGroup(item) === filters.owner))
  const groups = new Map<string, PlanGroup>()
  for (const item of matching) {
    const key = planGroupKey(item, grouping, labels)
    const group = groups.get(key) ?? { name: grouping === 'destination' ? labels.accountLabel(item) : labels.categoryName(item) ?? 'Uncategorised', key, items: [], subgroups: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  const rankOf = (list: readonly string[], value: string) => { const index = list.indexOf(value); return index < 0 ? list.length : index }
  for (const group of groups.values()) {
    group.subgroups = grouping === 'category'
      ? subgroupsOf(group.key, group.items, item => { const owner = labels.ownerGroup(item); return { key: `owner:${owner}`, name: ownerAccountsLabel(owner), rank: rankOf(ownerOrder, owner) } })
      : subgroupsOf(group.key, group.items, item => {
        const destination = item.destination
        if (destination.kind === 'account') return { key: 'direct', name: 'Direct', rank: -1 }
        const place = labels.destinationPlace(item)
        return { key: `pot:${destination.potId}`, name: `${labels.potName(destination.potId) ?? 'Pot'} pot`, rank: place.potIndex < 0 ? Infinity : place.potIndex }
      })
  }
  if (grouping === 'category') return { groups: [...groups.values()], matching }
  const rank = (group: PlanGroup) => { const account = labels.accountFor(group.items[0]!)?.id; const index = account ? accountOrder.indexOf(account) : -1; return index < 0 ? Infinity : index }
  return { groups: [...groups.values()].sort((a, b) => rank(a) - rank(b)), matching }
}
