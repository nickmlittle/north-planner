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
  const directByPerson = new Map<string, Map<string, number>>()
  const potByPerson = new Map<string, Map<string, number>>()
  const accountTotals = new Map<string, number>()
  const directTotals = new Map<string, number>()
  const potTotals = new Map<string, number>()
  const accountDestinations = new Map<string, { direct: boolean; pots: Set<string>; unresolved: boolean }>()
  const unresolvedItemIds: string[] = []
  const itemByPerson = new Map<string, Map<string, number>>()
  const add = (personId: string, accountId: string, destination: BudgetDestination, amount: number, itemId: string) => {
    if (!amount) return
    const itemPeople = itemByPerson.get(itemId) ?? new Map<string, number>()
    itemPeople.set(personId, (itemPeople.get(personId) ?? 0) + amount); itemByPerson.set(itemId, itemPeople)
    accountTotals.set(accountId, (accountTotals.get(accountId) ?? 0) + amount)
    const map = byPerson.get(personId) ?? new Map<string, number>()
    map.set(accountId, (map.get(accountId) ?? 0) + amount); byPerson.set(personId, map)
    if (destination.kind === 'pot') {
      potTotals.set(destination.potId, (potTotals.get(destination.potId) ?? 0) + amount)
      const personPots = potByPerson.get(personId) ?? new Map<string, number>()
      personPots.set(destination.potId, (personPots.get(destination.potId) ?? 0) + amount); potByPerson.set(personId, personPots)
    } else {
      directTotals.set(accountId, (directTotals.get(accountId) ?? 0) + amount)
      const personDirect = directByPerson.get(personId) ?? new Map<string, number>()
      personDirect.set(accountId, (personDirect.get(accountId) ?? 0) + amount); directByPerson.set(personId, personDirect)
    }
  }
  const accountFor = (destination: BudgetDestination) => destination.kind === 'account' ? destination.accountId : budget.pots.find(pot => pot.id === destination.potId)?.accountId
  for (const item of items) {
    const accountId = accountFor(item.destination)
    if (!accountId) continue
    itemByPerson.set(item.id, new Map())
    const destinations = accountDestinations.get(accountId) ?? { direct: false, pots: new Set<string>(), unresolved: false }
    if (item.destination.kind === 'pot') destinations.pots.add(item.destination.potId)
    else destinations.direct = true
    accountDestinations.set(accountId, destinations)
    const eligible = people
    if (item.funding === 'fixed') {
      for (const contribution of item.contributions ?? []) add(contribution.personId, accountId, item.destination, contribution.amountPence, item.id)
      continue
    }
    if (item.funding === 'single') {
      if (item.singleFunderId) add(item.singleFunderId, accountId, item.destination, item.amountPence, item.id)
      continue
    }
    const weights = eligible.map(person => item.funding === 'equal' ? 1 : item.funding === 'custom' ? Math.max(0, item.customShares?.[person.id] ?? 0) : Math.max(0, person.employment))
    const totalWeight = weights.reduce((sum, value) => sum + value, 0)
    if (!totalWeight) { if (item.amountPence > 0 && item.funding === 'proportional') { unresolvedItemIds.push(item.id); destinations.unresolved = true }; continue }
    const shares = weights.map(weight => Math.floor(item.amountPence * weight / totalWeight))
    const remainder = item.amountPence - shares.reduce((sum, amount) => sum + amount, 0)
    const remainderOrder = weights.map((weight, index) => ({ index, fraction: item.amountPence * weight / totalWeight - shares[index]! })).filter(row => weights[row.index]! > 0).sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    for (let i = 0; i < remainder; i++) shares[remainderOrder[i % remainderOrder.length]!.index]! += 1
    eligible.forEach((person, index) => add(person.id, accountId, item.destination, shares[index]!, item.id))
  }
  const plannedByPerson = new Map<string, number>()
  for (const [personId, accountRows] of byPerson) plannedByPerson.set(personId, [...accountRows.values()].reduce((sum, value) => sum + value, 0))
  const plannedPence = items.reduce((sum, item) => sum + item.amountPence, 0)
  const availablePence = people.reduce((sum, person) => sum + person.available, 0)
  const surplusPence = people.reduce((sum, person) => sum + person.additional, 0)
  return {
    availablePence, spendablePence: availablePence, plannedPence, surplusPence, remainingPence: availablePence - plannedPence,
    unresolvedItemIds,
    accounts: [...accountDestinations].map(([accountId, destinations]) => ({ accountId, amountPence: accountTotals.get(accountId) ?? 0, directAmountPence: directTotals.get(accountId) ?? 0, hasDirect: destinations.direct, hasPots: destinations.pots.size > 0, incomplete: destinations.unresolved, directByPerson: people.map(person => ({ personId: person.id, amountPence: directByPerson.get(person.id)?.get(accountId) ?? 0 })), pots: [...destinations.pots].sort((a,b)=>budget.pots.findIndex(pot=>pot.id===a)-budget.pots.findIndex(pot=>pot.id===b)).map(potId => ({ potId, amountPence: potTotals.get(potId) ?? 0, byPerson: people.map(person => ({ personId: person.id, amountPence: potByPerson.get(person.id)?.get(potId) ?? 0 })) })), items: items.filter(item => accountFor(item.destination) === accountId).map(item => ({ id: item.id, name: item.name, amountPence: item.amountPence, incomplete: unresolvedItemIds.includes(item.id), byPerson: people.map(person => ({ personId: person.id, amountPence: itemByPerson.get(item.id)?.get(person.id) ?? 0 })) })) })),
    people: people.map(person => ({ personId: person.id, employmentPence: person.employment, additionalPence: person.additional, availablePence: person.available, plannedPence: plannedByPerson.get(person.id) ?? 0, remainingPence: person.available - (plannedByPerson.get(person.id) ?? 0), accounts: [...(byPerson.get(person.id) ?? [])].map(([accountId, amountPence]) => ({ accountId, amountPence })), pots: [...(potByPerson.get(person.id) ?? [])].map(([potId, amountPence]) => ({ potId, amountPence })) })),
  }
}
