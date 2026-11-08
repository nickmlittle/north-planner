import type { BudgetDocument } from './budgetDocument'
import { buildTransferMatrixModel } from './transferMatrix'
import { budgetTransfers } from './budgetTransfers'
import { budgetEditScope, resolveBudget } from './monthlyBudget'

export type AccountImpact = { accountId: string; beforePence: number; afterPence: number; people: { personId: string; beforePence: number; afterPence: number }[] }
export type BudgetImpact = { month: string; scope: ReturnType<typeof budgetEditScope>; beforeBalancePence: number; afterBalancePence: number; incomplete: boolean; people: { personId: string; beforePence: number; afterPence: number }[]; accounts: AccountImpact[] }
export type ImpactResult = { impact: BudgetImpact } | { error: string }

/** Compute a draft with the exact allocation rules used by Transfers. */
export function budgetImpact(before: BudgetDocument, after: BudgetDocument, month: string, changedItemIds: string[]): ImpactResult {
  try {
    const beforeItems = resolveBudget(before.budget, month).items
    const afterItems = resolveBudget(after.budget, month).items
    const ids = after.household.adults.map(person => person.id)
    const beforeTransfers = budgetTransfers(before.budget, ids, month, beforeItems)
    const afterTransfers = budgetTransfers(after.budget, ids, month, afterItems)
    const oldMatrix = buildTransferMatrixModel(before, month)
    const newMatrix = buildTransferMatrixModel(after, month)
    const incomplete = newMatrix.accounts.flatMap(account => account.allocations.flatMap(allocation => allocation.items)).some(item => changedItemIds.includes(item.itemId) && item.incomplete)
    const oldAccounts = new Map(oldMatrix.accounts.map(account => [account.accountId, account]))
    const newAccounts = new Map(newMatrix.accounts.map(account => [account.accountId, account]))
    const accountIds = new Set([...oldAccounts.keys(), ...newAccounts.keys()])
    const accounts: AccountImpact[] = [...accountIds].flatMap(accountId => {
      const old = oldAccounts.get(accountId), next = newAccounts.get(accountId)
      const signature = (account: typeof old) => JSON.stringify(account?.allocations.map(allocation => ({ id: allocation.id, plannedPence: allocation.plannedPence, allocatedPence: allocation.allocatedPence, byPerson: allocation.byPerson.map(person => person.amountPence) })))
      if (signature(old) === signature(next) && JSON.stringify(old?.byPerson) === JSON.stringify(next?.byPerson)) return []
      return [{ accountId, beforePence: old?.allocatedPence ?? 0, afterPence: next?.allocatedPence ?? 0,
        people: ids.map(personId => ({ personId, beforePence: old?.byPerson.find(person => person.personId === personId)?.amountPence ?? 0, afterPence: next?.byPerson.find(person => person.personId === personId)?.amountPence ?? 0 })) }]
    })
    return { impact: { month, scope: budgetEditScope(after.budget, month), incomplete,
      beforeBalancePence: beforeTransfers.remainingPence, afterBalancePence: afterTransfers.remainingPence,
      people: ids.map(personId => ({ personId, beforePence: beforeTransfers.people.find(person => person.personId === personId)?.plannedPence ?? 0, afterPence: afterTransfers.people.find(person => person.personId === personId)?.plannedPence ?? 0 })), accounts } }
  } catch { return { error: 'The impact could not be calculated. Check the budget and retry.' } }
}
