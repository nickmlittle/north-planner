import type { BudgetAccount } from '../domain/monthlyBudget'

type Adult = { id: string; name: string }

export function accountOwnerLabel(account: BudgetAccount, adults: Adult[]): string {
  if (!account.ownerPersonIds.length) return 'Needs owner'
  if (account.ownerPersonIds.length > 1) return 'Joint'
  return adults.find(person => person.id === account.ownerPersonIds[0])?.name ?? 'Needs owner'
}

export function accountLabel(account: BudgetAccount, adults: Adult[]): string {
  return `${accountOwnerLabel(account, adults)} · ${account.provider?.trim() || 'Needs bank / provider'} · ${account.name}`
}

export function accountOptionLabels(accounts: BudgetAccount[], adults: Adult[]): Map<string, string> {
  const labels = accounts.map(account => accountLabel(account, adults))
  const totals = new Map<string, number>()
  labels.forEach(label => totals.set(label, (totals.get(label) ?? 0) + 1))
  const seen = new Map<string, number>()
  return new Map(accounts.map((account, index) => {
    const label = labels[index]!
    const number = (seen.get(label) ?? 0) + 1
    seen.set(label, number)
    return [account.id, totals.get(label)! > 1 ? `${label} (Account ${number})` : label]
  }))
}
