export type FundingRule = 'proportional' | 'equal' | 'custom' | 'single'
export interface BudgetPot { id: string; name: string; kind: 'spending' | 'savings' | 'credit-card'; ownerId?: string }
export interface BudgetIncome { personId: string; monthlyNetPence: number; mode: 'all-income' | 'live-on'; liveOnPence: number; surplusPotId: string }
export interface BudgetLine { id: string; name: string; amountPence: number; potId: string; funding: FundingRule; singleFunderId?: string; customShares?: Record<string, number> }
export interface BudgetTransaction { id: string; date: string; description: string; amountPence: number; potId: string }
export interface BudgetStatement { id: string; fileName: string; period: string; statementBalancePence: number | null; transactions: BudgetTransaction[] }
export interface MonthlyBudget { pots: BudgetPot[]; incomes: BudgetIncome[]; lines: BudgetLine[]; statements: BudgetStatement[] }
export function defaultMonthlyBudget(): MonthlyBudget {
  return { pots: [{ id: 'bills', name: 'Bills', kind: 'spending' }, { id: 'amex', name: 'Amex', kind: 'credit-card' }, { id: 'nick-isa', name: 'Nick ISA', kind: 'savings' }, { id: 'immy-isa', name: 'Immy ISA', kind: 'savings' }], incomes: [], lines: [], statements: [] }
}
export function validMonthlyBudget(value: unknown): value is MonthlyBudget {
  if (!value || typeof value !== 'object') return false
  const b = value as MonthlyBudget
  const ids = (items: { id: string }[]) => items.every(i => typeof i.id === 'string' && !!i.id) && new Set(items.map(i => i.id)).size === items.length
  if (!Array.isArray(b.pots) || !ids(b.pots) || b.pots.some(p => typeof p.name !== 'string' || !['spending', 'savings', 'credit-card'].includes(p.kind))) return false
  if (!Array.isArray(b.incomes) || b.incomes.some(i => !i || typeof i.personId !== 'string' || !Number.isSafeInteger(i.monthlyNetPence) || i.monthlyNetPence < 0 || !Number.isSafeInteger(i.liveOnPence) || i.liveOnPence < 0 || !['all-income', 'live-on'].includes(i.mode) || typeof i.surplusPotId !== 'string')) return false
  if (!Array.isArray(b.lines) || !ids(b.lines) || b.lines.some(l => typeof l.name !== 'string' || !Number.isSafeInteger(l.amountPence) || l.amountPence < 0 || typeof l.potId !== 'string' || !['proportional', 'equal', 'custom', 'single'].includes(l.funding) || l.customShares !== undefined && Object.values(l.customShares).some(n => !Number.isFinite(n) || n < 0))) return false
  if (!Array.isArray(b.statements) || !ids(b.statements) || b.statements.some(s => typeof s.fileName !== 'string' || !/^\d{4}-\d{2}$/.test(s.period) || s.statementBalancePence !== null && !Number.isSafeInteger(s.statementBalancePence) || !Array.isArray(s.transactions) || !ids(s.transactions) || s.transactions.some(t => typeof t.date !== 'string' || typeof t.description !== 'string' || !Number.isSafeInteger(t.amountPence) || typeof t.potId !== 'string'))) return false
  return true
}
