import type { BudgetAccount } from '../domain/monthlyBudget'
import { accountTypeLabel } from '../domain/accountTypes'

type Adult = { id: string; name: string }
export const budgetCollator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true })

export function accountOwnerKey(account: BudgetAccount): string {
  if (account.ownerPersonIds.length > 1) return 'joint'
  return account.ownerPersonIds.length ? `person:${account.ownerPersonIds[0]}` : 'unassigned'
}

export function accountOwnerGroups(accounts: BudgetAccount[], adults: Adult[]) {
  return [
    { key: 'joint', label: 'Joint' },
    ...adults.map(person => ({ key: `person:${person.id}`, label: person.name })),
    { key: 'unassigned', label: 'Needs owner' },
  ].map(group => ({ ...group, accounts: accounts.filter(account => accountOwnerKey(account) === group.key).sort((a, b) =>
    budgetCollator.compare(a.provider ?? '', b.provider ?? '') ||
    budgetCollator.compare(accountTypeLabel(a.accountTypeId), accountTypeLabel(b.accountTypeId)) ||
    budgetCollator.compare(a.name, b.name) || a.id.localeCompare(b.id))
  })).filter(group => group.accounts.length)
}

export function accountOwnerLabel(account: BudgetAccount, adults: Adult[]): string {
  if (!account.ownerPersonIds.length) return 'Needs owner'
  if (account.ownerPersonIds.length > 1) return 'Joint'
  return adults.find(person => person.id === account.ownerPersonIds[0])?.name ?? 'Needs owner'
}

export function accountLabel(account: BudgetAccount, adults: Adult[]): string {
  return `${accountOwnerLabel(account, adults)} · ${accountDetailsLabel(account)}`
}

export function accountDetailsLabel(account: BudgetAccount): string {
  const type = accountTypeLabel(account.accountTypeId)
  const nickname = type && account.name.trim().toLocaleLowerCase() === type.toLocaleLowerCase() ? '' : account.name
  return [account.provider?.trim() || 'Needs bank / provider', type, nickname].filter(Boolean).join(' · ')
}

export function accountOptionLabels(accounts: BudgetAccount[], adults: Adult[], includeOwner = true): Map<string, string> {
  const labels = accounts.map(account => accountLabel(account, adults))
  const totals = new Map<string, number>()
  labels.forEach(label => totals.set(label, (totals.get(label) ?? 0) + 1))
  const seen = new Map<string, number>()
  return new Map(accounts.map((account, index) => {
    const label = labels[index]!
    const number = (seen.get(label) ?? 0) + 1
    seen.set(label, number)
    const display = includeOwner ? label : accountDetailsLabel(account)
    return [account.id, totals.get(label)! > 1 ? `${display} (Account ${number})` : display]
  }))
}

/** Compact labels ("Owner · Account") keep destinations identifiable without repeating account type. */
export function compactAccountLabels(accounts: BudgetAccount[], adults: Adult[]): Map<string, string> {
  const compact = accounts.map(account => `${accountOwnerLabel(account, adults)} · ${account.name}`)
  const compactCounts = new Map<string, number>()
  compact.forEach(label => compactCounts.set(label, (compactCounts.get(label) ?? 0) + 1))
  const qualified = accounts.map((account, index) => compactCounts.get(compact[index]!)! > 1
    ? `${compact[index]} · ${account.provider?.trim() || accountTypeLabel(account.accountTypeId) || 'Account'}`
    : compact[index]!)
  const qualifiedCounts = new Map<string, number>()
  qualified.forEach(label => qualifiedCounts.set(label, (qualifiedCounts.get(label) ?? 0) + 1))
  const seen = new Map<string, number>()
  return new Map(accounts.map((account, index) => {
    const label = qualified[index]!
    const number = (seen.get(label) ?? 0) + 1
    seen.set(label, number)
    return [account.id, qualifiedCounts.get(label)! > 1 ? `${label} (Account ${number})` : label]
  }))
}
