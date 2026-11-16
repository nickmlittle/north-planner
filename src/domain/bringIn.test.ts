import { describe, expect, it } from 'vitest'
import { importAmexExport, type AmexExport, type AmexRow } from './amexImport'
import { importChanges, justBroughtIn, withoutImport } from './bringIn'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'
import { savePotKind } from './potKinds'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const sorted = (destination: BudgetDestination, amountPence: number) => ({ lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' })
const NOV_20 = new Date('2026-11-20T09:00:00Z')
const TODAY = '2026-11-20'

/** Groceries £300 planned and £100 spent; Bills carries over; a rule for Tesco → Groceries and Netflix → Bills. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  document.budget.snapshots['2026-11'] = { items: [item('g', 'groceries', 30000), item('b', 'bills', 20000)] }
  const earlier: CardTransaction = { id: 'old', cardId: 'amex', date: '2026-11-03', description: 'TESCO', merchant: 'TESCO', amountPence: 10000, kind: 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x', sort: sorted(pot('groceries'), 10000) }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [earlier],
    rules: [{ id: 'r1', contains: 'TESCO', destination: pot('groceries'), createdAt: 'x' }, { id: 'r2', contains: 'NETFLIX', destination: pot('bills'), createdAt: 'x' }],
  }
  return savePotKind(savePotKind(document, 'groceries', 'tracked'), 'bills', 'carries-over')
}

const row = (date: string, description: string, amountPence: number, reference: string): AmexRow => ({ date, rawDescription: description, suffix: '41001', amountPence, reference })
function bringIn(document: BudgetDocument, rows: AmexRow[]) {
  const charges = rows.filter(r => r.amountPence > 0).reduce((s, r) => s + r.amountPence, 0), credits = rows.filter(r => r.amountPence < 0).reduce((s, r) => s + r.amountPence, 0)
  const parsed: AmexExport = { period: { from: '2026-10-25', to: '2026-11-24' }, summary: { previousPence: 0, paymentsAndCreditsPence: credits, chargesPence: charges, totalPence: charges + credits }, rows }
  return importAmexExport(document, 'amex', parsed, 'a.xlsx', NOV_20).document
}

describe('importChanges', () => {
  it('says where the rules sorted the rows and what is left to sort', () => {
    const document = bringIn(household(), [row('2026-11-18', 'TESCO STORES', 6420, 'a1'), row('2026-11-17', 'NETFLIX', 999, 'a2'), row('2026-11-16', 'MYSTERY SHOP', 2400, 'a3')])
    const result = importChanges(document, NOV_20.toISOString(), TODAY)!
    expect(result).toMatchObject({ added: 3, sorted: 2, toSort: 1, fileName: 'a.xlsx' })
    expect(result.sortedTo).toEqual([{ destination: pot('groceries'), count: 1, pence: 6420 }, { destination: pot('bills'), count: 1, pence: 999 }])
  })

  it('names the bills that went out: rows that landed in a Carries over pot', () => {
    const document = bringIn(household(), [row('2026-11-17', 'NETFLIX', 999, 'a2'), row('2026-11-18', 'TESCO STORES', 6420, 'a1')])
    expect(importChanges(document, NOV_20.toISOString(), TODAY)!.bills).toEqual([{ id: 'a2', description: 'NETFLIX', date: '2026-11-17', pence: 999 }])
  })

  it('flags rows dated before this month, by month', () => {
    const document = bringIn(household(), [row('2026-10-28', 'TESCO STORES', 3000, 'o1'), row('2026-10-26', 'MYSTERY', 1000, 'o2'), row('2026-09-30', 'OLD', 500, 'o3'), row('2026-11-18', 'TESCO STORES', 2000, 'n1')])
    expect(importChanges(document, NOV_20.toISOString(), TODAY)!.earlier).toEqual([{ month: '2026-09', count: 1 }, { month: '2026-10', count: 2 }])
  })

  it('shows a Tracked pot moving from on track to ahead, and nothing for a pot that did not move', () => {
    // £100 spent by day 20 of 30 is on track (steady pace is £200); £250 is £50 ahead, past 10% of the plan.
    const document = bringIn(household(), [row('2026-11-18', 'TESCO STORES', 15000, 'a1')])
    const { changes } = importChanges(document, NOV_20.toISOString(), TODAY)!
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ destination: pot('groceries'), from: { status: 'on-track', text: 'On track' }, to: { status: 'ahead' } })
    expect(changes[0]!.to.text).toMatch(/ahead$/)
    expect(importChanges(bringIn(household(), [row('2026-11-17', 'NETFLIX', 999, 'a2')]), NOV_20.toISOString(), TODAY)!.changes).toEqual([])
  })

  it('names a refund, the purchase it answers and where it went back to', () => {
    const base = household()
    base.card!.transactions.push({ id: 'asos', cardId: 'amex', date: '2026-11-10', description: 'ASOS', merchant: 'ASOS', amountPence: 7900, kind: 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x', sort: sorted(pot('groceries'), 7900) })
    const document = bringIn(base, [row('2026-11-19', 'ASOS', -4200, 'r1')])
    expect(importChanges(document, NOV_20.toISOString(), TODAY)!.refunds).toEqual([{ id: 'r1', description: 'ASOS', date: '2026-11-19', pence: -4200, of: 'ASOS', destination: pot('groceries') }])
  })

  it('gives the bill sum, including what is still to sort', () => {
    const document = bringIn(household(), [row('2026-11-16', 'MYSTERY SHOP', 2400, 'a3')])
    expect(importChanges(document, NOV_20.toISOString(), TODAY)!.bill).toMatchObject({ billPence: 12400, toSortPence: 2400, toSort: 1 })
  })

  it('is null for an unknown import, and for one that added nothing', () => {
    const once = bringIn(household(), [row('2026-11-18', 'TESCO STORES', 6420, 'a1')])
    expect(importChanges(once, 'nope', TODAY)).toBeNull()
    const again = importAmexExport(once, 'amex', { period: { from: '2026-10-25', to: '2026-11-24' }, summary: { previousPence: 0, paymentsAndCreditsPence: 0, chargesPence: 6420, totalPence: 6420 }, rows: [row('2026-11-18', 'TESCO STORES', 6420, 'a1')] }, 'b.xlsx', new Date('2026-11-21T09:00:00Z')).document
    expect(importChanges(again, '2026-11-21T09:00:00.000Z', '2026-11-21')).toBeNull()
  })

  it('leaves the original document alone and drops only that import’s rows from "before"', () => {
    const document = bringIn(household(), [row('2026-11-18', 'TESCO STORES', 6420, 'a1')])
    expect(withoutImport(document, NOV_20.toISOString()).card!.transactions.map(r => r.id)).toEqual(['old'])
    expect(document.card!.transactions).toHaveLength(2)
  })
})

describe('justBroughtIn', () => {
  const document = bringIn(household(), [row('2026-11-18', 'TESCO STORES', 6420, 'a1')])
  it('shows for the day of the import and the two after, then goes', () => {
    expect(justBroughtIn(document, '2026-11-20')).not.toBeNull()
    expect(justBroughtIn(document, '2026-11-22')).not.toBeNull()
    expect(justBroughtIn(document, '2026-11-23')).toBeNull()
  })
  it('is for the latest import only', () => {
    expect(justBroughtIn(household(), TODAY)).toBeNull()
  })
})
