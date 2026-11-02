import type { MonthlyBudget } from './monthlyBudget'

const normalise = (name: string) => name.trim().toLocaleLowerCase('en-GB')

export function planPotCreation(budget: Pick<MonthlyBudget, 'accounts' | 'pots'>, name: string, accountIds: string[]) {
  const selected = budget.accounts.filter(account => accountIds.includes(account.id))
  const existing = selected.filter(account => budget.pots.some(pot => pot.accountId === account.id && normalise(pot.name) === normalise(name)))
  return { create: selected.filter(account => !existing.includes(account)), skip: existing }
}

export function createPotsForAccounts(budget: MonthlyBudget, name: string, accountIds: string[], newIds: Map<string, string>): MonthlyBudget {
  if (!name.trim()) return budget
  const { create } = planPotCreation(budget, name, accountIds)
  if (!create.length) return budget
  return { ...budget, pots: [...budget.pots, ...create.map(account => ({ id: newIds.get(account.id)!, name: name.trim(), accountId: account.id }))] }
}
