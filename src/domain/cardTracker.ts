import { validDestination, type BudgetDestination, type MonthlyBudget } from './monthlyBudget'
import type { StepTick } from './transferTicks'

/**
 * The card tracker (Spending): where card spending actually went, and settling the bill.
 * Rules: docs/card-tracker-rules.md. Everything here is pure; the screens never recompute it.
 */
export interface CardTracker {
  /** One Amex today; the model allows more. */
  cards: CardAccount[]
  transactions: CardTransaction[]
  rules: SortRule[]
  /** Key: `${cardId}:${closeDate}` (closeDate YYYY-MM-DD). */
  statements: Record<string, StatementRecord>
  /** Key: YYYY-MM. */
  months: Record<string, MonthRecord>
  /** Key: potId. */
  pots: Record<string, PotTracking>
  /** Newest last; the last 50 are kept. */
  imports: ImportRecord[]
  /** Money moved into a card's set-aside pot (the Amex pot), oldest first. Absent until the first move. */
  moves?: SetAsideMove[]
}

export interface Cardholder { suffix: string; personId: string }

export interface CardAccount {
  id: string
  /** "Amex". */
  name: string
  /** 1–28: the statement closes on this day (24 for this Amex: statements run 25th–24th). */
  closeDay: number
  /** The payment is due this many days after closing (25 for this Amex). Required when creating a card. */
  dueDaysAfterClose: number
  /** Where pot shares collect and the bill is paid from (Joint Monzo). */
  payFromAccountId: string
  /** The default source for overspend covers. Absent: the pay-from account's main balance. */
  bufferDestination?: BudgetDestination
  /** Account # suffix → adult. Cards are mapped to people by suffix, never by name. */
  cardholders: Cardholder[]
  /**
   * The pot money is set aside in as you review (the Amex pot in Monzo), from the statement closing on
   * `fromCloseDate`. Those statements are paid from the pot; earlier ones settle once via `payFromAccountId`.
   */
  setAside?: SetAside
}

export interface SetAside { potId: string; fromCloseDate: string }

export interface MovedLine { destination: BudgetDestination; amountPence: number }

/** One "Move to the Amex pot": what each transaction moved, its lines' change since it was last moved (all of them the first time). */
export interface SetAsideMove {
  id: string
  cardId: string
  /** ISO. */
  at: string
  transactions: Array<{ transactionId: string; lines: MovedLine[] }>
}

export type TransactionKind = 'purchase' | 'refund' | 'payment'

export interface CardTransaction {
  /** The Amex Reference; manual entries `manual:<uuid>`. */
  id: string
  cardId: string
  /** YYYY-MM-DD, the transaction date. It decides the month (D2). */
  date: string
  /** Whitespace collapsed. */
  description: string
  /**
   * `merchantKey` of the raw description, worked out at import. The stored description is collapsed,
   * so the run of spaces between merchant and town is gone by then (deviation from plan §5.1).
   */
  merchant: string
  /** + purchase, − refund or payment. */
  amountPence: number
  kind: TransactionKind
  cardSuffix: string
  /** `${cardId}:${closeDate}` from the export's period (§4.1); manual entries by date window. It decides the statement. */
  statementKey: string
  /** From the cardholders; absent while the suffix is unknown. */
  personId?: string
  amexCategory?: string
  /** ISO. */
  importedAt: string
  /** Absent = to sort. Never set on payments. */
  sort?: TransactionSort
  refundOf?: { transactionId: string; lineIndex?: number }
}

export interface TransactionSort {
  /** One line for a simple sort; the lines add up to the transaction. */
  lines: SplitLine[]
  by: 'rule' | 'person'
  ruleId?: string
  /** ISO. */
  at: string
  /** ISO: when someone checked a rule's sort ("Sorted by rules · Check"). */
  checkedAt?: string
}

export interface SplitLine {
  /** Same sign as the transaction. */
  amountPence: number
  destination: BudgetDestination
  /** A receipt item's name. */
  item?: string
  note?: string
}

export interface SortRule {
  id: string
  /** Uppercase; matched against the normalised description. */
  contains: string
  /** Only on this card. */
  cardSuffix?: string
  /** A simple rule. */
  destination?: BudgetDestination
  /** D13: a split rule (percentages add up to 100). The UI comes last. */
  split?: Array<{ destination: BudgetDestination; percent: number }>
  createdAt: string
}

export interface AmexSummary { previousPence: number; paymentsAndCreditsPence: number; chargesPence: number; totalPence: number; at: string }

export interface StatementRecord {
  cardId: string
  closeDate: string
  /** From the latest import of this period. */
  amexSummary?: AmexSummary
  /** ISO: an export of this period, taken after it closed, matched Amex's summary (§6.7, complete). */
  finalImportAt?: string
  /** ISO: "Settle without the final export". */
  settleWithoutFinalAt?: string
  /** Settle-up steps (§6.8). */
  ticks?: Record<string, StepTick>
  /** Set when every step is done. */
  settledAt?: string
}

export type CoverSource = BudgetDestination | { kind: 'next-month' }
export interface MonthCover { potId: string; amountPence: number; source: CoverSource }

export interface MonthRecord {
  closedAt?: string
  /** ISO: "All <Month> transactions are in", closing before the 3-day wait. */
  allInAt?: string
  covers?: MonthCover[]
  /** `cover:<potId>`. */
  coverTicks?: Record<string, StepTick>
  /** potId → pence left at close (monthly pots). */
  leftovers?: Record<string, number>
  /** Destination key → spent at close, so a later re-sort shows "Changed since closed". */
  closedSpent?: Record<string, number>
}

export type PacePolicy = 'steady' | 'none'

export interface PotTracking {
  /** Default: steady for spending pots, none for carry-over or savings pots. */
  pace?: PacePolicy
  carriesOver?: boolean
  /** A multiple of the monthly Planned; default 2. */
  buildUpLimit?: number
  /** Carry-over pots, checked by hand against the bank. */
  checkedBalance?: { pence: number; at: string }
  /** Built-up money moved elsewhere (D8). */
  movedOut?: Array<{ pence: number; at: string }>
  /** "Keep it": the built-up amount when the flag was dismissed; it shows again once it grows past this. */
  keptBuildUpPence?: number
}

export interface ImportRecord {
  at: string
  cardId: string
  fileName: string
  statementKey: string
  rows: number
  added: number
  skipped: number
  sortedByRules: number
  latestDate: string
  matchesSummary: boolean
}

export const MAX_IMPORTS = 50
export const DEFAULT_BUILD_UP_LIMIT = 2

export function emptyCardTracker(): CardTracker {
  return { cards: [], transactions: [], rules: [], statements: {}, months: {}, pots: {}, imports: [] }
}

// ——— Dates (YYYY-MM-DD and YYYY-MM strings; arithmetic in UTC so time zones never shift a day) ———

const pad = (value: number) => String(value).padStart(2, '0')
const dayMs = 86_400_000

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export const validMonthKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10)
}
/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs)
}
export function shiftMonth(month: string, by: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + by
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${pad(index % 12 + 1)}`
}
export const monthOf = (date: string) => date.slice(0, 7)
export function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()
}
export const firstDayOf = (month: string) => `${month}-01`
export const lastDayOf = (month: string) => `${month}-${pad(daysInMonth(month))}`
/** Today's date where the household is (the device's local date). */
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ——— Statements (§6.7) ———

export const statementKey = (cardId: string, closeDate: string) => `${cardId}:${closeDate}`
export function parseStatementKey(key: string): { cardId: string; closeDate: string } | null {
  const at = key.lastIndexOf(':')
  const cardId = key.slice(0, at), closeDate = key.slice(at + 1)
  return at > 0 && validIsoDate(closeDate) ? { cardId, closeDate } : null
}
/** The close date of the statement whose window holds `date`: from the previous close date + 1 to the close date. */
export function closeDateFor(date: string, closeDay: number): string {
  const month = Number(date.slice(8)) <= closeDay ? monthOf(date) : shiftMonth(monthOf(date), 1)
  return `${month}-${pad(closeDay)}`
}
/** The statement a date falls in by its window. Only manual entries use this; imports take the export's period. */
export const statementFor = (date: string, card: Pick<CardAccount, 'id' | 'closeDay'>) => statementKey(card.id, closeDateFor(date, card.closeDay))
export function statementWindow(closeDate: string, closeDay: number): { from: string; to: string } {
  return { from: addDays(`${shiftMonth(monthOf(closeDate), -1)}-${pad(closeDay)}`, 1), to: closeDate }
}
/** Due date = close date + the card's days until due (24 Nov + 25 = 19 Dec). */
export const dueDate = (closeDate: string, card: Pick<CardAccount, 'dueDaysAfterClose'>) => addDays(closeDate, card.dueDaysAfterClose)

// ——— Text and money ———

/** Uppercase, whitespace collapsed, trimmed: what rules match against. */
export function normaliseDescription(value: string): string {
  return value.toUpperCase().replace(/\s+/g, ' ').trim()
}
/** Collapses whitespace but keeps the case, for storing and showing. */
export const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * The merchant: the raw description before its first run of 2+ spaces (Amex pads merchant and town),
 * uppercase, without digits or `*`. "B&M Retail - 10742 B&M  Dartford" → "B&M RETAIL - B&M".
 */
export function merchantKey(raw: string): string {
  const head = raw.trim().split(/\s{2,}/)[0] ?? ''
  return head.toUpperCase().replace(/[\d*]/g, '').replace(/\s+/g, ' ').trim()
}

/** A rule's default `contains`: the first word or two of the merchant. */
export function defaultRuleText(merchant: string): string {
  const words = merchant.split(' ').filter(word => /[A-Z]/.test(word))
  return words.slice(0, words[0] && words[0].length <= 3 ? 2 : 1).join(' ') || merchant
}

/** A float amount from a spreadsheet cell (18.0, 61.12) to integer pence. */
export function penceFromAmount(value: number): number {
  const pence = Math.round(value * 100)
  return pence === 0 ? 0 : pence
}

/** Typed money ("£1,234.56", "-12.3", "12") to integer pence without float maths; null when it isn't money. */
export function parsePence(text: string): number | null {
  const match = text.trim().replace(/^£/, '').replace(/^([+-])\s*£?/, '$1').match(/^([+-])?(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/)
  if (!match || (match[2] === undefined && match[3] === undefined)) return null
  const pounds = Number((match[2] ?? '0').replace(/,/g, ''))
  const pence = Number((match[3] ?? '0').padEnd(2, '0'))
  const value = pounds * 100 + pence
  if (!Number.isSafeInteger(value)) return null
  return match[1] === '-' && value ? -value : value
}

// ——— Destinations ———

export const destinationKey = (destination: BudgetDestination) => destination.kind === 'pot' ? `pot:${destination.potId}` : `account:${destination.accountId}`
export const sameDestination = (a: BudgetDestination | undefined, b: BudgetDestination | undefined) => !!a && !!b && destinationKey(a) === destinationKey(b)
/** The buffer: the card's setting, else the pay-from account's main balance. */
export const bufferOf = (card: CardAccount): BudgetDestination => card.bufferDestination ?? { kind: 'account', accountId: card.payFromAccountId }

// ——— Cards ———

export const cardTracker = (document: { card?: CardTracker }) => document.card ?? emptyCardTracker()
export const personForSuffix = (card: CardAccount, suffix: string) => card.cardholders.find(row => row.suffix === suffix)?.personId

/** The household's joint account (owned by everyone, more than one owner): the default to pay a card from. */
export function defaultPayFromAccountId(budget: Pick<MonthlyBudget, 'accounts'>): string | undefined {
  return (budget.accounts.find(account => account.ownerPersonIds.length > 1) ?? budget.accounts[0])?.id
}

export type CardDraft = { name: string; closeDay: string; dueDays: string; payFromAccountId: string; buffer: string; setAsidePotId: string; setAsideFrom: string; cardholders: Array<{ suffix: string; personId: string }> }
export type CardDraftErrors = Partial<Record<'name' | 'closeDay' | 'dueDays' | 'payFromAccountId' | 'setAside' | 'cardholders', string>>

/** Checks a card form. Creating a card requires the closing day and the days until due: no silent defaults. */
export function cardDraftErrors(draft: CardDraft, budget: Pick<MonthlyBudget, 'accounts' | 'pots'>): CardDraftErrors {
  const errors: CardDraftErrors = {}
  const closeDay = Number(draft.closeDay), dueDays = Number(draft.dueDays)
  if (!draft.name.trim()) errors.name = 'Enter a name.'
  if (!/^\d+$/.test(draft.closeDay.trim()) || closeDay < 1 || closeDay > 28) errors.closeDay = 'Enter a day from 1 to 28.'
  if (!/^\d+$/.test(draft.dueDays.trim()) || dueDays < 1 || dueDays > 60) errors.dueDays = 'Enter a number of days from 1 to 60.'
  if (!budget.accounts.some(account => account.id === draft.payFromAccountId)) errors.payFromAccountId = 'Choose an account.'
  if (draft.setAsidePotId && (!budget.pots.some(pot => pot.id === draft.setAsidePotId) || !validIsoDate(draft.setAsideFrom))) errors.setAside = 'Choose the pot and the first statement to pay from it.'
  const suffixes = draft.cardholders.map(row => row.suffix.trim()).filter(Boolean)
  if (draft.cardholders.some(row => row.suffix.trim() && !/^-?\d{4,6}$/.test(row.suffix.trim()))) errors.cardholders = 'A card ending is 4 to 6 digits.'
  else if (draft.cardholders.some(row => row.suffix.trim() && !row.personId)) errors.cardholders = 'Choose whose card it is.'
  else if (new Set(suffixes.map(normaliseSuffix)).size !== suffixes.length) errors.cardholders = 'Each card ending can only be listed once.'
  return errors
}

/** Amex writes the Account # as "-12345"; the suffix is stored without the minus. */
export const normaliseSuffix = (value: string) => value.trim().replace(/^-/, '')

export function cardFromDraft(draft: CardDraft, id: string): CardAccount {
  const buffer = parseDestinationValue(draft.buffer)
  return {
    id, name: draft.name.trim(), closeDay: Number(draft.closeDay), dueDaysAfterClose: Number(draft.dueDays), payFromAccountId: draft.payFromAccountId,
    ...(buffer && !(buffer.kind === 'account' && buffer.accountId === draft.payFromAccountId) ? { bufferDestination: buffer } : {}),
    ...(draft.setAsidePotId ? { setAside: { potId: draft.setAsidePotId, fromCloseDate: draft.setAsideFrom } } : {}),
    cardholders: draft.cardholders.filter(row => row.suffix.trim()).map(row => ({ suffix: normaliseSuffix(row.suffix), personId: row.personId })),
  }
}

export function draftFromCard(card: CardAccount | undefined, budget: Pick<MonthlyBudget, 'accounts'>): CardDraft {
  if (!card) return { name: 'Amex', closeDay: '', dueDays: '', payFromAccountId: defaultPayFromAccountId(budget) ?? '', buffer: '', setAsidePotId: '', setAsideFrom: '', cardholders: [] }
  return { name: card.name, closeDay: String(card.closeDay), dueDays: String(card.dueDaysAfterClose), payFromAccountId: card.payFromAccountId, buffer: card.bufferDestination ? destinationKey(card.bufferDestination) : '', setAsidePotId: card.setAside?.potId ?? '', setAsideFrom: card.setAside?.fromCloseDate ?? '', cardholders: card.cardholders.map(row => ({ ...row })) }
}

/** "pot:<id>" / "account:<id>" from a select's value. */
export function parseDestinationValue(value: string): BudgetDestination | undefined {
  const at = value.indexOf(':')
  const kind = value.slice(0, at), id = value.slice(at + 1)
  if (!id) return undefined
  return kind === 'pot' ? { kind: 'pot', potId: id } : kind === 'account' ? { kind: 'account', accountId: id } : undefined
}

export function saveCard<T extends { card?: CardTracker }>(document: T, card: CardAccount): T {
  const tracker = cardTracker(document)
  const cards = tracker.cards.some(row => row.id === card.id) ? tracker.cards.map(row => row.id === card.id ? card : row) : [...tracker.cards, card]
  // A newly mapped suffix gives its unmapped transactions a person.
  const transactions = tracker.transactions.map(row => row.cardId === card.id && !row.personId && personForSuffix(card, row.cardSuffix) ? { ...row, personId: personForSuffix(card, row.cardSuffix) } : row)
  return { ...document, card: { ...tracker, cards, transactions } }
}

/** A card can be removed until it has history: no transactions, statements, imports or set-aside moves. */
export function cardRemovable(tracker: CardTracker, cardId: string): boolean {
  return !tracker.transactions.some(row => row.cardId === cardId) && !Object.values(tracker.statements).some(row => row.cardId === cardId)
    && !tracker.imports.some(row => row.cardId === cardId) && !(tracker.moves ?? []).some(row => row.cardId === cardId)
}

/** Remove a card with no history (cardRemovable); otherwise the document is unchanged. */
export function removeCard<T extends { card?: CardTracker }>(document: T, cardId: string): T {
  const tracker = cardTracker(document)
  if (!cardRemovable(tracker, cardId)) return document
  return { ...document, card: { ...tracker, cards: tracker.cards.filter(row => row.id !== cardId) } }
}

// ——— Validation (decodeBudgetDocument: an invalid `card` makes the document invalid, as for `ticks`) ———

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isInt = (value: unknown): value is number => Number.isSafeInteger(value)
const optionalString = (value: unknown) => value === undefined || typeof value === 'string'
const validTick = (value: unknown) => isRecord(value) && isInt(value.amountPence) && typeof value.at === 'string'
const validTicks = (value: unknown) => value === undefined || isRecord(value) && Object.values(value).every(validTick)
const uniqueIds = (rows: Array<{ id: unknown }>) => rows.every(row => typeof row.id === 'string' && !!row.id) && new Set(rows.map(row => row.id)).size === rows.length

export function validCardTracker(value: unknown, budget: Pick<MonthlyBudget, 'accounts' | 'pots'>, personIds: ReadonlySet<string>): value is CardTracker {
  if (!isRecord(value)) return false
  const { cards, transactions, rules, statements, months, pots, imports, moves } = value
  if (!Array.isArray(cards) || !Array.isArray(transactions) || !Array.isArray(rules) || !isRecord(statements) || !isRecord(months) || !isRecord(pots) || !Array.isArray(imports) || moves !== undefined && !Array.isArray(moves)) return false
  const destination = (row: unknown) => validDestination(row, budget)
  if (!cards.every(isRecord) || !uniqueIds(cards as Array<{ id: unknown }>)) return false
  for (const card of cards as Array<Record<string, unknown>>) {
    if (typeof card.name !== 'string' || !card.name.trim() || !isInt(card.closeDay) || card.closeDay < 1 || card.closeDay > 28 || !isInt(card.dueDaysAfterClose) || card.dueDaysAfterClose < 0 || card.dueDaysAfterClose > 90) return false
    if (!budget.accounts.some(account => account.id === card.payFromAccountId) || card.bufferDestination !== undefined && !destination(card.bufferDestination)) return false
    if (!Array.isArray(card.cardholders) || !card.cardholders.every(row => isRecord(row) && typeof row.suffix === 'string' && !!row.suffix && typeof row.personId === 'string' && personIds.has(row.personId))) return false
    if (new Set(card.cardholders.map(row => (row as Cardholder).suffix)).size !== card.cardholders.length) return false
    if (card.setAside !== undefined && !(isRecord(card.setAside) && typeof card.setAside.potId === 'string' && budget.pots.some(pot => pot.id === (card.setAside as SetAside).potId) && validIsoDate(card.setAside.fromCloseDate))) return false
  }
  const cardIds = new Set((cards as unknown as CardAccount[]).map(card => card.id))
  const validStatementKey = (key: unknown) => { if (typeof key !== 'string') return false; const parsed = parseStatementKey(key); return !!parsed && cardIds.has(parsed.cardId) }
  if (!transactions.every(isRecord) || !uniqueIds(transactions as Array<{ id: unknown }>)) return false
  for (const row of transactions as Array<Record<string, unknown>>) {
    if (typeof row.cardId !== 'string' || !cardIds.has(row.cardId) || !validIsoDate(row.date) || typeof row.description !== 'string' || typeof row.merchant !== 'string' || !isInt(row.amountPence)) return false
    if (!['purchase', 'refund', 'payment'].includes(row.kind as string) || typeof row.cardSuffix !== 'string' || !validStatementKey(row.statementKey) || !(row.statementKey as string).startsWith(`${row.cardId}:`)) return false
    if (row.personId !== undefined && (typeof row.personId !== 'string' || !personIds.has(row.personId)) || !optionalString(row.amexCategory) || typeof row.importedAt !== 'string') return false
    if (row.refundOf !== undefined && !(isRecord(row.refundOf) && typeof row.refundOf.transactionId === 'string' && (row.refundOf.lineIndex === undefined || isInt(row.refundOf.lineIndex) && row.refundOf.lineIndex >= 0))) return false
    if (row.sort !== undefined) {
      if (row.kind === 'payment' || !isRecord(row.sort)) return false
      const sort = row.sort
      if (!Array.isArray(sort.lines) || !sort.lines.length || !['rule', 'person'].includes(sort.by as string) || !optionalString(sort.ruleId) || typeof sort.at !== 'string' || !optionalString(sort.checkedAt)) return false
      if (!sort.lines.every(line => isRecord(line) && isInt(line.amountPence) && destination(line.destination) && optionalString(line.item) && optionalString(line.note))) return false
      if ((sort.lines as SplitLine[]).reduce((sum, line) => sum + line.amountPence, 0) !== row.amountPence) return false
    }
  }
  if (!rules.every(isRecord) || !uniqueIds(rules as Array<{ id: unknown }>)) return false
  for (const rule of rules as Array<Record<string, unknown>>) {
    if (typeof rule.contains !== 'string' || !rule.contains.trim() || !optionalString(rule.cardSuffix) || typeof rule.createdAt !== 'string') return false
    if (rule.destination !== undefined && !destination(rule.destination)) return false
    if (rule.split !== undefined && !(Array.isArray(rule.split) && rule.split.length > 0 && rule.split.every(part => isRecord(part) && destination(part.destination) && typeof part.percent === 'number' && part.percent > 0) && Math.abs((rule.split as Array<{ percent: number }>).reduce((sum, part) => sum + part.percent, 0) - 100) < 1e-9)) return false
    if (rule.destination === undefined && rule.split === undefined) return false
  }
  for (const [key, statement] of Object.entries(statements)) {
    const parsed = parseStatementKey(key)
    if (!parsed || !cardIds.has(parsed.cardId) || !isRecord(statement) || statement.cardId !== parsed.cardId || statement.closeDate !== parsed.closeDate) return false
    const summary = statement.amexSummary
    if (summary !== undefined && !(isRecord(summary) && isInt(summary.previousPence) && isInt(summary.paymentsAndCreditsPence) && isInt(summary.chargesPence) && isInt(summary.totalPence) && typeof summary.at === 'string')) return false
    if (!optionalString(statement.finalImportAt) || !optionalString(statement.settleWithoutFinalAt) || !optionalString(statement.settledAt) || !validTicks(statement.ticks)) return false
  }
  const potIds = new Set(budget.pots.map(pot => pot.id))
  for (const [key, month] of Object.entries(months)) {
    if (!validMonthKey(key) || !isRecord(month) || !optionalString(month.closedAt) || !optionalString(month.allInAt) || !validTicks(month.coverTicks)) return false
    if (month.covers !== undefined && !(Array.isArray(month.covers) && month.covers.every(cover => isRecord(cover) && typeof cover.potId === 'string' && potIds.has(cover.potId) && isInt(cover.amountPence) && cover.amountPence > 0 && (isRecord(cover.source) && cover.source.kind === 'next-month' || destination(cover.source))))) return false
    if (month.leftovers !== undefined && !(isRecord(month.leftovers) && Object.entries(month.leftovers).every(([potId, pence]) => potIds.has(potId) && isInt(pence)))) return false
    if (month.closedSpent !== undefined && !(isRecord(month.closedSpent) && Object.values(month.closedSpent).every(isInt))) return false
  }
  for (const [potId, tracking] of Object.entries(pots)) {
    if (!potIds.has(potId) || !isRecord(tracking)) return false
    if (tracking.pace !== undefined && tracking.pace !== 'steady' && tracking.pace !== 'none' || tracking.carriesOver !== undefined && typeof tracking.carriesOver !== 'boolean') return false
    if (tracking.buildUpLimit !== undefined && !(typeof tracking.buildUpLimit === 'number' && Number.isFinite(tracking.buildUpLimit) && tracking.buildUpLimit > 0)) return false
    if (tracking.checkedBalance !== undefined && !(isRecord(tracking.checkedBalance) && isInt(tracking.checkedBalance.pence) && typeof tracking.checkedBalance.at === 'string')) return false
    if (tracking.movedOut !== undefined && !(Array.isArray(tracking.movedOut) && tracking.movedOut.every(row => isRecord(row) && isInt(row.pence) && row.pence > 0 && typeof row.at === 'string'))) return false
    if (tracking.keptBuildUpPence !== undefined && !isInt(tracking.keptBuildUpPence)) return false
  }
  if (moves !== undefined) {
    const transactionIds = new Set((transactions as unknown as CardTransaction[]).map(row => row.id))
    if (!moves.every(isRecord) || !uniqueIds(moves as Array<{ id: unknown }>)) return false
    for (const move of moves as Array<Record<string, unknown>>) {
      if (typeof move.cardId !== 'string' || !cardIds.has(move.cardId) || typeof move.at !== 'string' || !Array.isArray(move.transactions)) return false
      if (!move.transactions.every(row => isRecord(row) && typeof row.transactionId === 'string' && transactionIds.has(row.transactionId) && Array.isArray(row.lines)
        && row.lines.every(line => isRecord(line) && isInt(line.amountPence) && destination(line.destination)))) return false
    }
  }
  return imports.every(row => isRecord(row) && typeof row.at === 'string' && typeof row.cardId === 'string' && typeof row.fileName === 'string' && typeof row.statementKey === 'string'
    && [row.rows, row.added, row.skipped, row.sortedByRules].every(count => isInt(count) && (count as number) >= 0) && typeof row.latestDate === 'string' && typeof row.matchesSummary === 'boolean')
}
