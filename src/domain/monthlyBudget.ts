export type FundingRule = 'proportional' | 'equal' | 'custom' | 'single'
export type BudgetFrequency = 'monthly' | 'annually'
export const starterBudgetCategories = ['Bills', 'Living Expenses', 'Subscriptions', 'Entertainment', 'Savings', 'Other']
export interface BudgetAccount { id: string; name: string; ownerName?: string; provider?: string }
export interface BudgetPot { id: string; name: string; kind: 'spending' | 'savings' | 'credit-card'; ownerName?: string; provider?: string; accountId?: string }
export interface BudgetIncome { personId: string; monthlyNetPence: number; mode: 'all-income' | 'live-on'; liveOnPence: number; surplusPotId: string }
export interface BudgetLine { id: string; category: string; ownerName: string; name: string; entryAmountPence: number; frequency: BudgetFrequency; amountPence: number; potId: string; funding: FundingRule; singleFunderId?: string; customShares?: Record<string, number> }
export interface MonthlyBudget { pots: BudgetPot[]; accounts?: BudgetAccount[]; accountsReviewed?: boolean; categories: string[]; incomes: BudgetIncome[]; lines: BudgetLine[]; monthOverrides?: Record<string, { incomes?: BudgetIncome[]; lines?: BudgetLine[] }>; incomeChanges?: Record<string, BudgetIncome[]> }
export function defaultMonthlyBudget(): MonthlyBudget {
  return { pots: [], accounts: [], accountsReviewed: true, categories: [...starterBudgetCategories], incomes: [], lines: [], monthOverrides: {} }
}
export function monthlyContributionPence(amountPence: number, frequency: BudgetFrequency): number {
  return frequency === 'annually' ? Math.round(amountPence / 12) : amountPence
}
export function resolveMonthBudget(budget: MonthlyBudget, month: string): MonthlyBudget {
  const override = budget.monthOverrides?.[month]
  const effectiveMonth = Object.keys(budget.incomeChanges ?? {}).filter(key => /^\d{4}-\d{2}$/.test(key) && key <= month).sort().at(-1)
  const scheduledIncome = effectiveMonth ? budget.incomeChanges?.[effectiveMonth] : undefined
  const useMonthIncome = !!override?.incomes && (!effectiveMonth || month > effectiveMonth)
  return { ...budget, incomes: useMonthIncome ? override.incomes! : scheduledIncome ?? override?.incomes ?? budget.incomes, lines: override?.lines ?? budget.lines }
}
export function updateMonthBudget(budget: MonthlyBudget, month: string, change: (resolved: MonthlyBudget) => Partial<Pick<MonthlyBudget, 'incomes' | 'lines'>>): MonthlyBudget {
  const resolved = resolveMonthBudget(budget, month)
  const updated = change(resolved)
  return { ...budget, monthOverrides: { ...budget.monthOverrides, [month]: { ...budget.monthOverrides?.[month], ...updated } } }
}
export function validMonthlyBudget(value: unknown): value is MonthlyBudget {
  if (!value || typeof value !== 'object') return false
  const b = value as MonthlyBudget
  const ids = (items: { id: string }[]) => items.every(i => typeof i.id === 'string' && !!i.id) && new Set(items.map(i => i.id)).size === items.length
  if (!Array.isArray(b.categories) || b.categories.some(category => typeof category !== 'string' || !category.trim()) || new Set(b.categories).size !== b.categories.length) return false
  if (!Array.isArray(b.pots) || !ids(b.pots) || b.pots.some(p => typeof p.name !== 'string' || !['spending', 'savings', 'credit-card'].includes(p.kind) || p.ownerName !== undefined && typeof p.ownerName !== 'string' || p.provider !== undefined && typeof p.provider !== 'string' || p.accountId !== undefined && typeof p.accountId !== 'string')) return false
  if (b.accounts !== undefined && (!Array.isArray(b.accounts) || !ids(b.accounts) || b.accounts.some(account => typeof account.name !== 'string' || !account.name.trim() || account.ownerName !== undefined && typeof account.ownerName !== 'string' || account.provider !== undefined && typeof account.provider !== 'string'))) return false
  if (b.accountsReviewed !== undefined && typeof b.accountsReviewed !== 'boolean') return false
  if (Array.isArray(b.accounts) && b.pots.some(pot => pot.accountId !== undefined && !b.accounts!.some(account => account.id === pot.accountId))) return false
  const validIncomes = (incomes: unknown): incomes is BudgetIncome[] => Array.isArray(incomes) && incomes.every(i => i && typeof i.personId === 'string' && Number.isSafeInteger(i.monthlyNetPence) && i.monthlyNetPence >= 0 && Number.isSafeInteger(i.liveOnPence) && i.liveOnPence >= 0 && ['all-income', 'live-on'].includes(i.mode) && typeof i.surplusPotId === 'string')
  if (!validIncomes(b.incomes)) return false
  if (b.incomeChanges !== undefined && (!b.incomeChanges || typeof b.incomeChanges !== 'object' || Object.entries(b.incomeChanges).some(([month, incomes]) => !/^\d{4}-\d{2}$/.test(month) || !validIncomes(incomes)))) return false
  const validLines = (lines: unknown): lines is BudgetLine[] => Array.isArray(lines) && ids(lines) && lines.every(l => typeof l.category === 'string' && b.categories.includes(l.category) && typeof l.ownerName === 'string' && !!l.ownerName.trim() && typeof l.name === 'string' && Number.isSafeInteger(l.entryAmountPence) && l.entryAmountPence >= 0 && ['monthly', 'annually'].includes(l.frequency) && Number.isSafeInteger(l.amountPence) && l.amountPence === monthlyContributionPence(l.entryAmountPence, l.frequency) && typeof l.potId === 'string' && ['proportional', 'equal', 'custom', 'single'].includes(l.funding) && (l.customShares === undefined || (typeof l.customShares === 'object' && l.customShares !== null && Object.values(l.customShares as Record<string, unknown>).every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0))))
  if (!validLines(b.lines)) return false
  if (b.monthOverrides !== undefined && (!b.monthOverrides || typeof b.monthOverrides !== 'object' || Object.entries(b.monthOverrides).some(([month, override]) => !/^\d{4}-\d{2}$/.test(month) || !override || typeof override !== 'object' || override.incomes !== undefined && !validIncomes(override.incomes) || override.lines !== undefined && !validLines(override.lines)))) return false
  return true
}
