import { defaultMonthlyBudget, validMonthlyBudget, type MonthlyBudget } from './monthlyBudget'

export interface BudgetPerson { id: string; name: string }
export interface BudgetDocument {
  version: 1
  household: { name: string; adults: BudgetPerson[] }
  workflow: { setupComplete: boolean }
  budget: MonthlyBudget
}

export function newBudgetDocument(): BudgetDocument {
  return { version: 1, household: { name: '', adults: [] }, workflow: { setupComplete: false }, budget: defaultMonthlyBudget() }
}

export function decodeBudgetDocument(raw: unknown): BudgetDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Partial<BudgetDocument>
  const household = value.household
  if (value.version !== 1 || !value.workflow || typeof value.workflow.setupComplete !== 'boolean' || !household || typeof household.name !== 'string' || !Array.isArray(household.adults)) return null
  if (household.adults.some(person => !person || typeof person.id !== 'string' || !person.id || typeof person.name !== 'string')) return null
  if (new Set(household.adults.map(person => person.id)).size !== household.adults.length || !validMonthlyBudget(value.budget)) return null
  const budget = value.budget
  const people = new Set(household.adults.map(person => person.id))
  const pots = new Set(budget.pots.map(pot => pot.id))
  const validMonth = (incomes: typeof budget.incomes, lines: typeof budget.lines) =>
    incomes.every(income => people.has(income.personId) && (!income.surplusPotId || pots.has(income.surplusPotId))) &&
    lines.every(line => pots.has(line.potId) && (!line.singleFunderId || people.has(line.singleFunderId)) && Object.keys(line.customShares ?? {}).every(id => people.has(id)))
  if (!validMonth(budget.incomes, budget.lines)) return null
  if (Object.values(budget.monthOverrides ?? {}).some(override => !validMonth(override.incomes ?? budget.incomes, override.lines ?? budget.lines))) return null
  return value as BudgetDocument
}


export function renameAdult(document: BudgetDocument, id: string, name: string, previousName?: string): BudgetDocument {
  const previous = previousName ?? document.household.adults.find(person => person.id === id)?.name
  const rename = (owner?: string) => previous?.trim() && owner === previous ? name : owner
  const renameLines = (lines: MonthlyBudget['lines']) => lines.map(line => ({ ...line, ownerName: rename(line.ownerName) ?? line.ownerName }))
  return {
    ...document,
    household: { ...document.household, adults: document.household.adults.map(person => person.id === id ? { ...person, name } : person) },
    budget: {
      ...document.budget,
      pots: document.budget.pots.map(pot => ({ ...pot, ...(pot.ownerName ? { ownerName: rename(pot.ownerName) } : {}) })),
      accounts: document.budget.accounts?.map(account => ({ ...account, ...(account.ownerName ? { ownerName: rename(account.ownerName) } : {}) })),
      lines: renameLines(document.budget.lines),
      monthOverrides: Object.fromEntries(Object.entries(document.budget.monthOverrides ?? {}).map(([month, override]) => [month, { ...override, ...(override.lines ? { lines: renameLines(override.lines) } : {}) }])),
    },
  }
}

export function removeAdult(document: BudgetDocument, id: string): BudgetDocument {
  const removedName = document.household.adults.find(person => person.id === id)?.name.trim()
  const ownerName = (name?: string) => removedName && name === removedName ? 'Joint' : name
  const cleanIncomes = (incomes: MonthlyBudget['incomes']) => incomes.filter(income => income.personId !== id)
  const cleanLines = (lines: MonthlyBudget['lines']) => lines.map(line => {
    const customShares = line.customShares ? Object.fromEntries(Object.entries(line.customShares).filter(([personId]) => personId !== id)) : undefined
    const invalidCustomSplit = line.funding === 'custom' && !Object.values(customShares ?? {}).some(share => share > 0)
    return { ...line, ownerName: ownerName(line.ownerName) ?? 'Joint', ...(customShares ? { customShares } : {}), ...(line.singleFunderId === id || invalidCustomSplit ? { funding: 'proportional' as const, singleFunderId: undefined } : {}) }
  })
  return {
    ...document,
    household: { ...document.household, adults: document.household.adults.filter(person => person.id !== id) },
    budget: {
      ...document.budget,
      pots: document.budget.pots.map(pot => ({ ...pot, ...(pot.ownerName ? { ownerName: ownerName(pot.ownerName) } : {}) })),
      accounts: document.budget.accounts?.map(account => ({ ...account, ...(account.ownerName ? { ownerName: ownerName(account.ownerName) } : {}) })),
      incomes: cleanIncomes(document.budget.incomes),
      lines: cleanLines(document.budget.lines),
      monthOverrides: Object.fromEntries(Object.entries(document.budget.monthOverrides ?? {}).map(([month, override]) => [month, {
        ...override,
        ...(override.incomes ? { incomes: cleanIncomes(override.incomes) } : {}),
        ...(override.lines ? { lines: cleanLines(override.lines) } : {}),
      }])),
    },
  }
}
