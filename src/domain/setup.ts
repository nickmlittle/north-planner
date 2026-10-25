import type { ForecastInput } from './forecast'
import { validatePlanning } from './planning'
import type { ReturnAssumptions } from './planning'
import { validateTaxRules } from './tax'
import type { TaxRules } from './tax'
import { validateMortgagePlan } from './mortgage'
import type { MortgagePlan } from './mortgage'
import { pricedPropertyMove, validateMoves } from './property'
import type { PropertyMove } from './property'
import { validateIncome } from './income'
import type { IncomePeriod } from './income'
import { validateChildren } from './children'
import { validateSpending } from './spending'
import type { PensionContributions } from './contributions'
import type { ChildEvent } from './children'
import type { SpendingEvent } from './spending'
import { purchaseSpending, validatePurchases } from './purchases'
import type { PurchaseEvent } from './purchases'
import { defaultPlanning } from '../config/defaultPlanning'
import { defaultTax } from '../config/defaultTax'
import { defaultMortgage } from '../config/defaultMortgage'
import { defaultMonthlyBudget, validMonthlyBudget } from './monthlyBudget'
import type { MonthlyBudget } from './monthlyBudget'

export const setupSteps = ['Welcome', 'Household', 'Income', 'Pensions', 'Savings', 'Home', 'Spending', 'Review', 'Overview', 'Dashboard', 'Plan settings'] as const
export type Frequency = 'month' | 'year'
export type AgeBand = 'ages0to2' | 'ages3to4' | 'ages5to11' | 'ages12to18'
export const ageBands: { key: AgeBand; label: string; end: number }[] = [
  { key: 'ages0to2', label: 'Ages 0–2', end: 2 }, { key: 'ages3to4', label: 'Ages 3–4', end: 4 },
  { key: 'ages5to11', label: 'Ages 5–11', end: 11 }, { key: 'ages12to18', label: 'Ages 12–18', end: 18 },
]
export interface SetupPerson {
  id: string; name: string; dob: string; role: 'you' | 'partner' | 'adult' | 'child'
  incomeKind: '' | 'paye' | 'inside-ir35' | 'none'; pay: string; frequency: Frequency; days: string
  payOverride: string
  pensionStatus: '' | 'yes' | 'none'; pension: string; employee: string; employer: string
  treatment: '' | PensionContributions['treatment']
  isaType: '' | 'cash' | 'stocks-and-shares' | 'none'; isa: string
  childCost: string; childFrequency: Frequency; futureCosts: Record<AgeBand, string>
  isaAsOfDate: string; pensionAsOfDate: string
}
export interface CashEntry { id: string; name: string; balance: string; ownerIds: string[]; asOfDate: string }
export interface SetupSnapshot {
  name: string; people: SetupPerson[]; cash: CashEntry[]; noCash: boolean
  housing: '' | 'own' | 'rent' | 'none'; homeValue: string; homeOwners: string[]
  mortgageStatus: '' | 'yes' | 'none'; mortgageBalance: string; rate: string; term: string; borrowers: string[]
  spending: string; spendingFrequency: Frequency
  planningStartDate: string; homeAsOfDate: string; mortgageAsOfDate: string
}
export interface AppDocument {
  version: 1; step: number; completed: boolean; snapshot: SetupSnapshot
  moneyBasis: { currency: 'GBP'; priceYear: number; terms: 'real' }
  /** Legacy documents require an explicit acknowledgement of unknown opening balance dates. */
  balanceDatesReviewed: boolean
  planning: ReturnAssumptions; tax: TaxRules; mortgageExtras: Pick<MortgagePlan, 'monthlyOverpayment' | 'inflation' | 'refinances'>
  moves: PropertyMove[]; allowances: Record<string, number>; incomeTimeline: IncomePeriod[] | null
  childEvents: ChildEvent[]; spendingEvents: SpendingEvent[]; purchaseEvents: PurchaseEvent[]
  budget: MonthlyBudget
  migration?: { fromVersion: number | null; gaps: string[] }
}
export function emptyPerson(role: SetupPerson['role'] = 'adult'): SetupPerson {
  return { id: crypto.randomUUID(), name: '', dob: '', role, incomeKind: '', pay: '', frequency: 'year', days: '', payOverride: '',
    pensionStatus: '', pension: '', employee: '', employer: '', treatment: '', isaType: '', isa: '',
    childCost: '', childFrequency: 'month', futureCosts: { ages0to2: '', ages3to4: '', ages5to11: '', ages12to18: '' }, isaAsOfDate: '', pensionAsOfDate: '' }
}
export function newDocument(): AppDocument {
  return { version: 1, step: 0, completed: false, moneyBasis: { currency: 'GBP', priceYear: 2026, terms: 'real' }, balanceDatesReviewed: true,
    snapshot: { name: '', people: [], cash: [], noCash: false, housing: '', homeValue: '', homeOwners: [], mortgageStatus: '', mortgageBalance: '', rate: '', term: '', borrowers: [], spending: '', spendingFrequency: 'month', planningStartDate: new Date().toISOString().slice(0, 10), homeAsOfDate: '', mortgageAsOfDate: '' },
    planning: structuredClone(defaultPlanning), tax: structuredClone(defaultTax),
    mortgageExtras: { monthlyOverpayment: defaultMortgage.monthlyOverpayment, inflation: defaultMortgage.inflation, refinances: [] },
    moves: [], allowances: {}, incomeTimeline: null, childEvents: [], spendingEvents: [], purchaseEvents: [], budget: defaultMonthlyBudget() }
}
export function amount(raw: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null
  const n = Number(raw)
  return Number.isFinite(n) && n <= Number.MAX_SAFE_INTEGER / 100 ? n : null
}
export function annual(raw: string, frequency: Frequency): number | null {
  const n = amount(raw); return n === null ? null : n * (frequency === 'month' ? 12 : 1)
}
export function annualIncome(p: SetupPerson): number | null {
  if (p.incomeKind === 'none') return 0
  if (!p.incomeKind) return null
  if (p.payOverride) return amount(p.payOverride)
  if (p.incomeKind === 'paye') return annual(p.pay, p.frequency)
  return amount(p.pay) !== null && amount(p.days) !== null ? Number(p.pay) * Number(p.days) : null
}
export function validDOB(dob: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false
  const date = new Date(`${dob}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dob
    && dob <= `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    && today.getFullYear() - date.getUTCFullYear() <= 120
}
export function validISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function ageOn(dob: string, date = new Date()): number {
  const [year, month, day] = dob.split('-').map(Number)
  return date.getFullYear() - year! - (date.getMonth() + 1 < month! || (date.getMonth() + 1 === month && date.getDate() < day!) ? 1 : 0)
}
export function householdErrors(s: SetupSnapshot): string[] {
  const errors: string[] = []
  if (!s.name.trim()) errors.push('Enter a household name.')
  if (!s.people.some(p => p.role !== 'child')) errors.push('Add at least one adult.')
  if (s.people.some(p => !p.name.trim() || !validDOB(p.dob))) errors.push('Each person needs a name and a valid date of birth that is not in the future.')
  if (s.people.some(p => p.role !== 'child' && validDOB(p.dob) && ageOn(p.dob) < 18)) errors.push('Adults must be at least 18. Add younger people as children.')
  return errors
}
export function currentBand(p: SetupPerson, date = new Date().toISOString().slice(0, 10)): AgeBand | undefined {
  const year = Number(date.slice(0, 4)); const [dobYear, dobMonth, dobDay] = p.dob.split('-').map(Number)
  const age = year - dobYear! - (date.slice(5) < `${String(dobMonth).padStart(2, '0')}-${String(dobDay).padStart(2, '0')}` ? 1 : 0)
  return age < 0 ? undefined : ageBands.find(b => age <= b.end)?.key
}
function knownBalance(status: string, value: string): number | null { return status === 'none' ? 0 : status === '' ? null : amount(value) }
export function snapshotTotals(s: SetupSnapshot) {
  const adults = s.people.filter(p => p.role !== 'child')
  const pension = adults.map(p => knownBalance(p.pensionStatus, p.pension))
  const isa = adults.map(p => knownBalance(p.isaType, p.isa))
  const cash = s.noCash ? [0] : s.cash.length ? s.cash.map(c => amount(c.balance)) : [null]
  const house = s.housing === 'own' ? amount(s.homeValue) : s.housing ? 0 : null
  const mortgage = s.housing === 'own' ? knownBalance(s.mortgageStatus, s.mortgageBalance) : s.housing ? 0 : null
  const allAssets = [...pension, ...isa, ...cash, house]
  const sum = (values: (number | null)[]) => values.reduce<number>((n, v) => n + (v ?? 0), 0)
  return { pension: pension.every(v => v !== null) ? sum(pension) : null, isa: isa.every(v => v !== null) ? sum(isa) : null,
    cash: cash.every(v => v !== null) ? sum(cash) : null, house, mortgage,
    knownAssets: sum(allAssets), assets: allAssets.every(v => v !== null) ? sum(allAssets) : null,
    netWorth: allAssets.every(v => v !== null) && mortgage !== null ? sum(allAssets) - mortgage : null }
}
export function missingDetails(s: SetupSnapshot, future = false, planningDate = new Date().toISOString().slice(0, 10)): { label: string; step: number }[] {
  const missing: { label: string; step: number }[] = []
  const add = (label: string, step: number) => missing.push({ label, step })
  const adults = s.people.filter(p => p.role !== 'child'); const ownerIds = adults.map(p => p.id)
  for (const p of adults) {
    if (!p.incomeKind || (p.incomeKind !== 'none' && (amount(p.pay) === null || (p.payOverride !== '' && amount(p.payOverride) === null)))) add(`${p.name}: current income`, 2)
    if (p.incomeKind === 'inside-ir35' && (amount(p.days) === null || !Number.isInteger(Number(p.days)) || Number(p.days) > 366)) add(`${p.name}: billable days (0–366)`, 2)
    if (knownBalance(p.pensionStatus, p.pension) === null) add(`${p.name}: pension balance or no pension`, 3)
    if (p.pensionStatus === 'yes' && p.incomeKind && p.incomeKind !== 'none' &&
      ([p.employee, p.employer].some(v => amount(v) === null || Number(v) > 100) || !p.treatment)) add(`${p.name}: pension contributions and method`, 3)
    if (knownBalance(p.isaType, p.isa) === null) add(`${p.name}: ISA balance or no ISA`, 4)
  }
  if (!s.noCash && !s.cash.length) add('Cash balance or no cash', 4)
  for (const c of s.cash) if (!s.noCash && (amount(c.balance) === null || !c.ownerIds.length || c.ownerIds.some(id => !ownerIds.includes(id)))) add(`${c.name || 'Cash'}: balance and owner`, 4)
  if (!s.housing) add('Housing situation', 5)
  if (s.housing === 'own') {
    if (amount(s.homeValue) === null || !s.homeOwners.length || s.homeOwners.some(id => !ownerIds.includes(id))) add('Home value and owner', 5)
    if (!s.mortgageStatus || (s.mortgageStatus === 'yes' && (amount(s.mortgageBalance) === null || !s.borrowers.length || s.borrowers.some(id => !ownerIds.includes(id))))) add('Mortgage balance and borrower, or no mortgage', 5)
    if (s.mortgageStatus === 'yes' && (amount(s.rate) === null || Number(s.rate) > 100 || amount(s.term) === null || !Number.isInteger(Number(s.term)) || Number(s.term) < 1 || Number(s.term) > 50)) add('Mortgage rate and remaining term', 5)
  }
  if (annual(s.spending, s.spendingFrequency) === null) add('Regular living costs', 6)
  for (const p of s.people.filter(p => p.role === 'child')) {
    if (amount(p.childCost) === null) add(`${p.name}: current child costs`, 6)
    if (future) {
      const band = currentBand(p, planningDate); const index = ageBands.findIndex(b => b.key === band)
      for (const b of ageBands.slice(index < 0 ? ageBands.length : index + 1)) if (amount(p.futureCosts[b.key]) === null) add(`${p.name}: ${b.label} future annual costs`, 9)
    }
  }
  return missing
}
export function isPersonLinked(s: SetupSnapshot, id: string): boolean {
  const p = s.people.find(p => p.id === id)
  return !!p && ((p.incomeKind !== '' && p.incomeKind !== 'none') || p.pensionStatus === 'yes' || (p.isaType !== '' && p.isaType !== 'none')
    || (!s.noCash && s.cash.some(c => c.ownerIds.includes(id))) || (s.housing === 'own' && (s.homeOwners.includes(id) || (s.mortgageStatus === 'yes' && s.borrowers.includes(id)))))
}
/** Unknown values cannot enter the numerical engine. Children are kept out of the adult model. */
export function toForecastInput(doc: AppDocument): ForecastInput {
  const purchaseError = validatePurchases(doc.purchaseEvents)
  if (purchaseError) throw new Error(purchaseError)
  const missing = [...householdErrors(doc.snapshot), ...missingDetails(doc.snapshot, true, doc.snapshot.planningStartDate).map(m => m.label)]
  if (missing.length) throw new Error(`Complete these details: ${missing.join('; ')}`)
  const s = doc.snapshot; const adults = s.people.filter(p => p.role !== 'child')
  if (![...s.people.flatMap(p => [p.isaAsOfDate, p.pensionAsOfDate]), ...s.cash.map(c => c.asOfDate), s.homeAsOfDate, s.mortgageAsOfDate].every(date => !date || validISODate(date))) throw new Error('Balance observation dates must be valid calendar dates.')
  const startDate = s.planningStartDate
  if (!validISODate(startDate)) throw new Error('Enter a valid planning start date.')
  const startYear = Number(startDate.slice(0, 4))
  const endYear = Math.max(...adults.map(p => Number(p.dob.slice(0, 4)))) + doc.planning.horizonAge + 1
  const household: ForecastInput['household'] = { id: 'my-household', name: s.name, people: adults.map(p => ({ id: p.id, name: p.name, birthYear: Number(p.dob.slice(0, 4)), targetFireAge: null })),
    isas: adults.filter(p => p.isaType !== 'none').map(p => ({ id: `isa-${p.id}`, name: `${p.name} ISA`, kind: 'isa', isaType: p.isaType as 'cash' | 'stocks-and-shares', ownerIds: [p.id], value: amount(p.isa)!, asOfDate: validISODate(p.isaAsOfDate) ? p.isaAsOfDate : null })),
    pensions: adults.filter(p => p.pensionStatus === 'yes').map(p => ({ id: `pension-${p.id}`, name: `${p.name} pension`, kind: 'pension', ownerIds: [p.id], value: amount(p.pension)!, accessAge: null, asOfDate: validISODate(p.pensionAsOfDate) ? p.pensionAsOfDate : null })),
    properties: s.housing === 'own' ? [{ id: 'home', name: 'Current home', kind: 'property', use: 'primary-residence', ownerIds: s.homeOwners, value: amount(s.homeValue)!, asOfDate: validISODate(s.homeAsOfDate) ? s.homeAsOfDate : null }] : [],
    mortgages: s.housing === 'own' && s.mortgageStatus === 'yes' ? [{ id: 'mortgage', propertyId: 'home', borrowerIds: s.borrowers, balance: amount(s.mortgageBalance)!, asOfDate: validISODate(s.mortgageAsOfDate) ? s.mortgageAsOfDate : null, annualInterestRate: amount(s.rate)! / 100, endYear: startYear + Number(s.term) }] : [],
    cash: s.noCash ? [] : s.cash.map(c => ({ id: c.id, name: c.name || 'Cash', kind: 'cash', ownerIds: c.ownerIds, value: amount(c.balance)!, asOfDate: validISODate(c.asOfDate) ? c.asOfDate : null })), events: [],
    assumptions: { startYear, startDate, endYear, moneyBasis: doc.moneyBasis, annualRealReturns: { investments: doc.planning.equityReturn, property: doc.planning.houseGrowth, cash: 0 } } }
  const income = doc.incomeTimeline ?? adults.filter(p => p.incomeKind !== 'none').map(p => ({ id: `income-${p.id}`, personId: p.id, kind: p.incomeKind as 'paye' | 'inside-ir35',
    startYear, endYear, annualSalary: annual(p.pay, p.frequency)!, dayRate: amount(p.pay)!, billableDays: Number(p.days), workingFraction: 1, annualGrossOverride: p.payOverride ? amount(p.payOverride) : null,
    contributions: { employeeRate: p.pensionStatus === 'yes' ? Number(p.employee) / 100 : 0, employerRate: p.pensionStatus === 'yes' ? Number(p.employer) / 100 : 0, treatment: (p.treatment || 'salary-sacrifice') as PensionContributions['treatment'], continueAfterFire: false } }))
  return { household, planning: doc.planning, tax: doc.tax, income, moneyBasis: doc.moneyBasis,
    spending: { baseline: annual(s.spending, s.spendingFrequency)!, events: [...doc.spendingEvents, ...purchaseSpending(doc.purchaseEvents)] },
    children: s.people.filter(p => p.role === 'child').map<ChildEvent>(p => ({ id: p.id, birthYear: Number(p.dob.slice(0, 4)), enabled: true, birthCost: 0,
      costs: Object.fromEntries(ageBands.map(b => [b.key, b.key === currentBand(p, startDate) ? annual(p.childCost, p.childFrequency)! : amount(p.futureCosts[b.key]) ?? 0])) as Record<AgeBand, number>, workAdjustments: [] })).concat(doc.childEvents),
    mortgage: { ...doc.mortgageExtras, annualRate: s.housing === 'own' && s.mortgageStatus === 'yes' ? Number(s.rate) / 100 : null, termYears: s.housing === 'own' && s.mortgageStatus === 'yes' ? Number(s.term) : null },
    moves: doc.moves.map(pricedPropertyMove), allowances: Object.fromEntries(adults.map(p => [p.id, doc.allowances[p.id] ?? 20000])) }
}

/** Retain future timeline edits when editing people; reconcile only changed current earnings. */
export function withSnapshot(d: AppDocument, snapshot: SetupSnapshot): AppDocument {
  if (d.incomeTimeline === null) return { ...d, snapshot }
  const adults = snapshot.people.filter(p => p.role !== 'child')
  let timeline = d.incomeTimeline.filter(i => adults.some(p => p.id === i.personId))
  const fields = ['incomeKind', 'pay', 'frequency', 'days', 'payOverride', 'pensionStatus', 'employee', 'employer', 'treatment'] as const
  for (const p of adults) {
    const previous = d.snapshot.people.find(old => old.id === p.id)
    if (previous && fields.every(key => previous[key] === p[key])) continue
    if (missingDetails({ ...snapshot, people: [p] }).some(m => m.step === 2 || m.step === 3)) continue
    const startYear = Number(d.snapshot.planningStartDate.slice(0, 4))
    const current = timeline.find(i => i.personId === p.id && i.startYear <= startYear && i.endYear > startYear)
    timeline = timeline.filter(i => i !== current)
    if (p.incomeKind === 'none' || !p.incomeKind) continue
    const horizon = Math.max(...adults.map(person => Number(person.dob.slice(0, 4)))) + d.planning.horizonAge + 1
    const nextJob = Math.min(horizon, ...timeline.filter(i => i.personId === p.id && i.startYear > startYear).map(i => i.startYear))
    timeline.push({ id: current?.id ?? `income-${p.id}`, personId: p.id, kind: p.incomeKind, startYear: current?.startYear ?? startYear, endYear: current?.endYear ?? nextJob,
      annualSalary: annual(p.pay, p.frequency) ?? 0, dayRate: amount(p.pay) ?? 0, billableDays: Number(p.days) || 0, workingFraction: 1, annualGrossOverride: p.payOverride ? amount(p.payOverride) : null,
      contributions: { employeeRate: p.pensionStatus === 'yes' ? Number(p.employee) / 100 : 0, employerRate: p.pensionStatus === 'yes' ? Number(p.employer) / 100 : 0, treatment: p.treatment || 'salary-sacrifice', continueAfterFire: current?.contributions?.continueAfterFire ?? false } })
  }
  return { ...d, snapshot, incomeTimeline: timeline }
}

/** Validate every persisted field by its default shape before restoring it. */
function hasShape(value: unknown, template: unknown): boolean {
  if (template === null) return value === null || typeof value === 'number' || typeof value === 'string'
  if (Array.isArray(template)) return Array.isArray(value)
  if (typeof template === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.entries(template).every(([key, sample]) => hasShape((value as Record<string, unknown>)[key], sample))
  return typeof value === typeof template && (typeof value !== 'number' || Number.isFinite(value))
}
export function decodeDocument(raw: string): AppDocument | null {
  try {
    const parsed: unknown = JSON.parse(raw); const base = newDocument()
    let v: unknown = parsed
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const data = parsed as Record<string, unknown>
      const moves = Array.isArray(data.moves) ? data.moves.map((rawMove: unknown) => {
          if (!rawMove || typeof rawMove !== 'object' || Array.isArray(rawMove)) return rawMove
          const move = rawMove as Record<string, unknown>
          const price = typeof move.purchasePrice === 'number' ? move.purchasePrice : 0
          const rateFor = (amountKey: string, rateKey: string) => typeof move[rateKey] === 'number'
            ? move[rateKey] : price > 0 && typeof move[amountKey] === 'number' ? (move[amountKey] as number) / price : 0
          return { ...move, agentFeeRate: rateFor('agentFees', 'agentFeeRate'),
            legalFeeRate: rateFor('legalFees', 'legalFeeRate'), renovationRate: rateFor('renovation', 'renovationRate') }
        }) : data.moves
      const rawSnapshot = data.snapshot && typeof data.snapshot === 'object' ? data.snapshot as Record<string, unknown> : {}
      const year = typeof rawSnapshot.planningStartDate === 'string' && /^\d{4}/.test(rawSnapshot.planningStartDate) ? rawSnapshot.planningStartDate.slice(0, 4) : '2026'
      const snapshot = { ...rawSnapshot, planningStartDate: typeof rawSnapshot.planningStartDate === 'string' ? rawSnapshot.planningStartDate : `${year}-01-01`,
        homeAsOfDate: typeof rawSnapshot.homeAsOfDate === 'string' ? rawSnapshot.homeAsOfDate : '', mortgageAsOfDate: typeof rawSnapshot.mortgageAsOfDate === 'string' ? rawSnapshot.mortgageAsOfDate : '',
        people: Array.isArray(rawSnapshot.people) ? rawSnapshot.people.map(p => p && typeof p === 'object' ? { ...(p as object), isaAsOfDate: (p as SetupPerson).isaAsOfDate ?? '', pensionAsOfDate: (p as SetupPerson).pensionAsOfDate ?? '' } : p) : rawSnapshot.people,
        cash: Array.isArray(rawSnapshot.cash) ? rawSnapshot.cash.map(c => c && typeof c === 'object' ? { ...(c as object), asOfDate: (c as CashEntry).asOfDate ?? '' } : c) : rawSnapshot.cash }
      const moneyBasis = data.moneyBasis ?? { currency: 'GBP', priceYear: 2026, terms: 'real' }
      const balanceDatesReviewed = typeof data.balanceDatesReviewed === 'boolean' ? data.balanceDatesReviewed : !['homeAsOfDate', 'mortgageAsOfDate'].some(key => !(key in rawSnapshot))
        && Array.isArray(rawSnapshot.people) && rawSnapshot.people.every(p => !p || typeof p !== 'object' || ('isaAsOfDate' in p && 'pensionAsOfDate' in p))
        && Array.isArray(rawSnapshot.cash) && rawSnapshot.cash.every(c => !c || typeof c !== 'object' || 'asOfDate' in c)
      v = { ...base, ...data, snapshot, moneyBasis, balanceDatesReviewed, purchaseEvents: 'purchaseEvents' in data ? data.purchaseEvents : [], moves, budget: data.budget ?? defaultMonthlyBudget() }
    }
    if ((!hasShape(v, { ...base, incomeTimeline: [] }) && !hasShape(v, base)) || !validMonthlyBudget((v as AppDocument).budget)) return null
    const d = v as AppDocument
    const enums = (value: string, options: string[]) => options.includes(value)
    if (d.version !== 1 || !Number.isInteger(d.step) || d.step < 0 || d.step >= setupSteps.length || !validISODate(d.snapshot.planningStartDate) || d.moneyBasis.currency !== 'GBP' || d.moneyBasis.terms !== 'real' || !Number.isInteger(d.moneyBasis.priceYear) || d.moneyBasis.priceYear < 1900 || d.moneyBasis.priceYear > 9999) return null
    if (!d.snapshot.people.every(p => hasShape(p, emptyPerson()) && enums(p.role, ['you', 'partner', 'adult', 'child']) && enums(p.incomeKind, ['', 'paye', 'inside-ir35', 'none'])
      && enums(p.frequency, ['month', 'year']) && enums(p.childFrequency, ['month', 'year']) && enums(p.pensionStatus, ['', 'yes', 'none']) && enums(p.isaType, ['', 'cash', 'stocks-and-shares', 'none'])
      && enums(p.treatment, ['', 'salary-sacrifice', 'net-pay', 'relief-at-source']))) return null
    if (new Set(d.snapshot.people.map(p => p.id)).size !== d.snapshot.people.length || d.snapshot.people.some(p => !p.id)) return null
    if (!d.snapshot.cash.every(c => hasShape(c, { id: '', name: '', balance: '', ownerIds: [], asOfDate: '' }) && c.ownerIds.every(id => typeof id === 'string') && (!c.asOfDate || validISODate(c.asOfDate)))) return null
    if (!d.snapshot.people.every(p => (!p.isaAsOfDate || validISODate(p.isaAsOfDate)) && (!p.pensionAsOfDate || validISODate(p.pensionAsOfDate))) || ![d.snapshot.homeAsOfDate, d.snapshot.mortgageAsOfDate].every(date => !date || validISODate(date))) return null
    if (!d.snapshot.homeOwners.every(id => typeof id === 'string') || !d.snapshot.borrowers.every(id => typeof id === 'string')) return null
    if (!enums(d.snapshot.housing, ['', 'own', 'rent', 'none']) || !enums(d.snapshot.mortgageStatus, ['', 'yes', 'none']) || !enums(d.snapshot.spendingFrequency, ['month', 'year'])) return null
    if (!d.tax.incomeTaxBands.every(b => hasShape(b, { upTo: 0, rate: 0 }) || hasShape(b, { upTo: null, rate: 0 })) || !d.tax.employeeNIBands.every(b => hasShape(b, { upTo: 0, rate: 0 }) || hasShape(b, { upTo: null, rate: 0 }))) return null
    if (!Object.values(d.allowances).every(n => typeof n === 'number' && Number.isFinite(n))) return null
    const period = { id: '', personId: '', kind: '', startYear: 0, endYear: 0, annualSalary: 0, dayRate: 0, billableDays: 0, workingFraction: 0 }
    if (d.incomeTimeline !== null && (!d.incomeTimeline.every(i => hasShape(i, period) && (i.annualGrossOverride === null || typeof i.annualGrossOverride === 'number')
      && (!i.contributions || hasShape(i.contributions, { employeeRate: 0, employerRate: 0, treatment: '', continueAfterFire: false }))) || validateIncome(d.incomeTimeline))) return null
    if (!d.mortgageExtras.refinances.every(r => hasShape(r, { id: '', year: 0, annualRate: 0, termYears: 0, enabled: false }))) return null
    if (!d.childEvents.every(c => (c.name === undefined || typeof c.name === 'string') && hasShape(c, { id: '', birthYear: 0, enabled: false, birthCost: 0, costs: { ages0to2: 0, ages3to4: 0, ages5to11: 0, ages12to18: 0 }, workAdjustments: [] })
      && c.workAdjustments.every(a => hasShape(a, { id: '', personId: '', startYear: 0, endYear: 0, workingFraction: 0 }) && (a.annualGrossOverride === null || typeof a.annualGrossOverride === 'number')))) return null
    if (!d.moves.every(m => hasShape(m, { id: '', name: '', year: 0, enabled: false, purchasePrice: 0, stampDuty: 0, agentFees: 0, legalFees: 0, movingCosts: 0, renovation: 0, agentFeeRate: 0, legalFeeRate: 0, renovationRate: 0 }) && [m.saleValue, m.annualRate, m.termYears].every(n => n === null || (typeof n === 'number' && Number.isFinite(n))))) return null
    if (!d.spendingEvents.every(e => hasShape(e, { id: '', name: '', startYear: 0, endYear: 0, annualChange: 0, enabled: false }))) return null
    if (!d.purchaseEvents.every(p => hasShape(p, { id: '', name: '', preset: '', enabled: false, year: 0, upfrontCost: 0 })
      && (p.recurring === null || hasShape(p.recurring, { annualCost: 0, startYear: 0, endYear: 0 }))) || validatePurchases(d.purchaseEvents)) return null
    if (validatePlanning(d.planning) || validateTaxRules(d.tax) || validateMortgagePlan({ ...d.mortgageExtras, annualRate: null, termYears: null }) || validateMoves(d.moves) || validateChildren(d.childEvents) || validateSpending({ baseline: annual(d.snapshot.spending, d.snapshot.spendingFrequency) ?? 0, events: [...d.spendingEvents, ...purchaseSpending(d.purchaseEvents)] })) return null
    return d
  } catch { return null }
}

/** Version 2 is the persisted canonical record envelope. AppDocument remains a
 * short-lived editor projection while the screens move onto shared records. */
export interface HouseholdDocumentV2 {
  version: 2
  workflow: { step: number; completed: boolean }
  household: { id: string; name: string; moneyBasis: AppDocument['moneyBasis']; planningStartDate: string; housing: SetupSnapshot['housing']; noCash: boolean; mortgageStatus: SetupSnapshot['mortgageStatus']; mortgageRate: string; mortgageTerm: string }
  people: Array<{ id: string; householdId: string; name: string; dateOfBirth: string; role: SetupPerson['role']; setup: Omit<SetupPerson, 'id' | 'name' | 'dob' | 'role' | 'incomeKind' | 'pay' | 'frequency' | 'days' | 'payOverride' | 'employee' | 'employer' | 'treatment' | 'pension' | 'isa' | 'isaAsOfDate' | 'pensionAsOfDate'> }>
  accounts: Array<{ id: string; householdId: string; name: string; classification: 'asset' | 'liability'; kind: 'cash' | 'cashISA' | 'investmentISA' | 'pension' | 'property' | 'mortgage'; ownerPersonIds: string[]; borrowerPersonIds: string[]; propertyId?: string; balanceId: string }>
  balances: Array<{ id: string; accountId: string; amountMinor: number | null; draftValue?: string; asOfDate: string | null; basis: 'user-entered' }>
  earnings: { timelineMode: 'snapshot' | 'timeline'; snapshotInputs: Record<string, Pick<SetupPerson, 'incomeKind' | 'pay' | 'frequency' | 'days' | 'payOverride' | 'employee' | 'employer' | 'treatment'>>; periods: IncomePeriod[] }
  planning: ReturnAssumptions
  tax: TaxRules
  mortgageExtras: AppDocument['mortgageExtras']
  spending: { amountMinor: number | null; draftValue?: string; frequency: Frequency }
  childEvents: ChildEvent[]
  spendingEvents: SpendingEvent[]
  purchaseEvents: PurchaseEvent[]
  moves: PropertyMove[]
  allowances: Record<string, number>
  migration: { fromVersion: number | null; gaps: string[] }
  budget?: MonthlyBudget
}

function toMinor(raw: string): number | null {
  const value = amount(raw)
  return value === null ? null : Math.round(value * 100)
}
function fromMinor(value: number | null): string {
  return value === null ? '' : (value / 100).toFixed(2).replace(/\.00$/, '')
}
function stableId(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '_') }
export function missingOpeningBalanceDates(document: AppDocument): string[] {
  const s = document.snapshot; const gaps: string[] = []
  for (const p of s.people) {
    if (p.isaType !== '' && p.isaType !== 'none' && p.isa !== '' && !validISODate(p.isaAsOfDate)) gaps.push(`ISA for ${p.name || 'unnamed person'}`)
    if (p.pensionStatus === 'yes' && p.pension !== '' && !validISODate(p.pensionAsOfDate)) gaps.push(`Pension for ${p.name || 'unnamed person'}`)
  }
  for (const c of s.cash) if (c.balance !== '' && !validISODate(c.asOfDate)) gaps.push(c.name || 'Cash account')
  if (s.housing === 'own' && s.homeValue !== '' && !validISODate(s.homeAsOfDate)) gaps.push('Home value')
  if (s.housing === 'own' && s.mortgageStatus === 'yes' && s.mortgageBalance !== '' && !validISODate(s.mortgageAsOfDate)) gaps.push('Mortgage balance')
  return gaps
}

export function encodeDocument(document: AppDocument): HouseholdDocumentV2 {
  const s = document.snapshot; const householdId = 'household'
  const editorOnly = new Set(['id', 'name', 'dob', 'role', 'incomeKind', 'pay', 'frequency', 'days', 'payOverride', 'employee', 'employer', 'treatment', 'pension', 'isa', 'isaAsOfDate', 'pensionAsOfDate'])
  const people = s.people.map(p => ({ id: p.id, householdId, name: p.name, dateOfBirth: p.dob, role: p.role,
    setup: Object.fromEntries(Object.entries(p).filter(([key]) => !editorOnly.has(key))) as HouseholdDocumentV2['people'][number]['setup'] }))
  const accounts: HouseholdDocumentV2['accounts'] = []; const balances: HouseholdDocumentV2['balances'] = []
  const addBalance = (id: string, label: string, kind: HouseholdDocumentV2['accounts'][number]['kind'], raw: string, owners: string[], date: string, status = 'yes', classification: 'asset' | 'liability' = 'asset', borrowers: string[] = [], propertyId?: string) => {
    if (status !== 'yes') return
    const balanceId = `${id}-opening-balance`
    accounts.push({ id, householdId, name: label, classification, kind, ownerPersonIds: owners, borrowerPersonIds: borrowers, ...(propertyId ? { propertyId } : {}), balanceId })
    balances.push({ id: balanceId, accountId: id, amountMinor: toMinor(raw), ...(raw && toMinor(raw) === null ? { draftValue: raw } : {}), asOfDate: date || null, basis: 'user-entered' })
  }
  for (const p of s.people.filter(person => person.role !== 'child')) {
    addBalance(`isa-${stableId(p.id)}`, `${p.name} ISA`, p.isaType === 'cash' ? 'cashISA' : 'investmentISA', p.isa, [p.id], p.isaAsOfDate, p.isaType === '' ? '' : p.isaType === 'none' ? 'none' : 'yes')
    addBalance(`pension-${stableId(p.id)}`, `${p.name} pension`, 'pension', p.pension, [p.id], p.pensionAsOfDate, p.pensionStatus)
  }
  if (!s.noCash) for (const cash of s.cash) addBalance(cash.id, cash.name || 'Cash', 'cash', cash.balance, cash.ownerIds, cash.asOfDate)
  if (s.housing === 'own') {
    addBalance('home', 'Current home', 'property', s.homeValue, s.homeOwners, s.homeAsOfDate)
    addBalance('mortgage', 'Mortgage', 'mortgage', s.mortgageBalance, [], s.mortgageAsOfDate, s.mortgageStatus, 'liability', s.borrowers, 'home')
  }
  const startYear = Number(s.planningStartDate.slice(0, 4))
  const timeline = document.incomeTimeline
  const derived = s.people.filter(p => p.role !== 'child' && p.incomeKind && p.incomeKind !== 'none').map(p => ({ id: `income-${p.id}`, personId: p.id, kind: p.incomeKind as 'paye' | 'inside-ir35', startYear, endYear: startYear + document.planning.horizonAge + 1,
    annualSalary: annual(p.pay, p.frequency) ?? 0, dayRate: amount(p.pay) ?? 0, billableDays: Number(p.days) || 0, workingFraction: 1, annualGrossOverride: p.payOverride ? amount(p.payOverride) : null,
    contributions: { employeeRate: p.pensionStatus === 'yes' ? Number(p.employee) / 100 : 0, employerRate: p.pensionStatus === 'yes' ? Number(p.employer) / 100 : 0, treatment: (p.treatment || 'salary-sacrifice') as PensionContributions['treatment'], continueAfterFire: false } }))
  const future = timeline?.filter(period => period.startYear > startYear) ?? []
  const periods = timeline === null ? derived : [...derived.map(period => ({ ...period, endYear: Math.min(period.endYear, ...future.filter(next => next.personId === period.personId).map(next => next.startYear), period.endYear) })), ...future]
  return { version: 2, workflow: { step: document.step, completed: document.completed }, household: { id: householdId, name: s.name, moneyBasis: document.moneyBasis, planningStartDate: s.planningStartDate, housing: s.housing, noCash: s.noCash, mortgageStatus: s.mortgageStatus, mortgageRate: s.rate, mortgageTerm: s.term }, people, accounts, balances,
    earnings: { timelineMode: timeline === null ? 'snapshot' : 'timeline', snapshotInputs: Object.fromEntries(s.people.map(p => [p.id, { incomeKind: p.incomeKind, pay: p.pay, frequency: p.frequency, days: p.days, payOverride: p.payOverride, employee: p.employee, employer: p.employer, treatment: p.treatment }])), periods: timeline === null ? [] : periods.filter(period => period.startYear > startYear) }, planning: document.planning, tax: document.tax, mortgageExtras: document.mortgageExtras,
    spending: { amountMinor: toMinor(s.spending), ...(s.spending && toMinor(s.spending) === null ? { draftValue: s.spending } : {}), frequency: s.spendingFrequency }, childEvents: document.childEvents, spendingEvents: document.spendingEvents, purchaseEvents: document.purchaseEvents, moves: document.moves, allowances: document.allowances,
    budget: document.budget, migration: { fromVersion: document.migration?.fromVersion ?? null, gaps: document.balanceDatesReviewed ? [] : missingOpeningBalanceDates(document) } }
}

export function projectDocumentV2(v2: HouseholdDocumentV2): AppDocument {
  const base = newDocument(); const balanceByAccount = new Map(v2.balances.map(balance => [balance.accountId, balance]))
  const value = (id: string) => { const balance = balanceByAccount.get(id); return balance ? balance.draftValue ?? fromMinor(balance.amountMinor) : '' }
  const date = (id: string) => balanceByAccount.get(id)?.asOfDate ?? ''
  const people: SetupPerson[] = v2.people.map(p => {
    const setup = p.setup
    const isa = v2.accounts.find(a => a.id === `isa-${stableId(p.id)}`)
    const pension = v2.accounts.find(a => a.id === `pension-${stableId(p.id)}`)
    const defaults = emptyPerson(p.role)
    return { ...defaults, ...setup, ...v2.earnings.snapshotInputs[p.id], id: p.id, name: p.name, dob: p.dateOfBirth, role: p.role,
      isa: value(isa?.id ?? ''), isaAsOfDate: date(isa?.id ?? ''), pension: value(pension?.id ?? ''), pensionAsOfDate: date(pension?.id ?? '') }
  })
  const cash = v2.accounts.filter(a => a.kind === 'cash').map(a => ({ id: a.id, name: a.name, balance: value(a.id), ownerIds: a.ownerPersonIds, asOfDate: date(a.id) }))
  const snapshot: SetupSnapshot = { ...base.snapshot, name: v2.household.name, people, cash, noCash: v2.household.noCash, housing: v2.household.housing,
    homeValue: value('home'), homeOwners: accountById(v2, 'home')?.ownerPersonIds ?? [], mortgageStatus: v2.household.mortgageStatus, mortgageBalance: value('mortgage'), rate: v2.household.mortgageRate, term: v2.household.mortgageTerm, borrowers: accountById(v2, 'mortgage')?.borrowerPersonIds ?? [],
    spending: v2.spending.draftValue ?? fromMinor(v2.spending.amountMinor), spendingFrequency: v2.spending.frequency, planningStartDate: v2.household.planningStartDate,
    homeAsOfDate: date('home'), mortgageAsOfDate: date('mortgage') }
  const startYear = Number(snapshot.planningStartDate.slice(0, 4))
  const currentPeriods = people.filter(p => p.role !== 'child' && p.incomeKind && p.incomeKind !== 'none').map(p => ({ id: `income-${p.id}`, personId: p.id, kind: p.incomeKind as 'paye' | 'inside-ir35', startYear, endYear: Math.min(startYear + v2.planning.horizonAge + 1, ...v2.earnings.periods.filter(period => period.personId === p.id && period.startYear > startYear).map(period => period.startYear), startYear + v2.planning.horizonAge + 1),
    annualSalary: annual(p.pay, p.frequency) ?? 0, dayRate: amount(p.pay) ?? 0, billableDays: Number(p.days) || 0, workingFraction: 1, annualGrossOverride: p.payOverride ? amount(p.payOverride) : null,
    contributions: { employeeRate: p.pensionStatus === 'yes' ? Number(p.employee) / 100 : 0, employerRate: p.pensionStatus === 'yes' ? Number(p.employer) / 100 : 0, treatment: (p.treatment || 'salary-sacrifice') as PensionContributions['treatment'], continueAfterFire: false } }))
  const timeline = v2.earnings.timelineMode === 'snapshot' ? null : [...currentPeriods, ...v2.earnings.periods]
  return { ...base, version: 1, step: v2.workflow.step, completed: v2.workflow.completed, snapshot, moneyBasis: v2.household.moneyBasis, balanceDatesReviewed: v2.migration.gaps.length === 0, migration: v2.migration, budget: v2.budget ?? defaultMonthlyBudget(),
    planning: v2.planning, tax: v2.tax, mortgageExtras: v2.mortgageExtras, moves: v2.moves, allowances: v2.allowances, incomeTimeline: timeline,
    childEvents: v2.childEvents, spendingEvents: v2.spendingEvents, purchaseEvents: v2.purchaseEvents }
}
function accountById(document: HouseholdDocumentV2, id: string) { return document.accounts.find(account => account.id === id) }

export type PersistedDocumentResult = { document: AppDocument; sourceVersion: number; original: string; needsMigration: boolean; missingDates: string[] } | { error: string; original: string }
export function decodePersistedDocument(raw: string): PersistedDocumentResult {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (parsed?.version === 2) {
      const d = parsed as HouseholdDocumentV2
      const example = encodeDocument(newDocument())
      const legacyExample = structuredClone(example)
      delete legacyExample.budget
      // Shape checking treats null as a literal null, while these values are
      // intentionally nullable in persisted records.
      example.spending.amountMinor = null
      const setupTemplate = Object.fromEntries(Object.entries(emptyPerson()).filter(([key]) => !['id', 'name', 'dob', 'role', 'incomeKind', 'pay', 'frequency', 'days', 'payOverride', 'employee', 'employer', 'treatment', 'pension', 'isa', 'isaAsOfDate', 'pensionAsOfDate'].includes(key)))
      const earningTemplate = { incomeKind: '', pay: '', frequency: 'year', days: '', payOverride: '', employee: '', employer: '', treatment: '' }
      const rootShape = hasShape(d, example) || (!('budget' in d) && hasShape(d, legacyExample))
      const peopleShape = d.people.every(p => hasShape(p, { id: '', householdId: '', name: '', dateOfBirth: '', role: 'adult', setup: setupTemplate }) && p.householdId === d.household.id)
      const accountShape = d.accounts.every(a => hasShape(a, { id: '', householdId: '', name: '', classification: 'asset', kind: 'cash', ownerPersonIds: [], borrowerPersonIds: [], balanceId: '' }) && a.householdId === d.household.id)
      const balanceShape = d.balances.every(b => typeof b.id === 'string' && typeof b.accountId === 'string' && (b.amountMinor === null || typeof b.amountMinor === 'number') && (b.draftValue === undefined || typeof b.draftValue === 'string') && (b.asOfDate === null || typeof b.asOfDate === 'string') && b.basis === 'user-entered')
      const earningsShape = !!d.earnings?.snapshotInputs && Object.values(d.earnings.snapshotInputs).every(input => hasShape(input, earningTemplate))
      if (!rootShape || !peopleShape || !accountShape || !balanceShape || !earningsShape) return { error: `The saved version 2 document is incomplete (${[rootShape, peopleShape, accountShape, balanceShape, earningsShape].map(ok => ok ? 'ok' : 'bad').join(', ')}).`, original: raw }
      const accountIds = new Set(d.accounts.map(a => a.id)); const personIds = new Set(d.people.map(p => p.id))
      if (accountIds.size !== d.accounts.length || new Set(d.balances.map(b => b.id)).size !== d.balances.length || d.accounts.some(a => !d.balances.some(b => b.id === a.balanceId && b.accountId === a.id) || [...a.ownerPersonIds, ...a.borrowerPersonIds].some(id => !personIds.has(id)) || a.propertyId && !accountIds.has(a.propertyId)) || d.balances.some(b => !accountIds.has(b.accountId))) return { error: 'The saved version 2 document has broken record references.', original: raw }
      const doc = projectDocumentV2(d)
      if (!validMonthlyBudget(doc.budget)) return { error: 'The saved monthly budget contains invalid values.', original: raw }
      if (!validISODate(doc.snapshot.planningStartDate) || d.people.some(p => !p.id || !validISODate(p.dateOfBirth)) || d.balances.some(b => b.asOfDate !== null && !validISODate(b.asOfDate) || b.amountMinor !== null && (!Number.isSafeInteger(b.amountMinor) || b.amountMinor < 0) || b.draftValue !== undefined && typeof b.draftValue !== 'string')) return { error: 'The saved version 2 document has invalid records or dates.', original: raw }
      return { document: doc, sourceVersion: 2, original: raw, needsMigration: false, missingDates: missingOpeningBalanceDates(doc) }
    }
    const document = decodeDocument(raw)
    if (!document) return { error: 'The saved document is not readable or uses an unsupported version.', original: raw }
    const missingDates = missingOpeningBalanceDates(document)
    return { document: { ...document, migration: { fromVersion: 1, gaps: missingDates } }, sourceVersion: 1, original: raw, needsMigration: true, missingDates }
  } catch { return { error: 'The saved document is not valid JSON.', original: raw } }
}
