import type { BudgetDocument } from './budgetDocument'
import { cardTracker, destinationKey, dueDate, monthOf, parseStatementKey, statementWindow, type CardTracker, type CardTransaction, type StatementRecord } from './cardTracker'
import { stepStatus, type StepTick } from './transferTicks'
import type { BudgetDestination } from './monthlyBudget'

/** Settle-up step keys (§6.8), shared by settling up and a carry-over pot's Free (§6.6). */
export const settleOutKey = (potId: string) => `settle:out:${potId}`
export const settleIntoKey = (potId: string) => `settle:into:${potId}`
export const settleSendKey = (accountId: string) => `settle:send:${accountId}`
export const settleReturnKey = (accountId: string) => `settle:return:${accountId}`
export const SETTLE_PAY_KEY = 'settle:pay'

/** A statement's transactions: everything Amex put on it (by `statementKey`), payments included. */
export const statementTransactions = (tracker: Pick<CardTracker, 'transactions'>, key: string) => tracker.transactions.filter(row => row.statementKey === key)

export type StatementSummary = {
  key: string
  cardId: string
  closeDate: string
  from: string
  dueDate: string
  record?: StatementRecord
  /** Σ purchases and refunds: what to pay. Payments are excluded. */
  totalPence: number
  transactions: number
  toSort: number
  payments: CardTransaction[]
  /** Spending on it by the month each transaction counts in (D2). */
  byMonth: Array<{ month: string; pence: number }>
  /** North's rows against Amex's summary, when there is one. */
  summaryCheck?: { matches: boolean; missingChargesPence: number; missingCreditsPence: number }
  open: boolean
  /** The final export is in (or settling without it was chosen). */
  complete: boolean
  ready: boolean
  settled: boolean
  /** Settle-up steps done, of all. */
  done: number
  steps: number
}

export type SettleStepKind = 'out' | 'into' | 'send' | 'return' | 'pay'
export type SettleStep = {
  key: string
  kind: SettleStepKind
  /** The account the step is made from (the pay-from account sends a return and pays the card). */
  accountId: string
  potId?: string
  amountPence: number
}
export type SettleAccount = {
  accountId: string
  /** Who makes these steps: the account's owners. */
  ownerPersonIds: string[]
  steps: SettleStep[]
  /** The account's share, pots and direct, for "Ada's pots £258.05". */
  sharePence: number
  /** Spend sorted to the pay-from account itself: no step needed ("includes £95.00 of one-offs"). */
  oneOffsPence: number
}
export type SettlePlan = { accounts: SettleAccount[]; pay: SettleStep; totalPence: number; payFromAccountId: string }

/** Σ split lines of a statement's transactions, by destination. */
export function statementShares(tracker: Pick<CardTracker, 'transactions'>, key: string): Map<string, { destination: BudgetDestination; pence: number }> {
  const shares = new Map<string, { destination: BudgetDestination; pence: number }>()
  for (const transaction of statementTransactions(tracker, key)) for (const line of transaction.sort?.lines ?? []) {
    const id = destinationKey(line.destination)
    const row = shares.get(id) ?? { destination: line.destination, pence: 0 }
    row.pence += line.amountPence
    shares.set(id, row)
  }
  return shares
}

/**
 * The steps that gather these shares in one account (`hubAccountId`), shared by settling up (§6.8) and moving
 * money to the set-aside pot. Accounts go owners' own first (household order), then joint, then without an
 * owner, the hub last. For each: Out of each pot with a share (Into a pot whose refunds outweigh its spend), then
 * Send the account's net share to the hub (or the hub Returns it). Spend sorted to the hub itself needs no step.
 */
export function shareSteps(document: Pick<BudgetDocument, 'budget' | 'household'>, shares: Iterable<{ destination: BudgetDestination; pence: number }>, hubAccountId: string): SettleAccount[] {
  const accountOf = (destination: BudgetDestination) => destination.kind === 'account' ? destination.accountId : document.budget.pots.find(pot => pot.id === destination.potId)?.accountId
  const byAccount = new Map<string, { pots: Array<{ potId: string; pence: number }>; direct: number }>()
  for (const { destination, pence } of shares) {
    const accountId = accountOf(destination)
    if (!accountId) continue
    const row = byAccount.get(accountId) ?? { pots: [], direct: 0 }
    if (destination.kind === 'pot') row.pots.push({ potId: destination.potId, pence })
    else row.direct += pence
    byAccount.set(accountId, row)
  }
  const people = document.household.adults.map(person => person.id)
  const accountRank = (accountId: string) => {
    if (accountId === hubAccountId) return [3, 0]
    const owners = document.budget.accounts.find(account => account.id === accountId)?.ownerPersonIds ?? []
    return owners.length === 1 ? [0, people.indexOf(owners[0]!)] : owners.length > 1 ? [1, 0] : [2, 0]
  }
  const potName = (potId: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? ''
  return [...byAccount.keys()].sort((a, b) => { const [ga, pa] = accountRank(a), [gb, pb] = accountRank(b); return ga! - gb! || pa! - pb! || a.localeCompare(b) }).map(accountId => {
    const row = byAccount.get(accountId)!
    const steps: SettleStep[] = row.pots.filter(pot => pot.pence !== 0).sort((a, b) => potName(a.potId).localeCompare(potName(b.potId), 'en-GB')).map(pot => pot.pence > 0
      ? { key: settleOutKey(pot.potId), kind: 'out' as const, accountId, potId: pot.potId, amountPence: pot.pence }
      : { key: settleIntoKey(pot.potId), kind: 'into' as const, accountId, potId: pot.potId, amountPence: -pot.pence })
    const net = row.pots.reduce((sum, pot) => sum + pot.pence, 0) + row.direct
    const hub = accountId === hubAccountId
    if (!hub && net > 0) steps.push({ key: settleSendKey(accountId), kind: 'send', accountId, amountPence: net })
    if (!hub && net < 0) steps.push({ key: settleReturnKey(accountId), kind: 'return', accountId: hubAccountId, amountPence: -net })
    return { accountId, ownerPersonIds: document.budget.accounts.find(account => account.id === accountId)?.ownerPersonIds ?? [], steps, sharePence: net, oneOffsPence: hub ? row.direct : 0 }
  })
}

/**
 * Settle-up steps (§6.8): every share on the statement gathered in the pay-from account (`shareSteps`), then
 * the last step pays the card the statement total from the pay-from account.
 */
export function settleSteps(document: Pick<BudgetDocument, 'budget' | 'card' | 'household'>, key: string): SettlePlan | null {
  const tracker = cardTracker(document)
  const parsed = parseStatementKey(key)
  const card = parsed && tracker.cards.find(row => row.id === parsed.cardId)
  if (!card) return null
  const accounts = shareSteps(document, statementShares(tracker, key).values(), card.payFromAccountId)
  const totalPence = statementTransactions(tracker, key).filter(row => row.kind !== 'payment').reduce((sum, row) => sum + row.amountPence, 0)
  return { accounts, pay: { key: SETTLE_PAY_KEY, kind: 'pay', accountId: card.payFromAccountId, amountPence: totalPence }, totalPence, payFromAccountId: card.payFromAccountId }
}

/** Every step, in order, the pay step last. */
export const allSettleSteps = (plan: SettlePlan) => [...plan.accounts.flatMap(account => account.steps), ...plan.totalPence > 0 ? [plan.pay] : []]

/** A statement's state (§6.7): open, complete, ready to settle, settled, and its figures. */
export function statementSummary(document: Pick<BudgetDocument, 'budget' | 'card' | 'household'>, key: string, today: string): StatementSummary | null {
  const tracker = cardTracker(document)
  const parsed = parseStatementKey(key)
  const card = parsed && tracker.cards.find(row => row.id === parsed.cardId)
  if (!parsed || !card) return null
  const record = tracker.statements[key]
  const rows = statementTransactions(tracker, key)
  const spending = rows.filter(row => row.kind !== 'payment')
  const byMonth = new Map<string, number>()
  for (const row of spending) byMonth.set(monthOf(row.date), (byMonth.get(monthOf(row.date)) ?? 0) + row.amountPence)
  const summary = record?.amexSummary
  const charges = rows.filter(row => row.amountPence > 0).reduce((sum, row) => sum + row.amountPence, 0)
  const credits = rows.filter(row => row.amountPence < 0).reduce((sum, row) => sum + row.amountPence, 0)
  const plan = settleSteps(document, key)
  const steps = plan ? allSettleSteps(plan) : []
  const done = steps.filter(step => stepStatus(record?.ticks, step.key, step.amountPence).state === 'done').length
  const open = today <= parsed.closeDate
  const complete = !!record?.finalImportAt || !!record?.settleWithoutFinalAt
  const toSort = spending.filter(row => !row.sort).length
  return {
    key, cardId: card.id, closeDate: parsed.closeDate, from: statementWindow(parsed.closeDate, card.closeDay).from, dueDate: dueDate(parsed.closeDate, card), record,
    totalPence: spending.reduce((sum, row) => sum + row.amountPence, 0), transactions: spending.length, toSort,
    payments: rows.filter(row => row.kind === 'payment'),
    byMonth: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, pence]) => ({ month, pence })),
    ...summary ? { summaryCheck: { matches: summary.chargesPence === charges && summary.paymentsAndCreditsPence === credits, missingChargesPence: summary.chargesPence - charges, missingCreditsPence: summary.paymentsAndCreditsPence - credits } } : {},
    open, complete, ready: !open && complete && toSort === 0, settled: steps.length > 0 && done === steps.length && toSort === 0 && !open, done, steps: steps.length,
  }
}

/** Every statement with transactions or a record, newest first. */
export function statementKeys(tracker: Pick<CardTracker, 'transactions' | 'statements'>): string[] {
  return [...new Set([...tracker.transactions.map(row => row.statementKey), ...Object.keys(tracker.statements)])].sort((a, b) => (parseStatementKey(b)?.closeDate ?? '').localeCompare(parseStatementKey(a)?.closeDate ?? '') || a.localeCompare(b))
}

const withStatement = <T extends Pick<BudgetDocument, 'card'>>(document: T, key: string, change: (record: StatementRecord) => StatementRecord): T => {
  const tracker = cardTracker(document)
  const parsed = parseStatementKey(key)
  if (!parsed) return document
  const record = tracker.statements[key] ?? { cardId: parsed.cardId, closeDate: parsed.closeDate }
  return { ...document, card: { ...tracker, statements: { ...tracker.statements, [key]: change(record) } } }
}

/**
 * Tick a settle-up step at its amount (or untick it). When every step is done the statement is settled
 * (`settledAt`); unticking or a later change clears it.
 */
export function setSettleTick<T extends Pick<BudgetDocument, 'budget' | 'card' | 'household'>>(document: T, key: string, stepKey: string, amountPence: number | null, now: Date): T {
  const ticked = withStatement(document, key, record => {
    const ticks: Record<string, StepTick> = { ...record.ticks }
    if (amountPence === null) delete ticks[stepKey]
    else ticks[stepKey] = { amountPence, at: now.toISOString() }
    const next: StatementRecord = { ...record, ticks }
    if (!Object.keys(ticks).length) delete next.ticks
    return next
  })
  const plan = settleSteps(ticked, key)
  const record = cardTracker(ticked).statements[key]!
  const steps = plan ? allSettleSteps(plan) : []
  const settled = steps.length > 0 && steps.every(step => stepStatus(record.ticks, step.key, step.amountPence).state === 'done')
  return withStatement(ticked, key, current => {
    const next = { ...current }
    if (settled) next.settledAt = current.settledAt ?? now.toISOString()
    else delete next.settledAt
    return next
  })
}

/** "Settle without the final export". */
export const settleWithoutFinal = <T extends Pick<BudgetDocument, 'card'>>(document: T, key: string, now: Date): T => withStatement(document, key, record => ({ ...record, settleWithoutFinalAt: now.toISOString() }))

/** A payment row matching an open Pay step: offer to tick it, never automatically (§4.5). */
export function paymentMatchingPay(summary: StatementSummary, plan: SettlePlan | null): CardTransaction | undefined {
  if (!plan || stepStatus(summary.record?.ticks, plan.pay.key, plan.pay.amountPence).state === 'done') return undefined
  return summary.payments.find(row => -row.amountPence === plan.pay.amountPence)
}
