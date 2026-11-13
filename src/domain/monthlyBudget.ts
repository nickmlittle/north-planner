import { isAccountTypeId, type AccountTypeId } from './accountTypes'

export type FundingRule = 'proportional' | 'equal' | 'custom' | 'single' | 'fixed'
export type BudgetFrequency = 'monthly' | 'annually'
export type IncomeSourceType = 'employment' | 'additional'

export interface BudgetCategory { id: string; name: string }
export interface BudgetAccount { id: string; name: string; ownerPersonIds: string[]; provider?: string; accountTypeId?: AccountTypeId; legacyOwner?: string }
export interface BudgetPot { id: string; name: string; accountId: string; kind?: 'spending' | 'savings' | 'credit-card'; provider?: string }
export type BudgetDestination = { kind: 'account'; accountId: string } | { kind: 'pot'; potId: string }
export interface FixedContribution { personId: string; amountPence: number }
export interface BudgetItem {
  id: string
  name: string
  categoryId: string
  entryAmountPence: number
  frequency: BudgetFrequency
  amountPence: number
  destination: BudgetDestination
  funding: FundingRule
  singleFunderId?: string
  customShares?: Record<string, number>
  contributions?: FixedContribution[]
}
export interface BudgetSnapshot { items: BudgetItem[]; imported?: boolean }
export interface IncomePolicyValue { mode: 'all-income' | 'live-on'; liveOnPence: number; surplusDestination?: BudgetDestination }
export interface IncomePolicy { personId: string; base: IncomePolicyValue; changes: Record<string, IncomePolicyValue> }
export interface IncomeSource {
  id: string
  personId: string
  name: string
  type: IncomeSourceType
  baseAmountPence: number
  baseEffectiveFrom?: string
  changes: Record<string, number>
  liveOnPence?: number
  surplusDestination?: BudgetDestination
  /** Employment only: when pay arrives (Home's "money arrives" dates). Shared by every month. */
  payday?: { day: number; ifNotWorkingDay: 'previous' | 'next' }
  /** Employment only: the account this pay lands in ("Pay lands in"), the source of its person's funding steps. Shared by every month. */
  landsInAccountId?: string
}
export interface MonthlyBudget {
  accounts: BudgetAccount[]
  pots: BudgetPot[]
  categories: BudgetCategory[]
  snapshots: Record<string, BudgetSnapshot>
  importedBaseline?: BudgetItem[]
  incomeSources: IncomeSource[]
  incomePolicies: IncomePolicy[]
}

export interface ResolvedIncomeSource extends IncomeSource { amountPence: number }
export interface ResolvedBudget {
  items: BudgetItem[]
  sourceMonth: string | null
  nextBudgetMonth: string | null
  hasExplicitBudget: boolean
  importedBaseline: boolean
}

export function defaultMonthlyBudget(): MonthlyBudget {
  return { accounts: [], pots: [], categories: [], snapshots: {}, incomeSources: [], incomePolicies: [] }
}

export function monthlyContributionPence(amountPence: number, frequency: BudgetFrequency): number {
  return frequency === 'annually' ? Math.round(amountPence / 12) : amountPence
}

export function resolveBudget(budget: MonthlyBudget, month: string): ResolvedBudget {
  const months = Object.keys(budget.snapshots).filter(key => key <= month).sort()
  const sourceMonth = months.at(-1) ?? null
  const nextBudgetMonth = Object.keys(budget.snapshots).filter(key => key > month).sort()[0] ?? null
  if (sourceMonth) return { items: budget.snapshots[sourceMonth]!.items, sourceMonth, nextBudgetMonth, hasExplicitBudget: sourceMonth === month, importedBaseline: !!budget.snapshots[sourceMonth]!.imported }
  return { items: budget.importedBaseline ?? [], sourceMonth: null, nextBudgetMonth, hasExplicitBudget: false, importedBaseline: budget.importedBaseline !== undefined }
}

/** Inclusive calendar-month range affected by an edit; null means no later boundary. */
export interface MonthEditScope { fromMonth: string; throughMonth: string | null }

function editScope(month: string, boundaries: string[]): MonthEditScope {
  const next = boundaries.filter(key => key > month).sort()[0]
  if (!next) return { fromMonth: month, throughMonth: null }
  const year = Number(next.slice(0, 4)), nextMonth = Number(next.slice(5))
  const throughMonth = nextMonth === 1 ? `${String(year - 1).padStart(4, '0')}-12` : `${next.slice(0, 4)}-${String(nextMonth - 1).padStart(2, '0')}`
  return { fromMonth: month, throughMonth }
}

export function budgetEditScope(budget: MonthlyBudget, month: string): MonthEditScope {
  return editScope(month, Object.keys(budget.snapshots))
}

export function incomeEditScope(source: IncomeSource, month: string): MonthEditScope {
  return editScope(month, Object.keys(source.changes))
}

export function resolveIncomeSources(budget: MonthlyBudget, month: string): ResolvedIncomeSource[] {
  return budget.incomeSources.flatMap(source => {
    if (source.baseEffectiveFrom && month < source.baseEffectiveFrom) return []
    const changes = Object.keys(source.changes).filter(key => key <= month).sort()
    const amountPence = changes.length ? source.changes[changes.at(-1)!]! : source.baseAmountPence
    return [{ ...source, amountPence }]
  })
}

/**
 * Where a person's pay lands in a month: the landing account of their employment income with the largest amount that
 * month (ties: the first). Null when none is set, or the account no longer exists (transfer-calculation-rules › Source account).
 */
export function payLandsIn(budget: Pick<MonthlyBudget, 'accounts' | 'incomeSources'>, personId: string, month: string): string | null {
  const salaries = resolveIncomeSources(budget as MonthlyBudget, month).filter(source => source.personId === personId && source.type === 'employment' && source.landsInAccountId && budget.accounts.some(account => account.id === source.landsInAccountId))
  const largest = salaries.reduce<typeof salaries[number] | undefined>((best, source) => !best || source.amountPence > best.amountPence ? source : best, undefined)
  return largest?.landsInAccountId ?? null
}

export function budgetDateMarkers(budget: MonthlyBudget) { return Object.keys(budget.snapshots).sort() }
export function incomeDateMarkers(budget: MonthlyBudget) {
  return [...new Set(budget.incomeSources.flatMap(source => [source.baseEffectiveFrom, ...Object.keys(source.changes)].filter((month): month is string => !!month)))].sort()
}

export function updateBudgetAtMonth(budget: MonthlyBudget, month: string, change: (items: BudgetItem[]) => BudgetItem[]): MonthlyBudget {
  const resolved = resolveBudget(budget, month)
  return { ...budget, snapshots: { ...budget.snapshots, [month]: { items: change(resolved.items) } } }
}

export function updateIncomeAtMonth(budget: MonthlyBudget, month: string, sourceId: string, amountPence: number): MonthlyBudget {
  let found = false
  const incomeSources = budget.incomeSources.map(source => {
    if (source.id !== sourceId) return source
    found = true
    return { ...source, changes: { ...source.changes, [month]: amountPence } }
  })
  return found ? { ...budget, incomeSources } : budget
}

/** A new recurring income source, starting at `month`. */
export function addIncomeSource(budget: MonthlyBudget, month: string, source: Pick<IncomeSource, 'personId' | 'name' | 'type' | 'baseAmountPence'> & Partial<Pick<IncomeSource, 'landsInAccountId'>>): MonthlyBudget {
  return { ...budget, incomeSources: [...budget.incomeSources, { id: crypto.randomUUID(), ...source, baseEffectiveFrom: month, changes: {} }] }
}

export function validMonthlyBudget(value: unknown): value is MonthlyBudget {
  if (!value || typeof value !== 'object') return false
  const b = value as MonthlyBudget
  const ids = (items: Array<{ id: string }>) => items.every(item => item && typeof item.id === 'string' && !!item.id) && new Set(items.map(item => item.id)).size === items.length
  const validMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  if (!Array.isArray(b.categories) || !ids(b.categories) || b.categories.some(category => typeof category.name !== 'string' || !category.name.trim()) || new Set(b.categories.map(category => category.name.trim().toLocaleLowerCase())).size !== b.categories.length) return false
  if (!Array.isArray(b.accounts) || !ids(b.accounts) || b.accounts.some(account => typeof account.name !== 'string' || !account.name.trim() || !Array.isArray(account.ownerPersonIds) || account.ownerPersonIds.some(id => typeof id !== 'string') || account.provider !== undefined && typeof account.provider !== 'string' || account.accountTypeId !== undefined && !isAccountTypeId(account.accountTypeId) || account.legacyOwner !== undefined && typeof account.legacyOwner !== 'string')) return false
  if (!Array.isArray(b.pots) || !ids(b.pots) || b.pots.some(pot => typeof pot.name !== 'string' || !pot.name.trim() || !b.accounts.some(account => account.id === pot.accountId) || pot.kind !== undefined && !['spending', 'savings', 'credit-card'].includes(pot.kind))) return false
  if (!b.snapshots || typeof b.snapshots !== 'object' || Array.isArray(b.snapshots)) return false
  if (b.importedBaseline !== undefined && !validItems(b.importedBaseline)) return false
  for (const [month, snapshot] of Object.entries(b.snapshots)) if (!validMonth(month) || !snapshot || typeof snapshot !== 'object' || !validItems(snapshot.items) || snapshot.imported !== undefined && typeof snapshot.imported !== 'boolean') return false
  if (!Array.isArray(b.incomePolicies) || b.incomePolicies.some(policy => !policy || typeof policy.personId !== 'string' || !validPolicyValue(policy.base) || !policy.changes || typeof policy.changes !== 'object' || Array.isArray(policy.changes) || Object.entries(policy.changes).some(([month, rule]) => !validMonth(month) || !validPolicyValue(rule)))) return false
  if (!Array.isArray(b.incomeSources) || !ids(b.incomeSources) || b.incomeSources.some(source => source.landsInAccountId !== undefined && typeof source.landsInAccountId !== 'string') || b.incomeSources.some(source => typeof source.personId !== 'string' || typeof source.name !== 'string' || !source.name.trim() || !['employment', 'additional'].includes(source.type) || !Number.isSafeInteger(source.baseAmountPence) || source.baseAmountPence < 0 || source.baseEffectiveFrom !== undefined && !validMonth(source.baseEffectiveFrom) || !source.changes || typeof source.changes !== 'object' || Array.isArray(source.changes) || Object.entries(source.changes).some(([month, amount]) => !validMonth(month) || !Number.isSafeInteger(amount) || amount < 0) || source.liveOnPence !== undefined && (!Number.isSafeInteger(source.liveOnPence) || source.liveOnPence < 0) || source.surplusDestination !== undefined && !validDestination(source.surplusDestination, b) || source.payday !== undefined && !(source.payday && typeof source.payday === 'object' && Number.isSafeInteger(source.payday.day) && source.payday.day >= 1 && source.payday.day <= 31 && ['previous', 'next'].includes(source.payday.ifNotWorkingDay)))) return false
  return true

  function validPolicyValue(value: unknown): value is IncomePolicyValue {
    if (!value || typeof value !== 'object') return false
    const policy = value as IncomePolicyValue
    return ['all-income', 'live-on'].includes(policy.mode) && Number.isSafeInteger(policy.liveOnPence) && policy.liveOnPence >= 0 && (policy.surplusDestination === undefined || validDestination(policy.surplusDestination, b))
  }

  function validItems(items: unknown): items is BudgetItem[] {
    if (!Array.isArray(items)) return false
    const categoryIds = new Set(b.categories.map(category => category.id))
    return ids(items) && items.every((raw: unknown) => {
      if (!raw || typeof raw !== 'object') return false
      const item = raw as BudgetItem
      return typeof item.name === 'string' && !!item.name.trim() && categoryIds.has(item.categoryId) && Number.isSafeInteger(item.entryAmountPence) && item.entryAmountPence >= 0 && ['monthly', 'annually'].includes(item.frequency) && Number.isSafeInteger(item.amountPence) && item.amountPence === monthlyContributionPence(item.entryAmountPence, item.frequency) && validDestination(item.destination, b) && ['proportional', 'equal', 'custom', 'single', 'fixed'].includes(item.funding) && (item.singleFunderId === undefined || typeof item.singleFunderId === 'string') && (item.customShares === undefined || Object.values(item.customShares).every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) && (item.contributions === undefined || Array.isArray(item.contributions) && item.contributions.every((row: { personId: string; amountPence: number }) => typeof row.personId === 'string' && Number.isSafeInteger(row.amountPence) && row.amountPence >= 0) && new Set(item.contributions.map((row: { personId: string }) => row.personId)).size === item.contributions.length) && (item.funding !== 'fixed' || Array.isArray(item.contributions) && item.contributions.reduce((sum: number, row: { amountPence: number }) => sum + row.amountPence, 0) === item.amountPence)
    })
  }
}

export function validDestination(value: unknown, budget: Pick<MonthlyBudget, 'accounts' | 'pots'>): value is BudgetDestination {
  if (!value || typeof value !== 'object') return false
  const destination = value as BudgetDestination
  if (destination.kind === 'account') return typeof destination.accountId === 'string' && budget.accounts.some(account => account.id === destination.accountId)
  if (destination.kind === 'pot') return typeof destination.potId === 'string' && budget.pots.some(pot => pot.id === destination.potId)
  return false
}

export function resolveIncomePolicy(budget: MonthlyBudget, personId: string, month: string) {
  const policy = budget.incomePolicies.find(row => row.personId === personId)
  if (!policy) return { mode: 'all-income' as const, liveOnPence: 0, surplusDestination: undefined }
  const dates = Object.keys(policy.changes).filter(key => key <= month).sort()
  return dates.length ? policy.changes[dates.at(-1)!]! : policy.base
}
