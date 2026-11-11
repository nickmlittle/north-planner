import type { BudgetDocument } from './budgetDocument'
import {
  cardTracker, collapseWhitespace, localDate, MAX_IMPORTS, merchantKey, normaliseDescription, normaliseSuffix, parsePence, penceFromAmount, personForSuffix, statementFor, statementKey, validIsoDate,
  type AmexSummary, type CardTransaction, type ImportRecord, type TransactionKind,
} from './cardTracker'
import { matchRule, ruleSort } from './cardSorting'
import { excelSerialDate, readXlsx, XlsxError, type XlsxCell, type XlsxSheets } from './xlsx'

/** The Amex Excel export (plan §4): two sheets, a 6-row header, then a 13-column table. */
export const DETAILS_SHEET = 'Transaction Details'
export const SUMMARY_SHEET = 'Transaction Summary'
export const AMEX_COLUMNS = ['Date', 'Description', 'Card Member', 'Account #', 'Amount', 'Extended Details', 'Appears On Your Statement As', 'Address', 'Town/City', 'Postcode', 'Country', 'Reference', 'Category'] as const
export const NOT_AN_EXPORT = 'This doesn’t look like an Amex Excel export. Download the Excel version of your transactions.'

export class AmexImportError extends Error {}

export type AmexRow = { date: string; rawDescription: string; suffix: string; amountPence: number; reference?: string; category?: string }
export type AmexExport = { period: { from: string; to: string }; summary: Omit<AmexSummary, 'at'>; rows: AmexRow[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PERIOD = /(\w{3}) (\d{1,2}), (\d{4}) to (\w{3}) (\d{1,2}), (\d{4})\s*$/

const cellText = (cell: XlsxCell | undefined) => cell === null || cell === undefined ? '' : String(cell)

/** "… Credit Card / Oct 25, 2026 to Nov 24, 2026" → the period's first and last days. */
export function parsePeriod(text: string): { from: string; to: string } | null {
  const match = text.match(PERIOD)
  if (!match) return null
  const day = (month: string, date: string, year: string) => {
    const index = MONTHS.findIndex(name => name.toLowerCase() === month.toLowerCase())
    const iso = `${year}-${String(index + 1).padStart(2, '0')}-${date.padStart(2, '0')}`
    return index >= 0 && validIsoDate(iso) ? iso : null
  }
  const from = day(match[1]!, match[2]!, match[3]!), to = day(match[4]!, match[5]!, match[6]!)
  return from && to && from <= to ? { from, to } : null
}

/** Text DD/MM/YYYY, or an Excel date serial in case Amex changes it. */
export function parseAmexDate(cell: XlsxCell | undefined): string | null {
  if (typeof cell === 'number') return cell > 0 ? excelSerialDate(cell) : null
  const match = cellText(cell).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const iso = `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
  return validIsoDate(iso) ? iso : null
}

/** A numeric cell is a float (61.12); text amounts are parsed without floats. */
function amountOf(cell: XlsxCell | undefined): number | null {
  if (typeof cell === 'number') return penceFromAmount(cell)
  return parsePence(cellText(cell).replace(/\s/g, ''))
}

/** Checks the layout and reads the period, summary and rows. Throws AmexImportError with the message to show. */
export function parseAmexSheets(sheets: XlsxSheets): AmexExport {
  const details = sheets.get(DETAILS_SHEET), summarySheet = sheets.get(SUMMARY_SHEET)
  if (!details || !summarySheet) throw new AmexImportError(NOT_AN_EXPORT)
  const headerIndex = details.findIndex(row => AMEX_COLUMNS.every((name, column) => cellText(row[column]).trim() === name))
  if (headerIndex < 0) throw new AmexImportError(NOT_AN_EXPORT)
  const period = parsePeriod(cellText(details[0]?.[1]))
  if (!period) throw new AmexImportError('North can’t read the statement period at the top of this export. Download the Excel version of your transactions again.')
  const figure = (label: string) => {
    const row = summarySheet.find(cells => cellText(cells[0]).trim().toLowerCase() === label.toLowerCase())
    const value = row ? amountOf(row.slice(1).find(cell => cell !== null && cellText(cell).trim() !== '')) : null
    if (value === null) throw new AmexImportError(`North can’t find “${label}” in the export’s summary. Download the Excel version of your transactions again.`)
    return value
  }
  const summary = { previousPence: figure('Previous Balance'), paymentsAndCreditsPence: figure('Payments & Credits'), chargesPence: figure('Charges'), totalPence: figure('Total Balance') }
  const column = (name: typeof AMEX_COLUMNS[number]) => AMEX_COLUMNS.indexOf(name)
  const rows: AmexRow[] = []
  details.slice(headerIndex + 1).forEach((cells, offset) => {
    if (!cells.some(cell => cellText(cell).trim() !== '')) return
    const line = headerIndex + offset + 2
    const date = parseAmexDate(cells[column('Date')])
    const amountPence = amountOf(cells[column('Amount')])
    if (!date) throw new AmexImportError(`Row ${line} has a date North can’t read. Download the Excel version of your transactions again.`)
    if (amountPence === null) throw new AmexImportError(`Row ${line} has an amount North can’t read. Download the Excel version of your transactions again.`)
    const reference = cellText(cells[column('Reference')]).trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '')
    const category = cellText(cells[column('Category')]).trim()
    rows.push({ date, rawDescription: cellText(cells[column('Description')]), suffix: normaliseSuffix(cellText(cells[column('Account #')])), amountPence, ...(reference ? { reference } : {}), ...(category ? { category } : {}) })
  })
  return { period, summary, rows }
}

export async function readAmexExport(bytes: ArrayBuffer | Uint8Array): Promise<AmexExport> {
  let sheets: XlsxSheets
  try { sheets = await readXlsx(bytes) } catch (error) {
    if (error instanceof XlsxError || error instanceof TypeError || error instanceof RangeError) throw new AmexImportError(NOT_AN_EXPORT)
    throw error
  }
  return parseAmexSheets(sheets)
}

/** §4.5: payments to Amex are negative with a "PAYMENT RECEIVED" description, or a blank category and "PAYMENT". */
export function rowKind(row: Pick<AmexRow, 'amountPence' | 'rawDescription' | 'category'>): TransactionKind {
  if (row.amountPence > 0) return 'purchase'
  if (row.amountPence < 0) return /^PAYMENT RECEIVED/i.test(row.rawDescription.trim()) || !row.category && /PAYMENT/i.test(row.rawDescription) ? 'payment' : 'refund'
  return 'purchase'
}

/** The dedupe key: the Reference, else date|amount|description|suffix. */
export const rowId = (row: AmexRow) => row.reference || `${row.date}|${row.amountPence}|${normaliseDescription(row.rawDescription)}|${row.suffix}`

export type SummaryCheck = { matches: boolean; chargesPence: number; creditsPence: number; missingChargesPence: number; missingCreditsPence: number }

/** Over every row in the file: positives must equal Charges, and negatives Payments & Credits. */
export function checkSummary(parsed: AmexExport): SummaryCheck {
  const chargesPence = parsed.rows.filter(row => row.amountPence > 0).reduce((sum, row) => sum + row.amountPence, 0)
  const creditsPence = parsed.rows.filter(row => row.amountPence < 0).reduce((sum, row) => sum + row.amountPence, 0)
  const missingChargesPence = parsed.summary.chargesPence - chargesPence, missingCreditsPence = parsed.summary.paymentsAndCreditsPence - creditsPence
  return { matches: missingChargesPence === 0 && missingCreditsPence === 0, chargesPence, creditsPence, missingChargesPence, missingCreditsPence }
}

export type ImportResult = {
  statementKey: string
  period: { from: string; to: string }
  rows: number
  alreadyHere: number
  added: number
  sortedByRules: number
  /** New purchases and refunds no rule sorted. */
  toSort: number
  payments: number
  summary: SummaryCheck
  latestDate: string
  /** Card endings with no person yet: "Whose card ends 9xxxx?". */
  unknownSuffixes: string[]
  /** The period ends on a different day from the card's closing day. */
  closeDayMismatch?: number
  /** This import completes the statement: taken after it closed, and it matches Amex's summary. */
  final: boolean
}

/**
 * Brings an export into the document (plan §6.2). Deduplicates by Reference, applies rules to new purchases
 * and refunds, records the summary on the statement and an ImportRecord. Pure: `now` is the import time.
 */
export function importAmexExport(document: BudgetDocument, cardId: string, parsed: AmexExport, fileName: string, now: Date): { document: BudgetDocument; result: ImportResult } {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === cardId)
  if (!card) throw new AmexImportError('Add the card in Household first.')
  const key = statementKey(card.id, parsed.period.to)
  const at = now.toISOString()
  const existing = new Set(tracker.transactions.map(row => row.id))
  const seen = new Set<string>()
  const added: CardTransaction[] = []
  let alreadyHere = 0, sortedByRules = 0
  for (const row of parsed.rows) {
    const id = rowId(row)
    if (existing.has(id) || seen.has(id)) { alreadyHere++; continue }
    seen.add(id)
    const kind = rowKind(row)
    const personId = personForSuffix(card, row.suffix)
    const transaction: CardTransaction = {
      id, cardId: card.id, date: row.date, description: collapseWhitespace(row.rawDescription), merchant: merchantKey(row.rawDescription),
      amountPence: row.amountPence, kind, cardSuffix: row.suffix, statementKey: key, importedAt: at,
      ...(personId ? { personId } : {}), ...(row.category ? { amexCategory: row.category } : {}),
    }
    const rule = kind === 'payment' ? undefined : matchRule(tracker.rules, transaction)
    if (rule) { transaction.sort = ruleSort(rule, transaction.amountPence, at); sortedByRules++ }
    added.push(transaction)
  }
  const summary = checkSummary(parsed)
  const final = localDate(now) > parsed.period.to && summary.matches
  const latestDate = parsed.rows.reduce((latest, row) => row.date > latest ? row.date : latest, '')
  const record: ImportRecord = { at, cardId: card.id, fileName, statementKey: key, rows: parsed.rows.length, added: added.length, skipped: alreadyHere, sortedByRules, latestDate, matchesSummary: summary.matches }
  const previous = tracker.statements[key]
  const statement = { ...previous, cardId: card.id, closeDate: parsed.period.to, amexSummary: { ...parsed.summary, at }, ...(final ? { finalImportAt: at } : {}) }
  const unknownSuffixes = [...new Set(parsed.rows.map(row => row.suffix).filter(suffix => suffix && !personForSuffix(card, suffix)))]
  const periodEndDay = Number(parsed.period.to.slice(8))
  return {
    document: {
      ...document,
      card: { ...tracker, transactions: [...tracker.transactions, ...added], statements: { ...tracker.statements, [key]: statement }, imports: [...tracker.imports, record].slice(-MAX_IMPORTS) },
    },
    result: {
      statementKey: key, period: parsed.period, rows: parsed.rows.length, alreadyHere, added: added.length, sortedByRules,
      toSort: added.filter(row => row.kind !== 'payment' && !row.sort).length, payments: added.filter(row => row.kind === 'payment').length,
      summary, latestDate, unknownSuffixes, final, ...(periodEndDay !== card.closeDay ? { closeDayMismatch: periodEndDay } : {}),
    },
  }
}

/** Reads an Excel export and brings it in: `importAmexWorkbook(document, cardId, bytes, fileName, now)` (plan §6.2). */
export async function importAmexWorkbook(document: BudgetDocument, cardId: string, bytes: ArrayBuffer | Uint8Array, fileName: string, now: Date) {
  return importAmexExport(document, cardId, await readAmexExport(bytes), fileName, now)
}

export type ManualEntry = { cardId: string; date: string; description: string; amountPence: number; suffix: string }

/**
 * A transaction added by hand (plan §6.2): anything missed after a statement closed, since the export only
 * covers the current period. Its statement comes from the date window. Rules apply as they do on import.
 */
export function addManualTransaction(document: BudgetDocument, entry: ManualEntry, now: Date, id: string = `manual:${crypto.randomUUID()}`): BudgetDocument {
  const tracker = cardTracker(document)
  const card = tracker.cards.find(row => row.id === entry.cardId)
  if (!card) throw new AmexImportError('Add the card in Household first.')
  if (!validIsoDate(entry.date) || !entry.description.trim() || !Number.isSafeInteger(entry.amountPence) || entry.amountPence === 0) throw new AmexImportError('Enter a date, a description and an amount.')
  const suffix = normaliseSuffix(entry.suffix)
  const personId = personForSuffix(card, suffix)
  const at = now.toISOString()
  const transaction: CardTransaction = {
    // Typed text has no Amex padding, so the whole description is the merchant.
    id, cardId: card.id, date: entry.date, description: collapseWhitespace(entry.description), merchant: merchantKey(collapseWhitespace(entry.description)),
    amountPence: entry.amountPence, kind: entry.amountPence < 0 ? 'refund' : 'purchase', cardSuffix: suffix, statementKey: statementFor(entry.date, card), importedAt: at,
    ...(personId ? { personId } : {}),
  }
  const rule = matchRule(tracker.rules, transaction)
  if (rule) transaction.sort = ruleSort(rule, transaction.amountPence, at)
  return { ...document, card: { ...tracker, transactions: [...tracker.transactions, transaction] } }
}
