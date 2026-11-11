// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AMEX_COLUMNS, AmexImportError, checkSummary, importAmexExport, importAmexWorkbook, NOT_AN_EXPORT, parseAmexDate, parsePeriod, readAmexExport, rowKind } from './amexImport'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardAccount } from './cardTracker'
import { matchRule, splitByPercent } from './cardSorting'
import { workbook, type CellSpec } from './xlsx.testing'

// jsdom replaces URL and import.meta.url, so read fixtures from the repo root.
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(process.cwd(), 'docs/fixtures', name)))
const sample = () => fixture('amex-export-sample.xlsx')
const mismatch = () => fixture('amex-export-mismatch.xlsx')
const midPeriod = new Date('2026-11-09T12:00:00Z')

const amex: CardAccount = { id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }] }

function household(card: CardAccount = amex): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }]
  document.card = { ...emptyCardTracker(), cards: [card] }
  return document
}

/** A small export: the header block, the 13 columns and these rows. */
function exportWith(rows: CellSpec[][], { period = 'Oct 25, 2026 to Nov 24, 2026', charges, credits }: { period?: string; charges?: number; credits?: number } = {}) {
  const positives = rows.reduce((sum, row) => sum + (typeof row[4] === 'number' && row[4] > 0 ? row[4] : 0), 0)
  const negatives = rows.reduce((sum, row) => sum + (typeof row[4] === 'number' && row[4] < 0 ? row[4] : 0), 0)
  const header = (title: string): CellSpec[][] => [[title, `Example Card / ${period}`], ['Prepared for'], ['SOMEONE'], ['Account Number'], ['XXXX-XXXXXX-00000'], []]
  return workbook({
    'Transaction Details': [...header('Transaction Details'), [...AMEX_COLUMNS], ...rows],
    'Transaction Summary': [...header('Transaction Summary'), ['SUMMARY'], [null, 'Total'], ['Previous Balance', 0], ['Payments & Credits', credits ?? negatives], ['Charges', charges ?? positives], ['Total Balance', (charges ?? positives) + (credits ?? negatives)]],
  })
}
const row = (date: string, description: string, suffix: string, amount: number, reference: string, category = 'General Purchases'): CellSpec[] =>
  [date, description, 'CARD MEMBER', suffix, amount, '', description, 'ADDRESS', 'TOWN', 'ZZ1 1ZZ', 'UNITED KINGDOM', reference, category]

describe('reading the export', () => {
  it('reads the period, the summary and every row of the sample', async () => {
    const parsed = await readAmexExport(sample())
    expect(parsed.period).toEqual({ from: '2026-10-25', to: '2026-11-24' })
    expect(parsed.summary).toEqual({ previousPence: 127875, paymentsAndCreditsPence: -37499, chargesPence: 75226, totalPence: 165602 })
    expect(parsed.rows).toHaveLength(15)
    expect(parsed.rows[1]).toEqual({ date: '2026-11-08', rawDescription: 'GREEN GROCER          LONDON', suffix: '41001', amountPence: 6240, reference: 'AT269000000000000000002', category: 'General Purchases-Groceries' })
    expect(parsed.rows[0]).toMatchObject({ amountPence: -35000, rawDescription: 'PAYMENT RECEIVED - THANK YOU' })
    expect(parsed.rows[0]?.category).toBeUndefined()
    // Floats become exact pence: 18.0, 19.99, 89.97, 88.35.
    expect(parsed.rows.map(row => row.amountPence)).toContain(1800)
    expect(parsed.rows.map(row => row.amountPence)).toEqual(expect.arrayContaining([1999, 8997, 8835, -2499]))
    expect(checkSummary(parsed)).toEqual({ matches: true, chargesPence: 75226, creditsPence: -37499, missingChargesPence: 0, missingCreditsPence: 0 })
  })

  it('parses the period with English month abbreviations, at the end of B1', () => {
    expect(parsePeriod('Example Rewards Credit Card / Oct 25, 2026 to Nov 24, 2026')).toEqual({ from: '2026-10-25', to: '2026-11-24' })
    expect(parsePeriod('Card / Dec 25, 2026 to Jan 24, 2027 ')).toEqual({ from: '2026-12-25', to: '2027-01-24' })
    expect(parsePeriod('Card / Nov 31, 2026 to Dec 24, 2026')).toBeNull()
    expect(parsePeriod('Card / Nov 25, 2026 to Oct 24, 2026')).toBeNull()
    expect(parsePeriod('Transactions')).toBeNull()
  })

  it('reads text dates and Excel date serials', () => {
    expect(parseAmexDate('08/11/2026')).toBe('2026-11-08')
    expect(parseAmexDate('8/1/2027')).toBe('2027-01-08')
    expect(parseAmexDate(46335)).toBe('2026-11-09')
    expect(parseAmexDate('31/11/2026')).toBeNull()
    expect(parseAmexDate('2026-11-08')).toBeNull()
  })

  it('tells payments, refunds and purchases apart', () => {
    expect(rowKind({ amountPence: -35000, rawDescription: 'PAYMENT RECEIVED - THANK YOU', category: undefined })).toBe('payment')
    expect(rowKind({ amountPence: -1000, rawDescription: 'DIRECT DEBIT PAYMENT', category: undefined })).toBe('payment')
    expect(rowKind({ amountPence: -2499, rawDescription: 'HOMEWARE HUT  LEEDS', category: 'General Purchases-Home' })).toBe('refund')
    expect(rowKind({ amountPence: 1250, rawDescription: 'INTEREST CHARGE', category: undefined })).toBe('purchase')
  })

  it('reports how far a mismatching summary is out', async () => {
    const check = checkSummary(await readAmexExport(mismatch()))
    expect(check).toMatchObject({ matches: false, missingChargesPence: 1234, missingCreditsPence: 0 })
  })

  it.each([
    ['a CSV', () => new TextEncoder().encode('Date,Description,Card Member,Account #,Amount\n08/11/2026,SHOP,A,-41001,1.00\n')],
    ['another spreadsheet', () => workbook({ Sheet1: [['Date', 'Amount'], ['08/11/2026', 1]] })],
    ['an export with the columns reordered', () => workbook({ 'Transaction Details': [[], [], [], [], [], [], ['Description', 'Date']], 'Transaction Summary': [] })],
    ['random bytes', () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])],
  ])('rejects %s with the Excel-export message', async (_, bytes) => {
    await expect(readAmexExport(bytes())).rejects.toThrow(new AmexImportError(NOT_AN_EXPORT))
  })

  it('names a row it cannot read rather than importing part of the file', async () => {
    await expect(readAmexExport(exportWith([row('08/11/2026', 'SHOP', '-41001', 1, 'R1'), row('soon', 'SHOP', '-41001', 1, 'R2')]))).rejects.toThrow('Row 9 has a date North can’t read.')
    await expect(readAmexExport(exportWith([row('08/11/2026', 'SHOP', '-41001', 1, 'R1')], { period: 'sometime' }))).rejects.toThrow('statement period')
  })
})

describe('bringing it in', () => {
  it('adds every row to the export’s statement, with people, kinds and the summary', async () => {
    const { document, result } = await importAmexWorkbook(household(), 'amex', sample(), 'activity.xlsx', midPeriod)
    expect(result).toMatchObject({ statementKey: 'amex:2026-11-24', rows: 15, alreadyHere: 0, added: 15, sortedByRules: 0, toSort: 14, payments: 1, latestDate: '2026-11-08', unknownSuffixes: [], final: false })
    expect(result.summary.matches).toBe(true)
    const transactions = document.card!.transactions
    expect(transactions.every(row => row.statementKey === 'amex:2026-11-24')).toBe(true)
    const grocer = transactions.find(row => row.id === 'AT269000000000000000002')!
    expect(grocer).toEqual({ id: 'AT269000000000000000002', cardId: 'amex', date: '2026-11-08', description: 'GREEN GROCER LONDON', merchant: 'GREEN GROCER', amountPence: 6240, kind: 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', amexCategory: 'General Purchases-Groceries', importedAt: '2026-11-09T12:00:00.000Z' })
    // Only the agreed fields are stored: no card member, address or extended details.
    expect(JSON.stringify(document.card)).not.toMatch(/EXAMPLE STREET|ADA EXAMPLE|Foreign Spend|ZZ1 1ZZ|XXXX-/)
    expect(transactions.filter(row => row.kind === 'refund').map(row => row.amountPence)).toEqual([-2499])
    expect(document.card!.statements['amex:2026-11-24']).toEqual({ cardId: 'amex', closeDate: '2026-11-24', amexSummary: { previousPence: 127875, paymentsAndCreditsPence: -37499, chargesPence: 75226, totalPence: 165602, at: '2026-11-09T12:00:00.000Z' } })
    expect(document.card!.imports).toEqual([{ at: '2026-11-09T12:00:00.000Z', cardId: 'amex', fileName: 'activity.xlsx', statementKey: 'amex:2026-11-24', rows: 15, added: 15, skipped: 0, sortedByRules: 0, latestDate: '2026-11-08', matchesSummary: true }])
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('puts a row dated before the period on the export’s statement, but in the month of its date', async () => {
    const { document } = await importAmexWorkbook(household(), 'amex', sample(), 'activity.xlsx', midPeriod)
    const early = document.card!.transactions.find(row => row.date === '2026-10-24')!
    expect(early.statementKey).toBe('amex:2026-11-24')
    expect(early.date.slice(0, 7)).toBe('2026-10')
  })

  it('adds nothing when the same file comes in again', async () => {
    const first = await importAmexWorkbook(household(), 'amex', sample(), 'activity.xlsx', midPeriod)
    const again = await importAmexWorkbook(first.document, 'amex', sample(), 'activity (1).xlsx', new Date('2026-11-10T08:00:00Z'))
    expect(again.result).toMatchObject({ rows: 15, alreadyHere: 15, added: 0, toSort: 0 })
    expect(again.document.card!.transactions).toHaveLength(15)
    expect(again.document.card!.imports).toHaveLength(2)
    expect(again.document.card!.statements['amex:2026-11-24']?.amexSummary?.at).toBe('2026-11-10T08:00:00.000Z')
  })

  it('adds only the new rows from an overlapping export', async () => {
    const older = exportWith([row('03/11/2026', 'CORNER CAFE  BRISTOL', '-41001', 12.5, 'R1'), row('01/11/2026', 'GREEN GROCER  LONDON', '-41009', 40, 'R2')])
    const newer = exportWith([row('06/11/2026', 'FUEL STOP  READING', '-41009', 55.55, 'R3'), row('03/11/2026', 'CORNER CAFE  BRISTOL', '-41001', 12.5, 'R1'), row('01/11/2026', 'GREEN GROCER  LONDON', '-41009', 40, 'R2')])
    const first = await importAmexWorkbook(household(), 'amex', older, 'a.xlsx', midPeriod)
    const second = await importAmexWorkbook(first.document, 'amex', newer, 'b.xlsx', midPeriod)
    expect(second.result).toMatchObject({ rows: 3, alreadyHere: 2, added: 1 })
    expect(second.document.card!.transactions.map(row => row.id)).toEqual(['R1', 'R2', 'R3'])
  })

  it('deduplicates rows without a Reference by date, amount, description and card', async () => {
    const bytes = exportWith([row('03/11/2026', 'CORNER CAFE  BRISTOL', '-41001', 12.5, ''), row('01/11/2026', 'GREEN  GROCER', '-41009', 40, '')])
    const first = await importAmexWorkbook(household(), 'amex', bytes, 'a.xlsx', midPeriod)
    expect(first.document.card!.transactions.map(row => row.id)).toEqual(['2026-11-03|1250|CORNER CAFE BRISTOL|41001', '2026-11-01|4000|GREEN GROCER|41009'])
    expect((await importAmexWorkbook(first.document, 'amex', bytes, 'a.xlsx', midPeriod)).result.added).toBe(0)
  })

  it('still imports rows from a card ending it doesn’t know, and asks whose it is', async () => {
    const { document, result } = await importAmexWorkbook(household({ ...amex, cardholders: [{ suffix: '41001', personId: 'ada' }] }), 'amex', sample(), 'activity.xlsx', midPeriod)
    expect(result.unknownSuffixes).toEqual(['41009'])
    expect(document.card!.transactions.filter(row => row.cardSuffix === '41009').every(row => row.personId === undefined)).toBe(true)
    expect(document.card!.transactions).toHaveLength(15)
  })

  it('sorts new purchases and refunds by the rules, but never payments', async () => {
    const start = household()
    start.card!.rules = [
      { id: 'grocer', contains: 'GREEN GROCER', destination: { kind: 'pot', potId: 'groceries' }, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'cafe-ada', contains: 'CORNER CAFE', cardSuffix: '41001', destination: { kind: 'pot', potId: 'eating' }, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'homeware', contains: 'HOMEWARE', split: [{ destination: { kind: 'pot', potId: 'groceries' }, percent: 50 }, { destination: { kind: 'account', accountId: 'joint' }, percent: 50 }], createdAt: '2026-11-01T00:00:00Z' },
      { id: 'payments', contains: 'PAYMENT', destination: { kind: 'account', accountId: 'joint' }, createdAt: '2026-11-01T00:00:00Z' },
    ]
    const { document, result } = await importAmexWorkbook(start, 'amex', sample(), 'activity.xlsx', midPeriod)
    expect(result).toMatchObject({ added: 15, sortedByRules: 6, toSort: 8 })
    const transactions = document.card!.transactions
    expect(transactions.filter(row => row.sort?.ruleId === 'grocer')).toHaveLength(3)
    // The café rule only applies to Ada's card.
    expect(transactions.filter(row => row.merchant === 'CORNER CAFE').map(row => [row.cardSuffix, row.sort?.ruleId])).toEqual([['41009', undefined], ['41001', 'cafe-ada']])
    const refund = transactions.find(row => row.kind === 'refund')!
    expect(refund.sort?.lines).toEqual([{ amountPence: -1250, destination: { kind: 'pot', potId: 'groceries' } }, { amountPence: -1249, destination: { kind: 'account', accountId: 'joint' } }])
    expect(transactions.find(row => row.kind === 'payment')?.sort).toBeUndefined()
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('warns rather than fails when the summary doesn’t match', async () => {
    const { document, result } = await importAmexWorkbook(household(), 'amex', mismatch(), 'activity.xlsx', midPeriod)
    expect(result.summary).toMatchObject({ matches: false, missingChargesPence: 1234 })
    expect(result.added).toBe(15)
    expect(document.card!.imports.at(-1)?.matchesSummary).toBe(false)
  })

  it('marks the statement complete when an export taken after the close matches the summary', async () => {
    const afterClose = new Date('2026-11-27T09:00:00Z')
    const mid = await importAmexWorkbook(household(), 'amex', sample(), 'a.xlsx', midPeriod)
    expect(mid.document.card!.statements['amex:2026-11-24']?.finalImportAt).toBeUndefined()
    const wrong = await importAmexWorkbook(mid.document, 'amex', mismatch(), 'b.xlsx', afterClose)
    expect(wrong.result.final).toBe(false)
    expect(wrong.document.card!.statements['amex:2026-11-24']?.finalImportAt).toBeUndefined()
    const final = await importAmexWorkbook(wrong.document, 'amex', sample(), 'c.xlsx', afterClose)
    expect(final.result.final).toBe(true)
    expect(final.document.card!.statements['amex:2026-11-24']?.finalImportAt).toBe('2026-11-27T09:00:00.000Z')
  })

  it('flags a period that doesn’t end on the card’s closing day', async () => {
    const { result } = await importAmexWorkbook(household({ ...amex, closeDay: 2 }), 'amex', sample(), 'activity.xlsx', midPeriod)
    expect(result.closeDayMismatch).toBe(24)
    expect(result.statementKey).toBe('amex:2026-11-24')
  })

  it('keeps the last 50 imports', async () => {
    const parsed = await readAmexExport(sample())
    let document = household()
    for (let index = 0; index < 52; index++) document = importAmexExport(document, 'amex', parsed, `file-${index}.xlsx`, midPeriod).document
    expect(document.card!.imports).toHaveLength(50)
    expect(document.card!.imports[0]?.fileName).toBe('file-2.xlsx')
  })

  it('needs the card to exist', async () => {
    await expect(importAmexWorkbook(household(), 'visa', sample(), 'a.xlsx', midPeriod)).rejects.toThrow('Add the card in Household first.')
  })
})

describe('rules and splits', () => {
  it('matches the first rule in list order, and only on its card when it names one', () => {
    const rules = [
      { id: 'a', contains: 'cafe', cardSuffix: '41001', destination: { kind: 'pot' as const, potId: 'eating' }, createdAt: '' },
      { id: 'b', contains: 'CAFE', destination: { kind: 'pot' as const, potId: 'groceries' }, createdAt: '' },
    ]
    expect(matchRule(rules, { description: 'Corner  Cafe Bristol', cardSuffix: '41001' })?.id).toBe('a')
    expect(matchRule(rules, { description: 'Corner Cafe Bristol', cardSuffix: '41009' })?.id).toBe('b')
    expect(matchRule(rules, { description: 'Book Nook', cardSuffix: '41009' })).toBeUndefined()
  })

  it('splits by percent into pennies that add up, keeping the sign', () => {
    expect(splitByPercent(1001, [50, 50])).toEqual([501, 500])
    expect(splitByPercent(-1001, [50, 50])).toEqual([-501, -500])
    expect(splitByPercent(1000, [60, 40])).toEqual([600, 400])
    expect(splitByPercent(100, [33.34, 33.33, 33.33])).toEqual([34, 33, 33])
    expect(splitByPercent(1, [50, 50])).toEqual([1, 0])
  })
})
