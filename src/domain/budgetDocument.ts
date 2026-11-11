import { validTransferTicks, type TransferTicks } from './transferTicks'
import { validCardTracker, type CardTracker } from './cardTracker'
import { defaultMonthlyBudget, validDestination, validMonthlyBudget, type BudgetDestination, type BudgetItem, type BudgetSnapshot, type IncomePolicyValue, type MonthlyBudget } from './monthlyBudget'

export interface BudgetPerson { id: string; name: string }
export interface BudgetDocument {
  version: 3
  household: { name: string; adults: BudgetPerson[] }
  workflow: { setupComplete: boolean }
  budget: MonthlyBudget
  /** Payday steps ticked off, by month. Optional: a document without any is valid, and older versions keep it untouched. */
  ticks?: TransferTicks
  /** The card tracker (Spending). Optional like `ticks`: older documents stay valid, with no version bump. */
  card?: CardTracker
}

interface V2Line { id: string; category?: string; categoryId?: string; ownerName?: string; name: string; entryAmountPence: number; frequency: 'monthly' | 'annually'; amountPence: number; potId: string; funding: 'proportional' | 'equal' | 'custom' | 'single'; singleFunderId?: string; customShares?: Record<string, number> }
interface V2Income { personId: string; monthlyNetPence: number; mode: 'all-income' | 'live-on'; liveOnPence: number; surplusPotId: string }
interface V2Category { id: string; name: string }
interface V2Budget {
  accounts?: Array<{ id: string; name: string; ownerName?: string; provider?: string }>
  pots: Array<{ id: string; name: string; kind?: 'spending' | 'savings' | 'credit-card'; ownerName?: string; provider?: string; accountId?: string; categoryId?: string }>
  categories: Array<string | V2Category>
  incomes: V2Income[]
  lines: V2Line[]
  monthOverrides?: Record<string, { incomes?: V2Income[]; lines?: V2Line[] }>
  incomeChanges?: Record<string, V2Income[]>
}

export function newBudgetDocument(): BudgetDocument {
  return { version: 3, household: { name: '', adults: [] }, workflow: { setupComplete: false }, budget: defaultMonthlyBudget() }
}

export function decodeBudgetDocument(raw: unknown): BudgetDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Partial<BudgetDocument>
  const household = value.household
  if (value.version !== 3 || !value.workflow || typeof value.workflow.setupComplete !== 'boolean' || !household || typeof household.name !== 'string' || !Array.isArray(household.adults)) return null
  if (household.adults.some(person => !person || typeof person.id !== 'string' || !person.id || typeof person.name !== 'string')) return null
  if (new Set(household.adults.map(person => person.id)).size !== household.adults.length || !validMonthlyBudget(value.budget)) return null
  const budget = value.budget
  const people = new Set(household.adults.map(person => person.id))
  const validateItems = (items: BudgetItem[]) => items.every(item =>
    (item.singleFunderId === undefined || people.has(item.singleFunderId)) &&
    Object.keys(item.customShares ?? {}).every(id => people.has(id)) &&
    (item.contributions ?? []).every(contribution => people.has(contribution.personId)))
  if (budget.accounts.some(account => account.ownerPersonIds.some(id => !people.has(id)))) return null
  if (budget.incomeSources.some(source => !people.has(source.personId)) || budget.incomePolicies.some(policy => !people.has(policy.personId))) return null
  if (Object.values(budget.snapshots).some(snapshot => !validateItems(snapshot.items)) || (budget.importedBaseline && !validateItems(budget.importedBaseline))) return null
  if (budget.incomePolicies.some(policy => [policy.base, ...Object.values(policy.changes)].some(rule => rule.surplusDestination && !validDestination(rule.surplusDestination, budget)))) return null
  if (value.ticks !== undefined && !validTransferTicks(value.ticks)) return null
  if (value.card !== undefined && !validCardTracker(value.card, budget, people)) return null
  return value as BudgetDocument
}

export function migrateV2BudgetDocument(raw: unknown): BudgetDocument | null {
  if (!isV2Document(raw)) return null
  const source = raw
  const household = source.household
  const old = source.budget
  const adults = household.adults
  const adultByName = (name: string) => {
    const matches = adults.filter(person => person.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    return matches.length === 1 ? matches[0] : undefined
  }
  const accounts = (old.accounts ?? []).map(account => ({
    id: account.id,
    name: account.name,
    ownerPersonIds: account.ownerName?.toLocaleLowerCase() === 'joint' ? adults.map(person => person.id) : (account.ownerName ? [adultByName(account.ownerName)?.id].filter((id): id is string => !!id) : []),
    ...(account.provider ? { provider: account.provider } : {}),
    ...(account.ownerName?.toLocaleLowerCase() === 'joint' ? {} : account.ownerName && adultByName(account.ownerName) ? {} : { legacyOwner: account.ownerName || 'Unassigned' }),
  }))
  const accountIds = new Set(accounts.map(account => account.id))
  const pots = old.pots.map(pot => {
    const accountId = pot.accountId ?? `legacy-account:${pot.id}`
    if (!accountIds.has(accountId)) {
      const ownerName = pot.ownerName
      const owners = ownerName?.toLocaleLowerCase() === 'joint' ? adults.map(person => person.id) : ownerName ? [adultByName(ownerName)?.id].filter((id): id is string => !!id) : []
      accounts.push({ id: accountId, name: [ownerName, pot.provider].filter(Boolean).join(' · ') || pot.name, ownerPersonIds: owners, ...(pot.provider ? { provider: pot.provider } : {}), ...(ownerName?.toLocaleLowerCase() === 'joint' ? {} : ownerName && adultByName(ownerName) ? {} : { legacyOwner: ownerName || 'Unassigned' }) })
      accountIds.add(accountId)
    }
    return { id: pot.id, name: pot.name, accountId, ...(pot.kind ? { kind: pot.kind } : {}), ...(pot.provider ? { provider: pot.provider } : {}) }
  })
  const categories: Array<{ id: string; name: string }> = []
  const addCategory = (name: string, preferredId?: string) => {
    const cleanName = name.trim()
    if (!cleanName) return
    if (preferredId && categories.some(category => category.id === preferredId)) return
    if (categories.some(category => category.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return
    let categoryId = preferredId || `legacy-category:${categories.length}`
    while (categories.some(category => category.id === categoryId)) categoryId = `legacy-category:${categories.length + 1}`
    categories.push({ id: categoryId, name: cleanName })
  }
  old.categories.forEach((category, index) => typeof category === 'string' ? addCategory(category) : addCategory(category.name, category.id || `legacy-category:${index}`))
  const allLegacyLines = [...old.lines, ...Object.values(old.monthOverrides ?? {}).flatMap(row => row.lines ?? [])]
  for (const line of allLegacyLines) if (line.category) addCategory(line.category)
  for (const pot of old.pots) if (pot.categoryId && !categories.some(category => category.id === pot.categoryId)) addCategory(`Legacy category (${pot.categoryId})`, pot.categoryId)
  const categoryIdByName = new Map(categories.map(category => [category.name.toLocaleLowerCase(), category.id]))
  const categoryIdByOldId = new Map(old.categories.flatMap((category, index) => typeof category === 'string' ? [] : [[category.id || `legacy-category:${index}`, categoryIdByName.get(category.name.trim().toLocaleLowerCase()) ?? ''] as [string, string]]))
  const mapItems = (lines: V2Line[]): BudgetItem[] => lines.flatMap(line => {
    const pot = pots.find(row => row.id === line.potId)
    const oldPot = old.pots.find(row => row.id === line.potId)
    const oldCategoryId = line.categoryId ?? oldPot?.categoryId
    const categoryId = line.category ? categoryIdByName.get(line.category.trim().toLocaleLowerCase()) : oldCategoryId ? categoryIdByOldId.get(oldCategoryId) ?? categories.find(row => row.id === oldCategoryId)?.id : undefined
    if (!pot || !categoryId) return []
    return [{ id: line.id, name: line.name, categoryId, entryAmountPence: line.entryAmountPence, frequency: line.frequency, amountPence: line.amountPence, destination: { kind: 'pot' as const, potId: line.potId }, funding: line.funding, ...(line.singleFunderId ? { singleFunderId: line.singleFunderId } : {}), ...(line.customShares ? { customShares: line.customShares } : {}) }]
  })
  const snapshots: Record<string, BudgetSnapshot> = {}
  for (const [month, row] of Object.entries(old.monthOverrides ?? {})) if (row.lines) snapshots[month] = { items: mapItems(row.lines), imported: true }
  const overrideMonths = Object.keys(old.monthOverrides ?? {}).filter(month => old.monthOverrides?.[month]?.lines).sort()
  for (const month of overrideMonths) {
    const next = nextMonth(month)
    const hasNextOverride = !!old.monthOverrides?.[next]?.lines
    if (!hasNextOverride) snapshots[next] = { items: mapItems(old.lines), imported: true }
  }
  const incomeByPerson = new Map<string, V2Income>()
  for (const income of old.incomes) incomeByPerson.set(income.personId, income)
  const incomeSources = adults.map(person => {
    const income = incomeByPerson.get(person.id)
    return { id: `employment:${person.id}`, personId: person.id, name: 'Employment', type: 'employment' as const, baseAmountPence: income?.monthlyNetPence ?? 0, changes: {} as Record<string, number> }
  })
  const incomePolicies = adults.map(person => {
    const income = incomeByPerson.get(person.id)
    return { personId: person.id, base: oldPolicy(income, pots), changes: {} as Record<string, IncomePolicyValue> }
  })
  const allIncomeMonths = [...new Set([
    ...Object.keys(old.incomeChanges ?? {}),
    ...Object.entries(old.monthOverrides ?? {}).filter(([, row]) => row.incomes).map(([month]) => month),
  ])].sort()
  for (const month of allIncomeMonths) {
    const resolved = resolveLegacyIncomes(old, month)
    for (const person of adults) {
      const income = resolved.find(row => row.personId === person.id)
      const employment = incomeSources.find(source => source.personId === person.id)!
      employment.changes[month] = income?.monthlyNetPence ?? 0
      const policy = incomePolicies.find(row => row.personId === person.id)!
      policy.changes[month] = oldPolicy(income, pots)
    }
  }
  for (const [month, row] of Object.entries(old.monthOverrides ?? {})) if (row.incomes && !old.monthOverrides?.[nextMonth(month)]?.incomes) {
    const next = nextMonth(month)
    const resolved = resolveLegacyIncomes(old, next)
    for (const person of adults) {
      const income = resolved.find(value => value.personId === person.id)
      incomeSources.find(source => source.personId === person.id)!.changes[next] = income?.monthlyNetPence ?? 0
      incomePolicies.find(policy => policy.personId === person.id)!.changes[next] = oldPolicy(income, pots)
    }
  }
  const importedBaseline = old.lines.length ? mapItems(old.lines) : undefined
  const document: BudgetDocument = {
    version: 3,
    household: { name: household.name, adults: adults.map(person => ({ ...person })) },
    workflow: { setupComplete: source.workflow.setupComplete },
    budget: { accounts, pots, categories, snapshots, ...(importedBaseline ? { importedBaseline } : {}), incomeSources, incomePolicies },
  }
  return decodeBudgetDocument(document)
}

function oldPolicy(income: V2Income | undefined, pots: Array<{ id: string }>): IncomePolicyValue {
  const pot = income?.surplusPotId ? pots.find(row => row.id === income.surplusPotId) : undefined
  return { mode: income?.mode ?? 'all-income', liveOnPence: income?.liveOnPence ?? 0, ...(pot ? { surplusDestination: { kind: 'pot', potId: pot.id } as const } : {}) }
}
function resolveLegacyIncomes(budget: V2Budget, month: string): V2Income[] {
  const override = budget.monthOverrides?.[month]
  const effectiveMonth = Object.keys(budget.incomeChanges ?? {}).filter(key => key <= month).sort().at(-1)
  const scheduled = effectiveMonth ? budget.incomeChanges?.[effectiveMonth] : undefined
  const useMonth = !!override?.incomes && (!effectiveMonth || month > effectiveMonth)
  return useMonth ? override!.incomes! : scheduled ?? override?.incomes ?? budget.incomes
}
function nextMonth(month: string) {
  const [year, part] = month.split('-').map(Number)
  const next = new Date(year!, part!, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}
function isV2Document(raw: unknown): raw is { version: 2; household: { name: string; adults: Array<{ id: string; name: string }> }; workflow: { setupComplete: boolean }; budget: V2Budget } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const value = raw as Record<string, unknown>
  const household = value.household as { name?: unknown; adults?: unknown } | null
  const budget = value.budget as V2Budget | null
  return value.version === 2 && !!value.workflow && typeof (value.workflow as { setupComplete?: unknown }).setupComplete === 'boolean' && !!household && typeof household.name === 'string' && Array.isArray(household.adults) && !!budget && Array.isArray(budget.pots) && Array.isArray(budget.categories) && Array.isArray(budget.lines) && Array.isArray(budget.incomes)
}

/** Setup's minimum: a household name and at least one named adult. */
export function householdReady(household: BudgetDocument['household']): boolean {
  return !!household.name.trim() && household.adults.length > 0 && household.adults.every(person => !!person.name.trim())
}

export function renameAdult(document: BudgetDocument, id: string, name: string): BudgetDocument {
  return { ...document, household: { ...document.household, adults: document.household.adults.map(person => person.id === id ? { ...person, name } : person) } }
}

export function removeAdult(document: BudgetDocument, id: string): BudgetDocument {
  const used = document.budget.accounts.some(account => account.ownerPersonIds.includes(id)) || document.budget.incomeSources.some(source => source.personId === id) || document.budget.incomePolicies.some(policy => policy.personId === id) || allItems(document.budget).some(item => item.singleFunderId === id || item.customShares?.[id] !== undefined || item.contributions?.some(row => row.personId === id))
    || !!document.card?.cards.some(card => card.cardholders.some(row => row.personId === id)) || !!document.card?.transactions.some(row => row.personId === id)
  if (used) return document
  return { ...document, household: { ...document.household, adults: document.household.adults.filter(person => person.id !== id) } }
}

function allItems(budget: MonthlyBudget) {
  return [...(budget.importedBaseline ?? []), ...Object.values(budget.snapshots).flatMap(snapshot => snapshot.items)]
}

export function validateAndMapDestination(destination: BudgetDestination, budget: MonthlyBudget) {
  if (destination.kind === 'account') return budget.accounts.find(account => account.id === destination.accountId)
  const pot = budget.pots.find(row => row.id === destination.potId)
  return pot ? budget.accounts.find(account => account.id === pot.accountId) : undefined
}
