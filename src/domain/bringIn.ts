import type { BudgetDocument } from './budgetDocument'
import { billSum, type BillSum } from './billSum'
import { monthSpending, type DestinationSpending } from './cardSpending'
import { cardTracker, localDate, monthOf, destinationKey, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { potKind } from './potKinds'
import { aheadText, overText } from '../formatting/paceLabels'

/**
 * What a bring-in changed (month-health PR 7): the rows it added, where the rules sorted them, which belong to an
 * earlier month, how each Tracked pot's pace moved, the bills that went out, the refunds, and the bill's sum.
 * Worked out from `importedAt`, so it needs no stored result: the document without the rows an import added is
 * "before", the document as it is now is "after". Pure.
 */

/** A Tracked pot's pace as one short phrase: "On track", "£73 ahead", "£12.83 over". */
export type PaceSnapshot = { status: DestinationSpending['status']; text: string }

export type PotChange = { key: string; destination: BudgetDestination; from: PaceSnapshot; to: PaceSnapshot }

export type BroughtInRow = { id: string; description: string; date: string; pence: number }

export type BroughtIn = {
  /** The import's time: its identity. */
  at: string
  cardId: string
  fileName: string
  statementKey: string
  /** Purchases, refunds and payments this import added. */
  added: number
  /** Added purchases and refunds with a pot or account. */
  sorted: number
  /** Added purchases and refunds still without one. */
  toSort: number
  /** Where the added rows went, biggest first. A split row counts once under each destination. */
  sortedTo: Array<{ destination: BudgetDestination; count: number; pence: number }>
  /** Added rows dated before this month, one entry per month, oldest first: "3 are October's". */
  earlier: Array<{ month: string; count: number }>
  /** Tracked pots whose pace moved because of the added rows, this month. */
  changes: PotChange[]
  /** Added rows that went to a Carries over pot (Bills): the bills that have gone out. */
  bills: BroughtInRow[]
  /** Added refunds, with the purchase each answers and where it went. */
  refunds: Array<BroughtInRow & { of?: string; destination?: BudgetDestination }>
  /** The sum of the statement the import was for, as it is now. Null when that statement isn't paid from the Amex pot. */
  bill: BillSum | null
}

/** The import records that exist, newest last, by `at`. */
export const importRecords = (document: Pick<BudgetDocument, 'card'>) => cardTracker(document).imports

/** The document as it was before an import: without the rows it added. */
export function withoutImport<T extends Pick<BudgetDocument, 'card'>>(document: T, at: string): T {
  const tracker = cardTracker(document)
  return { ...document, card: { ...tracker, transactions: tracker.transactions.filter(row => row.importedAt !== at || row.id.startsWith('manual:')) } }
}

const snapshot = (row: DestinationSpending): PaceSnapshot =>
  ({ status: row.status, text: row.status === 'over' ? overText(-row.leftPence) : row.status === 'ahead' ? aheadText(row.aheadPence ?? 0) : 'On track' })

/** Tracked pots' pace this month, keyed by pot. */
function trackedPace(document: BudgetDocument, month: string, today: string) {
  const out = new Map<string, { destination: BudgetDestination; snap: PaceSnapshot }>()
  for (const row of monthSpending(document, month, today).rows) {
    if (row.kind !== 'tracked' || row.destination.kind !== 'pot' || !['over', 'ahead', 'on-track'].includes(row.status)) continue
    out.set(row.key, { destination: row.destination, snap: snapshot(row) })
  }
  return out
}

const sortedLines = (row: CardTransaction) => row.sort?.lines ?? []

/** What the import made at `at` changed, as the document stands now. Null when no such import, or it added nothing. */
export function importChanges(document: BudgetDocument, at: string, today: string = localDate()): BroughtIn | null {
  const tracker = cardTracker(document)
  const record = tracker.imports.find(row => row.at === at)
  if (!record) return null
  const rows = tracker.transactions.filter(row => row.importedAt === at && !row.id.startsWith('manual:'))
  if (!rows.length) return null
  const month = monthOf(today)
  const counted = rows.filter(row => row.kind !== 'payment')

  const byDestination = new Map<string, { destination: BudgetDestination; count: number; pence: number }>()
  for (const row of counted) for (const line of sortedLines(row)) {
    const key = destinationKey(line.destination)
    const found = byDestination.get(key) ?? { destination: line.destination, count: 0, pence: 0 }
    byDestination.set(key, { ...found, count: found.count + 1, pence: found.pence + line.amountPence })
  }

  const earlier = new Map<string, number>()
  for (const row of counted) if (monthOf(row.date) < month) earlier.set(monthOf(row.date), (earlier.get(monthOf(row.date)) ?? 0) + 1)

  const before = trackedPace(withoutImport(document, at), month, today), after = trackedPace(document, month, today)
  const changes: PotChange[] = []
  for (const [key, now] of after) {
    const was = before.get(key)
    if (was && was.snap.text !== now.snap.text) changes.push({ key, destination: now.destination, from: was.snap, to: now.snap })
  }

  const row = (transaction: CardTransaction): BroughtInRow => ({ id: transaction.id, description: transaction.description, date: transaction.date, pence: transaction.amountPence })
  const bills = counted.filter(transaction => transaction.kind === 'purchase' && sortedLines(transaction).some(line => line.destination.kind === 'pot' && potKind(document, line.destination.potId) === 'carries-over')).map(row)
  const refunds = counted.filter(transaction => transaction.kind === 'refund').map(refund => ({
    ...row(refund),
    ...refund.refundOf ? { of: tracker.transactions.find(purchase => purchase.id === refund.refundOf!.transactionId)?.description } : {},
    ...sortedLines(refund)[0] ? { destination: sortedLines(refund)[0]!.destination } : {},
  }))

  return {
    at, cardId: record.cardId, fileName: record.fileName, statementKey: record.statementKey, added: rows.length,
    sorted: counted.filter(transaction => transaction.sort).length, toSort: counted.filter(transaction => !transaction.sort).length,
    sortedTo: [...byDestination.values()].sort((a, b) => b.pence - a.pence), earlier: [...earlier].sort(([a], [b]) => a.localeCompare(b)).map(([m, count]) => ({ month: m, count })),
    changes, bills, refunds, bill: billSum(document, record.statementKey, today),
  }
}

/** How long "Just brought in" stays on Home: the day of the import and the two after. */
export const JUST_BROUGHT_IN_DAYS = 2

/** The latest import's changes, while it's recent and still the latest. */
export function justBroughtIn(document: BudgetDocument, today: string = localDate()): BroughtIn | null {
  const latest = importRecords(document).at(-1)
  if (!latest) return null
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${localDate(new Date(latest.at))}T00:00:00Z`)) / 86_400_000
  return age >= 0 && age <= JUST_BROUGHT_IN_DAYS ? importChanges(document, latest.at, today) : null
}
