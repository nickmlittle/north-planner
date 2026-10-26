export type FundingRule = 'proportional' | 'equal' | 'custom' | 'single'
export type BudgetFrequency = 'monthly' | 'annually'
export const starterBudgetCategories = ['Financing Activities', 'Other Living Expenses', 'Subscriptions', 'Entertainment', 'Savings', 'Living Expenses']
export interface BudgetPot { id: string; name: string; kind: 'spending' | 'savings' | 'credit-card'; ownerName?: string; provider?: string }
export interface BudgetIncome { personId: string; monthlyNetPence: number; mode: 'all-income' | 'live-on'; liveOnPence: number; surplusPotId: string }
export interface BudgetLine { id: string; category: string; ownerName: string; name: string; entryAmountPence: number; frequency: BudgetFrequency; amountPence: number; potId: string; funding: FundingRule; singleFunderId?: string; customShares?: Record<string, number> }
export interface BudgetTransaction { id: string; date: string; description: string; amountPence: number; potId: string }
export interface BudgetStatement { id: string; fileName: string; period: string; statementBalancePence: number | null; transactions: BudgetTransaction[] }
export interface MonthlyBudget { pots: BudgetPot[]; categories: string[]; incomes: BudgetIncome[]; lines: BudgetLine[]; statements: BudgetStatement[]; monthOverrides?: Record<string, { incomes?: BudgetIncome[]; lines?: BudgetLine[] }> }
export function defaultMonthlyBudget(): MonthlyBudget {
  return { pots: [{ id: 'bills', name: 'Bills', kind: 'spending' }, { id: 'amex', name: 'Amex', kind: 'credit-card', provider: 'Amex' }, { id: 'nick-isa', name: 'Nick ISA', kind: 'savings', ownerName: 'Nick' }, { id: 'immy-isa', name: 'Immy ISA', kind: 'savings', ownerName: 'Immy' }], categories: [...starterBudgetCategories], incomes: [], lines: [], statements: [], monthOverrides: {} }
}
export function monthlyContributionPence(amountPence: number, frequency: BudgetFrequency): number {
  return frequency === 'annually' ? Math.round(amountPence / 12) : amountPence
}
export function migrateMonthlyBudget(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const raw = value as Record<string, unknown>
  const ownerForPot = (potId: unknown) => {
    const pot = Array.isArray(raw.pots) ? raw.pots.find(candidate => candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).id === potId) as Record<string, unknown> | undefined : undefined
    const potName = typeof pot?.name === 'string' ? pot.name : ''
    return typeof pot?.ownerName === 'string' ? pot.ownerName : /\bjoint\b/i.test(potName) ? 'Joint' : /\bnick\b/i.test(potName) ? 'Nick' : /\bimmy\b/i.test(potName) ? 'Immy' : 'Joint'
  }
  const migrateLines = (lines: unknown) => Array.isArray(lines) ? lines.map(line => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return line
    const row = line as Record<string, unknown>
    return { ...row, category: row.category ?? 'Uncategorised', ownerName: row.ownerName ?? ownerForPot(row.potId), entryAmountPence: row.entryAmountPence ?? row.amountPence, frequency: row.frequency ?? 'monthly' }
  }) : lines
  const migratedLines = migrateLines(raw.lines)
  const migratedOverrides = raw.monthOverrides && typeof raw.monthOverrides === 'object' && !Array.isArray(raw.monthOverrides)
    ? Object.fromEntries(Object.entries(raw.monthOverrides as Record<string, unknown>).map(([month, override]) => [month,
      override && typeof override === 'object' && !Array.isArray(override) ? { ...override, lines: migrateLines((override as Record<string, unknown>).lines) } : override]))
    : raw.monthOverrides
  const categories: unknown = raw.categories === undefined ? [...starterBudgetCategories, 'Uncategorised'] : Array.isArray(raw.categories) ? [...raw.categories] : raw.categories
  if (Array.isArray(categories)) {
    for (const line of [...(Array.isArray(migratedLines) ? migratedLines : []), ...Object.values(migratedOverrides && typeof migratedOverrides === 'object' ? migratedOverrides : {}).flatMap(override => override && typeof override === 'object' && Array.isArray((override as Record<string, unknown>).lines) ? (override as { lines: unknown[] }).lines : [])]) {
      if (line && typeof line === 'object' && typeof (line as Record<string, unknown>).category === 'string' && !categories.includes((line as Record<string, unknown>).category)) categories.push((line as Record<string, unknown>).category as string)
    }
  }
  const pots = Array.isArray(raw.pots) ? raw.pots.map(pot => {
    if (!pot || typeof pot !== 'object' || Array.isArray(pot)) return pot
    const row = pot as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name : ''
    const ownerName = typeof row.ownerName === 'string' ? row.ownerName : /\bjoint\b/i.test(name) ? 'Joint' : /\bnick\b/i.test(name) ? 'Nick' : /\bimmy\b/i.test(name) ? 'Immy' : undefined
    const provider = typeof row.provider === 'string' ? row.provider : ['Monzo', 'Nationwide', 'Amex'].find(providerName => new RegExp(`\\b${providerName}\\b`, 'i').test(name))
    return { ...row, ...(ownerName ? { ownerName } : {}), ...(provider ? { provider } : {}) }
  }) : raw.pots
  return { ...raw, pots, categories, lines: migratedLines, monthOverrides: migratedOverrides }
}
export function resolveMonthBudget(budget: MonthlyBudget, month: string): MonthlyBudget {
  const override = budget.monthOverrides?.[month]
  return { ...budget, incomes: override?.incomes ?? budget.incomes, lines: override?.lines ?? budget.lines }
}
export function updateMonthBudget(budget: MonthlyBudget, month: string, change: (resolved: MonthlyBudget) => Pick<MonthlyBudget, 'incomes' | 'lines'>): MonthlyBudget {
  const resolved = resolveMonthBudget(budget, month)
  const updated = change(resolved)
  return { ...budget, monthOverrides: { ...budget.monthOverrides, [month]: { incomes: updated.incomes, lines: updated.lines } } }
}
export function validMonthlyBudget(value: unknown): value is MonthlyBudget {
  if (!value || typeof value !== 'object') return false
  const b = value as MonthlyBudget
  const ids = (items: { id: string }[]) => items.every(i => typeof i.id === 'string' && !!i.id) && new Set(items.map(i => i.id)).size === items.length
  if (!Array.isArray(b.categories) || b.categories.some(category => typeof category !== 'string' || !category.trim()) || new Set(b.categories).size !== b.categories.length) return false
  if (!Array.isArray(b.pots) || !ids(b.pots) || b.pots.some(p => typeof p.name !== 'string' || !['spending', 'savings', 'credit-card'].includes(p.kind) || p.ownerName !== undefined && typeof p.ownerName !== 'string' || p.provider !== undefined && typeof p.provider !== 'string')) return false
  if (!Array.isArray(b.incomes) || b.incomes.some(i => !i || typeof i.personId !== 'string' || !Number.isSafeInteger(i.monthlyNetPence) || i.monthlyNetPence < 0 || !Number.isSafeInteger(i.liveOnPence) || i.liveOnPence < 0 || !['all-income', 'live-on'].includes(i.mode) || typeof i.surplusPotId !== 'string')) return false
  const validLines = (lines: unknown): lines is BudgetLine[] => Array.isArray(lines) && ids(lines) && lines.every(l => typeof l.category === 'string' && b.categories.includes(l.category) && typeof l.ownerName === 'string' && !!l.ownerName.trim() && typeof l.name === 'string' && Number.isSafeInteger(l.entryAmountPence) && l.entryAmountPence >= 0 && ['monthly', 'annually'].includes(l.frequency) && Number.isSafeInteger(l.amountPence) && l.amountPence === monthlyContributionPence(l.entryAmountPence, l.frequency) && typeof l.potId === 'string' && ['proportional', 'equal', 'custom', 'single'].includes(l.funding) && (l.customShares === undefined || (typeof l.customShares === 'object' && l.customShares !== null && Object.values(l.customShares as Record<string, unknown>).every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0))))
  if (!validLines(b.lines)) return false
  if (!Array.isArray(b.statements) || !ids(b.statements) || b.statements.some(s => typeof s.fileName !== 'string' || !/^\d{4}-\d{2}$/.test(s.period) || s.statementBalancePence !== null && !Number.isSafeInteger(s.statementBalancePence) || !Array.isArray(s.transactions) || !ids(s.transactions) || s.transactions.some(t => typeof t.date !== 'string' || typeof t.description !== 'string' || !Number.isSafeInteger(t.amountPence) || typeof t.potId !== 'string'))) return false
  if (b.monthOverrides !== undefined && (!b.monthOverrides || typeof b.monthOverrides !== 'object' || Object.entries(b.monthOverrides).some(([month, override]) => !/^\d{4}-\d{2}$/.test(month) || !override || typeof override !== 'object' || override.incomes !== undefined && !Array.isArray(override.incomes) || override.lines !== undefined && !validLines(override.lines)))) return false
  return true
}
