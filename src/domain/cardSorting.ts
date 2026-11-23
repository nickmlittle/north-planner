import type { BudgetDocument } from './budgetDocument'
import { bufferOf, cardTracker, collapseWhitespace, defaultRuleText, destinationKey, merchantKey, needsSort, normaliseDescription, sameDestination, WAITING_NOTE_MAX, withSort, type CardTracker, type CardTransaction, type SortRule, type SplitLine, type TransactionSort, type WaitingMark, type WaitingOn } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'

/** The first rule, in list order, whose text appears in the normalised description (and whose card matches, if it names one). */
export function matchRule(rules: readonly SortRule[], transaction: Pick<CardTransaction, 'description' | 'cardSuffix'>): SortRule | undefined {
  const description = normaliseDescription(transaction.description)
  return rules.find(rule => {
    const text = normaliseDescription(rule.contains)
    return !!text && description.includes(text) && (!rule.cardSuffix || rule.cardSuffix === transaction.cardSuffix)
  })
}

/**
 * Splits an amount by percentages into whole pennies that add up exactly: floor each share,
 * then hand out the spare pennies by largest remainder (earlier parts win ties). Keeps the sign.
 */
export function splitByPercent(amountPence: number, percents: readonly number[]): number[] {
  const sign = amountPence < 0 ? -1 : 1, total = Math.abs(amountPence)
  const sum = percents.reduce((a, b) => a + b, 0)
  const exact = percents.map(percent => sum > 0 ? total * percent / sum : 0)
  const shares = exact.map(Math.floor)
  let spare = total - shares.reduce((a, b) => a + b, 0)
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of order) { if (spare <= 0) break; shares[index]! += 1; spare -= 1 }
  return shares.map(share => share === 0 ? 0 : share * sign)
}

/** The lines a rule gives a transaction: one line, or its split by percent. */
export function ruleLines(rule: SortRule, amountPence: number): SplitLine[] {
  if (rule.split?.length) {
    const shares = splitByPercent(amountPence, rule.split.map(part => part.percent))
    const lines = rule.split.map((part, index) => ({ amountPence: shares[index]!, destination: part.destination })).filter(line => line.amountPence !== 0)
    return lines.length ? lines : [{ amountPence, destination: rule.split[0]!.destination }]
  }
  return [{ amountPence, destination: rule.destination! }]
}

export function ruleSort(rule: SortRule, amountPence: number, at: string): TransactionSort {
  return { lines: ruleLines(rule, amountPence), by: 'rule', ruleId: rule.id, at }
}

/** A simple sort: the whole transaction to one pot or account. */
export function singleSort(destination: BudgetDestination, amountPence: number, at: string): TransactionSort {
  return { lines: [{ amountPence, destination }], by: 'person', at }
}

/** Newest first: by date, then the order they came in. */
export function byNewest(a: CardTransaction, b: CardTransaction, order: ReadonlyMap<string, number>): number {
  return b.date.localeCompare(a.date) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
}

/** Purchases and refunds with no pot or account yet and not waiting, newest first. Payments are never sorted. */
export function transactionsToSort(tracker: Pick<CardTracker, 'transactions'>): CardTransaction[] {
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  return tracker.transactions.filter(needsSort).sort((a, b) => byNewest(a, b, order))
}

// ——— Waiting (audit 6, W4–W6) ———

export type WaitingGroup = {
  /** `person:<id>` or `discuss`. */
  key: string
  on: WaitingOn
  /** Newest first, as in To sort. */
  rows: CardTransaction[]
  totalPence: number
}

export const waitingKey = (on: WaitingOn) => on.kind === 'person' ? `person:${on.personId}` : 'discuss'

/**
 * The waiting rows by reason: Ask <person> for each adult with rows, cardholders first and then household order, then
 * To discuss. Rows run newest first.
 */
export function transactionsWaiting(document: Pick<BudgetDocument, 'card' | 'household'>): WaitingGroup[] {
  const tracker = cardTracker(document)
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  const rows = tracker.transactions.filter(row => row.waiting && row.kind !== 'payment' && !row.sort).sort((a, b) => byNewest(a, b, order))
  const cardholders = new Set(tracker.cards.flatMap(card => card.cardholders.map(row => row.personId)))
  const adults = document.household.adults.map((person, index) => ({ id: person.id, rank: (cardholders.has(person.id) ? 0 : 1) * 1000 + index }))
  const reasons: WaitingOn[] = [...[...adults].sort((a, b) => a.rank - b.rank).map(person => ({ kind: 'person' as const, personId: person.id })), { kind: 'discuss' }]
  return reasons.flatMap(on => {
    const key = waitingKey(on)
    const group = rows.filter(row => waitingKey(row.waiting!.on) === key)
    return group.length ? [{ key, on, rows: group, totalPence: group.reduce((sum, row) => sum + row.amountPence, 0) }] : []
  })
}

/** Every waiting row, in `transactionsWaiting`'s order. */
export const waitingRows = (document: Pick<BudgetDocument, 'card' | 'household'>) => transactionsWaiting(document).flatMap(group => group.rows)

/**
 * Mark a row Waiting, or change its mark. Only a purchase or refund in To sort (WP4), waiting on an adult or To discuss
 * (W5), with a reason always and a note if there is one (W6): one line, up to 140 characters (WP6). Changing the mark keeps
 * when it was first marked, so days waited carry on (WP5). Anything else leaves the document unchanged.
 */
export function markWaiting<T extends Pick<BudgetDocument, 'card' | 'household'>>(document: T, id: string, on: WaitingOn, note: string | undefined, now: Date): T {
  const transaction = cardTracker(document).transactions.find(row => row.id === id)
  const text = collapseWhitespace(note ?? '')
  if (!transaction || transaction.kind === 'payment' || transaction.sort || text.length > WAITING_NOTE_MAX) return document
  if (on.kind === 'person' && !document.household.adults.some(person => person.id === on.personId)) return document
  const mark: WaitingMark = { on: on.kind === 'person' ? { kind: 'person', personId: on.personId } : { kind: 'discuss' }, ...text ? { note: text } : {}, at: transaction.waiting?.at ?? now.toISOString() }
  return replaceTransaction(document, id, row => ({ ...row, waiting: mark }))
}

/** Back to To sort: drop the Waiting mark. */
export function clearWaiting<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string): T {
  return replaceTransaction(document, id, row => { if (!row.waiting) return row; const next = { ...row }; delete next.waiting; return next })
}

/** The latest import, for "Last brought in Mon 9 Nov". */
export const lastImport = (tracker: Pick<CardTracker, 'imports'>, cardId?: string) => [...tracker.imports].reverse().find(row => !cardId || row.cardId === cardId)

// ——— Suggestions (§6.3) ———

export type SuggestionReason = 'last-used' | 'own' | 'joint' | 'joint-account' | 'buffer'
export type Suggestion = { destination: BudgetDestination; reason: SuggestionReason }

/**
 * Where a transaction probably goes, in order and without repeats: what this merchant went to last time,
 * the cardholder's own pots, joint pots, the joint account (the pay-from account's main balance), then the
 * buffer if it's somewhere else.
 */
export function suggestions(document: Pick<BudgetDocument, 'budget' | 'card'>, transaction: CardTransaction): Suggestion[] {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === transaction.cardId)
  const found: Suggestion[] = []
  const add = (destination: BudgetDestination, reason: SuggestionReason) => { if (!found.some(row => sameDestination(row.destination, destination))) found.push({ destination, reason }) }
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  const previous = tracker.transactions.filter(row => row.id !== transaction.id && row.merchant === transaction.merchant && row.sort).sort((a, b) => byNewest(a, b, order))[0]
  for (const line of previous?.sort?.lines ?? []) add(line.destination, 'last-used')
  const { accounts, pots } = document.budget
  const owners = (accountId: string) => accounts.find(account => account.id === accountId)?.ownerPersonIds ?? []
  const byName = [...pots].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'))
  if (transaction.personId) for (const pot of byName) { const who = owners(pot.accountId); if (who.length === 1 && who[0] === transaction.personId) add({ kind: 'pot', potId: pot.id }, 'own') }
  for (const pot of byName) if (owners(pot.accountId).length > 1) add({ kind: 'pot', potId: pot.id }, 'joint')
  if (card) {
    add({ kind: 'account', accountId: card.payFromAccountId }, 'joint-account')
    add(bufferOf(card), 'buffer')
  }
  return found
}

// ——— Sorting ———

const replaceTransaction = <T extends Pick<BudgetDocument, 'card'>>(document: T, id: string, change: (row: CardTransaction) => CardTransaction): T => {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => row.id === id ? change(row) : row) } }
}

/** Sort a transaction by hand: its lines must add up to it. Payments are never sorted. */
export function sortTransaction<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string, lines: SplitLine[], now: Date, discount?: TransactionSort['discount']): T {
  const transaction = cardTracker(document).transactions.find(row => row.id === id)
  if (!transaction || transaction.kind === 'payment' || !lines.length || lines.reduce((sum, line) => sum + line.amountPence, 0) !== transaction.amountPence) return document
  return replaceTransaction(document, id, row => withSort(row, { lines, by: 'person', at: now.toISOString(), ...discount && lines.some(line => line.originalPence) ? { discount } : {} }))
}

export function unsortTransaction<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string): T {
  return replaceTransaction(document, id, row => { const next = { ...row }; delete next.sort; return next })
}

/**
 * Undo a placing: put the transaction's sort back as it was, or back in To sort when it had none. A row that was
 * waiting before it was placed gets its mark back (`waiting`), so Undo returns it to Waiting.
 */
export function restoreSort<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string, sort: TransactionSort | undefined, waiting?: WaitingMark): T {
  if (sort) return replaceTransaction(document, id, row => withSort(row, sort))
  const unsorted = unsortTransaction(document, id)
  return waiting ? replaceTransaction(unsorted, id, row => row.kind === 'payment' ? row : { ...row, waiting }) : unsorted
}

/** "Check" on the rule-sorted ones: they leave the Sorted by rules list. */
export function checkRuleSorts<T extends Pick<BudgetDocument, 'card'>>(document: T, ids: readonly string[], now: Date): T {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, transactions: tracker.transactions.map(row => ids.includes(row.id) && row.sort?.by === 'rule' ? { ...row, sort: { ...row.sort, checkedAt: now.toISOString() } } : row) } }
}

/** Rule-sorted transactions nobody has checked yet, newest first. */
export function uncheckedRuleSorts(tracker: Pick<CardTracker, 'transactions'>): CardTransaction[] {
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  return tracker.transactions.filter(row => row.sort?.by === 'rule' && !row.sort.checkedAt).sort((a, b) => byNewest(a, b, order))
}

/** Everything except payments, newest first (All transactions). */
export function allTransactions(tracker: Pick<CardTracker, 'transactions'>): CardTransaction[] {
  const order = new Map(tracker.transactions.map((row, index) => [row.id, index]))
  return tracker.transactions.filter(row => row.kind !== 'payment').sort((a, b) => byNewest(a, b, order))
}

// ——— Rules ———

export type RuleDraft = { contains: string; cardSuffix?: string; destination: BudgetDestination }

const withRules = <T extends Pick<BudgetDocument, 'card'>>(document: T, rules: SortRule[]): T => ({ ...document, card: { ...cardTracker(document), rules } })

/**
 * "Always put <merchant> in this pot": a new rule at the end of the list. It also sorts anything still to sort that
 * it matches, so the same merchant doesn't have to be placed twice. Waiting rows are left alone: a rule never undoes
 * a person's hold (WP7).
 */
export function addRule<T extends Pick<BudgetDocument, 'card'>>(document: T, draft: RuleDraft, now: Date, id: string = crypto.randomUUID()): { document: T; rule: SortRule; alsoSorted: number } {
  const rule: SortRule = { id, contains: normaliseDescription(draft.contains), ...(draft.cardSuffix ? { cardSuffix: draft.cardSuffix } : {}), destination: draft.destination, createdAt: now.toISOString() }
  const tracker = cardTracker(document)
  let alsoSorted = 0
  const transactions = tracker.transactions.map(row => {
    if (!needsSort(row) || matchRule([rule], row) !== rule) return row
    alsoSorted++
    return withSort(row, ruleSort(rule, row.amountPence, now.toISOString()))
  })
  return { document: { ...document, card: { ...tracker, rules: [...tracker.rules, rule], transactions } }, rule, alsoSorted }
}

/** Edit a rule's text, card or destination. Transactions it already sorted keep their sort. */
export function updateRule<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string, draft: RuleDraft): T {
  return withRules(document, cardTracker(document).rules.map(rule => {
    if (rule.id !== id) return rule
    const next: SortRule = { id: rule.id, contains: normaliseDescription(draft.contains), destination: draft.destination, createdAt: rule.createdAt }
    if (draft.cardSuffix) next.cardSuffix = draft.cardSuffix
    return next
  }))
}

export function deleteRule<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string): T {
  return withRules(document, cardTracker(document).rules.filter(rule => rule.id !== id))
}

/** Rules apply in list order, so order matters: move one up (-1) or down (+1). */
export function moveRule<T extends Pick<BudgetDocument, 'card'>>(document: T, id: string, by: -1 | 1): T {
  const rules = [...cardTracker(document).rules]
  const at = rules.findIndex(rule => rule.id === id), to = at + by
  if (at < 0 || to < 0 || to >= rules.length) return document
  ;[rules[at], rules[to]] = [rules[to]!, rules[at]!]
  return withRules(document, rules)
}

/** How many transactions a rule has sorted. */
export const ruleUses = (tracker: Pick<CardTracker, 'transactions'>, ruleId: string) => tracker.transactions.filter(row => row.sort?.ruleId === ruleId).length

/** A sort's single destination, or undefined for a split. */
export const sortDestination = (sort: TransactionSort | undefined) => sort?.lines.length === 1 ? sort.lines[0]!.destination : undefined
export const destinationsOf = (sort: TransactionSort | undefined) => [...new Map((sort?.lines ?? []).map(line => [destinationKey(line.destination), line.destination])).values()]

// ——— A pot's rules and suggestions (Spending ↔ Month link F6: "Sorts itself here") ———

/** The single-pot rules that send transactions to a destination, A to Z. Split rules aren't listed. */
export function rulesFor(tracker: Pick<CardTracker, 'rules'>, destination: BudgetDestination): SortRule[] {
  return tracker.rules.filter(rule => !rule.split && sameDestination(rule.destination, destination)).sort((a, b) => a.contains.localeCompare(b.contains, 'en-GB'))
}

/** How many hand sorts of one merchant into a pot earn a "Make rule" (decision L7). */
export const SUGGEST_AFTER = 2

export type RuleSuggestion = {
  /** The rule it would make: `defaultRuleText` of the merchant ("TESCO"). */
  contains: string
  /** The merchant sorted here most often under that text, the shorter name on a tie ("TESCO STORES"). */
  merchant: string
  /** Hand sorts here. */
  count: number
}

/**
 * Merchants sorted into a destination by hand at least `SUGGEST_AFTER` times, with no rule matching them yet: each one
 * a "Make rule". Merchants group by the rule they'd make, so "TESCO STORES" and "TESCO STORE 3180" count together. A
 * merchant hand-sorted elsewhere as often as here isn't suggested: a rule would send those the wrong way. Only whole
 * purchases count: refunds follow their purchase, and splits aren't one pot.
 */
export function ruleSuggestions(tracker: Pick<CardTracker, 'rules' | 'transactions'>, destination: BudgetDestination): RuleSuggestion[] {
  const key = destinationKey(destination)
  const groups = new Map<string, { here: number; elsewhere: number; merchants: Map<string, number> }>()
  for (const transaction of tracker.transactions) {
    const lines = transaction.sort?.lines ?? []
    if (transaction.kind !== 'purchase' || transaction.sort?.by !== 'person' || lines.length !== 1 || matchRule(tracker.rules, transaction)) continue
    const merchant = transaction.merchant || merchantKey(transaction.description)
    const contains = normaliseDescription(defaultRuleText(merchant))
    if (!contains) continue
    const group = groups.get(contains) ?? { here: 0, elsewhere: 0, merchants: new Map<string, number>() }
    if (destinationKey(lines[0]!.destination) === key) {
      group.here++
      group.merchants.set(merchant, (group.merchants.get(merchant) ?? 0) + 1)
    } else group.elsewhere++
    groups.set(contains, group)
  }
  return [...groups].filter(([, group]) => group.here >= SUGGEST_AFTER && group.here > group.elsewhere)
    .map(([contains, group]) => ({ contains, merchant: [...group.merchants].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], 'en-GB'))[0]![0], count: group.here }))
    .sort((a, b) => b.count - a.count || a.contains.localeCompare(b.contains, 'en-GB'))
}
