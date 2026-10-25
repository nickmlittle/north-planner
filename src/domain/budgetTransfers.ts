import type { MonthlyBudget } from './monthlyBudget'

export function budgetTransfers(budget: MonthlyBudget, personIds: string[]) {
  const people = personIds.map(id => ({ id, income: budget.incomes.find(i => i.personId === id) }))
  const spendable = people.reduce((sum, p) => sum + (p.income ? Math.min(p.income.monthlyNetPence, p.income.mode === 'all-income' ? p.income.monthlyNetPence : p.income.liveOnPence) : 0), 0)
  const sweep = people.reduce((sum, p) => sum + (p.income && p.income.mode === 'live-on' ? Math.max(0, p.income.monthlyNetPence - p.income.liveOnPence) : 0), 0)
  const totals = new Map<string, number>(); const byPerson = new Map<string, Map<string, number>>()
  const add = (personId: string, potId: string, pence: number) => { totals.set(potId, (totals.get(potId) ?? 0) + pence); const m = byPerson.get(personId) ?? new Map<string, number>(); m.set(potId, (m.get(potId) ?? 0) + pence); byPerson.set(personId, m) }
  for (const line of budget.lines) {
    const eligible = people.filter(p => p.income).map(p => p.id)
    if (line.funding === 'single') { if (line.singleFunderId && eligible.includes(line.singleFunderId)) add(line.singleFunderId, line.potId, line.amountPence); continue }
    const weights = eligible.map(id => line.funding === 'equal' ? 1 : line.funding === 'custom' ? Math.max(0, line.customShares?.[id] ?? 0) : Math.max(0, people.find(p => p.id === id)?.income?.monthlyNetPence ?? 0))
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    if (!totalWeight) continue
    let assigned = 0
    eligible.forEach((id, index) => { const part = index === eligible.length - 1 ? line.amountPence - assigned : Math.floor(line.amountPence * weights[index]! / totalWeight); assigned += part; add(id, line.potId, part) })
  }
  for (const person of people) { const income = person.income; if (income?.mode === 'live-on') add(person.id, income.surplusPotId, Math.max(0, income.monthlyNetPence - income.liveOnPence)) }
  const planned = budget.lines.reduce((s, l) => s + l.amountPence, 0)
  return { spendablePence: spendable, plannedPence: planned, surplusPence: sweep, remainingPence: spendable - planned, pots: [...totals].map(([potId, amountPence]) => ({ potId, amountPence })), people: [...byPerson].map(([personId, values]) => ({ personId, pots: [...values].map(([potId, amountPence]) => ({ potId, amountPence })) })) }
}
