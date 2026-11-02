import { resolveIncomePolicy, resolveIncomeSources, type BudgetDestination, type BudgetItem, type MonthlyBudget } from './monthlyBudget'

export function budgetTransfers(budget: MonthlyBudget, personIds: string[], month: string, items: BudgetItem[] = []) {
  const sources = resolveIncomeSources(budget, month)
  const people = personIds.map(id => {
    const rows = sources.filter(source => source.personId === id)
    const employment = rows.filter(row => row.type === 'employment').reduce((sum, row) => sum + row.amountPence, 0)
    const additional = rows.filter(row => row.type === 'additional').reduce((sum, row) => sum + row.amountPence, 0)
    const policy = resolveIncomePolicy(budget, id, month)
    return { id, employment, additional, available: employment + additional, policy }
  })
  const byPerson = new Map<string, Map<string, number>>()
  const accountTotals = new Map<string, number>()
  const potTotals = new Map<string, number>()
  const unresolvedItemIds: string[] = []
  const add = (personId: string, accountId: string, destination: BudgetDestination, amount: number) => {
    if (!amount) return
    accountTotals.set(accountId, (accountTotals.get(accountId) ?? 0) + amount)
    const map = byPerson.get(personId) ?? new Map<string, number>()
    map.set(accountId, (map.get(accountId) ?? 0) + amount); byPerson.set(personId, map)
    if (destination.kind === 'pot') potTotals.set(destination.potId, (potTotals.get(destination.potId) ?? 0) + amount)
  }
  const accountFor = (destination: BudgetDestination) => destination.kind === 'account' ? destination.accountId : budget.pots.find(pot => pot.id === destination.potId)?.accountId
  for (const item of items) {
    const accountId = accountFor(item.destination)
    if (!accountId) continue
    const eligible = people
    if (item.funding === 'fixed') {
      for (const contribution of item.contributions ?? []) add(contribution.personId, accountId, item.destination, contribution.amountPence)
      continue
    }
    if (item.funding === 'single') {
      if (item.singleFunderId) add(item.singleFunderId, accountId, item.destination, item.amountPence)
      continue
    }
    const weights = eligible.map(person => item.funding === 'equal' ? 1 : item.funding === 'custom' ? Math.max(0, item.customShares?.[person.id] ?? 0) : Math.max(0, person.employment))
    const totalWeight = weights.reduce((sum, value) => sum + value, 0)
    if (!totalWeight) { if (item.amountPence > 0 && item.funding === 'proportional') unresolvedItemIds.push(item.id); continue }
    const shares = weights.map(weight => Math.floor(item.amountPence * weight / totalWeight))
    const remainder = item.amountPence - shares.reduce((sum, amount) => sum + amount, 0)
    const remainderOrder = weights.map((weight, index) => ({ index, fraction: item.amountPence * weight / totalWeight - shares[index]! })).filter(row => weights[row.index]! > 0).sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    for (let i = 0; i < remainder; i++) shares[remainderOrder[i % remainderOrder.length]!.index]! += 1
    eligible.forEach((person, index) => add(person.id, accountId, item.destination, shares[index]!))
  }
  const plannedByPerson = new Map<string, number>()
  for (const [personId, accountRows] of byPerson) plannedByPerson.set(personId, [...accountRows.values()].reduce((sum, value) => sum + value, 0))
  const plannedPence = items.reduce((sum, item) => sum + item.amountPence, 0)
  const availablePence = people.reduce((sum, person) => sum + person.available, 0)
  const surplusPence = people.reduce((sum, person) => sum + person.additional, 0)
  return {
    availablePence, spendablePence: availablePence, plannedPence, surplusPence, remainingPence: availablePence - plannedPence,
    unresolvedItemIds,
    accounts: [...accountTotals].map(([accountId, amountPence]) => ({ accountId, amountPence, pots: [...potTotals].filter(([potId]) => budget.pots.find(pot => pot.id === potId)?.accountId === accountId).map(([potId, amount]) => ({ potId, amountPence: amount })) })),
    people: people.map(person => ({ personId: person.id, employmentPence: person.employment, additionalPence: person.additional, availablePence: person.available, plannedPence: plannedByPerson.get(person.id) ?? 0, remainingPence: person.available - (plannedByPerson.get(person.id) ?? 0), accounts: [...(byPerson.get(person.id) ?? [])].map(([accountId, amountPence]) => ({ accountId, amountPence })) })),
  }
}
