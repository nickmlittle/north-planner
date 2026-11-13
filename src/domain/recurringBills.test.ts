import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, type BudgetDocument } from './budgetDocument'
import { billDraft, commitItemBatch, itemDraft, newBillDraft, newItemDraft, readBillDraft, readItemDraft, type BillDraft } from './budgetItemDrafts'
import { resolveBudget, validMonthlyBudget, validRecurringBill, type BudgetItem, type RecurringBill } from './monthlyBudget'
import { billTracked, billsOnCard } from './recurringBills'

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))!
const named = (document: BudgetDocument, name: string) => resolveBudget(document.budget, '2026-11').items.find(item => item.name === name)!

describe('validRecurringBill', () => {
  it('takes a day of 1–28 or the last day, and a month only for a yearly item', () => {
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 1 }, 'monthly')).toBe(true)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 28 }, 'monthly')).toBe(true)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 'last' }, 'monthly')).toBe(true)
    for (const day of [0, 29, 31, 2.5, '3', null]) expect(validRecurringBill({ paidBy: 'direct-debit', day }, 'monthly')).toBe(false)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 3, month: 3 }, 'monthly')).toBe(false)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 3, month: 3, remindWeeks: 4 }, 'annually')).toBe(true)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 'last', month: 2 }, 'annually')).toBe(true)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 3 }, 'annually')).toBe(false)
    for (const month of [0, 13, 1.5, '3']) expect(validRecurringBill({ paidBy: 'direct-debit', day: 3, month }, 'annually')).toBe(false)
  })

  it('allows a reminder of 0, 2, 4, 6 or 8 weeks on a yearly item only', () => {
    for (const remindWeeks of [0, 2, 4, 6, 8]) expect(validRecurringBill({ paidBy: 'direct-debit', day: 3, month: 3, remindWeeks }, 'annually')).toBe(true)
    for (const remindWeeks of [1, 3, 10, '4']) expect(validRecurringBill({ paidBy: 'direct-debit', day: 3, month: 3, remindWeeks }, 'annually')).toBe(false)
    expect(validRecurringBill({ paidBy: 'direct-debit', day: 3, remindWeeks: 4 }, 'monthly')).toBe(false)
  })

  it('takes a card id only when paid by card', () => {
    expect(validRecurringBill({ paidBy: 'card', day: 9 }, 'monthly')).toBe(true)
    expect(validRecurringBill({ paidBy: 'card', cardId: 'amex', day: 2 }, 'monthly')).toBe(true)
    // A card id that no longer matches a card is still valid: it counts as Another card.
    expect(validRecurringBill({ paidBy: 'card', cardId: 'gone', day: 2 }, 'monthly')).toBe(true)
    expect(validRecurringBill({ paidBy: 'direct-debit', cardId: 'amex', day: 2 }, 'monthly')).toBe(false)
    expect(validRecurringBill({ paidBy: 'card', cardId: '', day: 2 }, 'monthly')).toBe(false)
    expect(validRecurringBill({ paidBy: 'standing-order', day: 2 }, 'monthly')).toBe(false)
    expect(validRecurringBill([], 'monthly')).toBe(false)
  })

  it('makes a document with a bad bill invalid, and one without bills still loads', () => {
    const document = seed()
    expect(validMonthlyBudget(document.budget)).toBe(true)
    const broken = structuredClone(document)
    broken.budget.snapshots['2026-10']!.items[2]!.bill = { paidBy: 'direct-debit', day: 31 }
    expect(decodeBudgetDocument(broken)).toBeNull()
    const older = structuredClone(document)
    for (const snapshot of Object.values(older.budget.snapshots)) for (const item of snapshot.items) delete item.bill
    expect(decodeBudgetDocument(older)).not.toBeNull()
  })
})

describe('bill drafts', () => {
  const draft = (patch: Partial<BillDraft>): BillDraft => ({ ...newBillDraft(), on: true, ...patch })

  it('reads nothing while unticked, whatever the fields hold', () => {
    expect(readBillDraft({ ...newBillDraft(), day: '3' }, 'monthly')).toEqual({})
    expect(readBillDraft(newBillDraft(), 'annually')).toEqual({})
  })

  it('asks for the day, and for a yearly item the month', () => {
    expect(readBillDraft(draft({}), 'monthly')).toEqual({ field: 'billDay', message: 'Choose the day it comes out.' })
    expect(readBillDraft(draft({ day: '29' }), 'monthly')).toMatchObject({ field: 'billDay' })
    expect(readBillDraft(draft({}), 'annually')).toEqual({ field: 'billDay', message: 'Choose the day it renews.' })
    expect(readBillDraft(draft({ day: '3' }), 'annually')).toEqual({ field: 'billMonth', message: 'Choose the month it renews.' })
  })

  it('keeps only what applies: no month or reminder for monthly, no card id for Another card or a direct debit', () => {
    expect(readBillDraft(draft({ day: 'last', month: '3', remindWeeks: '8' }), 'monthly')).toEqual({ bill: { paidBy: 'direct-debit', day: 'last' } })
    expect(readBillDraft(draft({ day: '3', month: '3', remindWeeks: '0' }), 'annually')).toEqual({ bill: { paidBy: 'direct-debit', day: 3, month: 3, remindWeeks: 0 } })
    expect(readBillDraft(draft({ paidBy: 'card', cardId: '', day: '9' }), 'monthly')).toEqual({ bill: { paidBy: 'card', day: 9 } })
    expect(readBillDraft(draft({ paidBy: 'card', cardId: 'amex', day: '2' }), 'monthly')).toEqual({ bill: { paidBy: 'card', cardId: 'amex', day: 2 } })
    expect(readBillDraft(draft({ paidBy: 'direct-debit', cardId: 'amex', day: '2' }), 'monthly')).toEqual({ bill: { paidBy: 'direct-debit', day: 2 } })
  })

  it('round-trips every bill in the baseline through a draft', () => {
    const items = resolveBudget(seed().budget, '2026-11').items.filter(item => item.bill)
    expect(items).toHaveLength(10)
    for (const item of items) {
      const read = readItemDraft(itemDraft(item), item.categoryId, item.destination, ['ada', 'ben'])
      if ('error' in read) throw new Error(read.error.message)
      expect(read.item).toEqual(item)
    }
  })

  it('fills a yearly item’s reminder with the default 4 weeks', () => {
    const bill: RecurringBill = { paidBy: 'direct-debit', day: 12, month: 1 }
    expect(billDraft(bill)).toEqual({ on: true, paidBy: 'direct-debit', cardId: '', day: '12', month: '1', remindWeeks: '4' })
    expect(readBillDraft(billDraft(bill), 'annually')).toEqual({ bill: { ...bill, remindWeeks: 4 } })
  })

  it('switching a yearly bill to monthly drops its month; switching back asks for it', () => {
    const document = seed()
    const insurance = named(document, 'Home insurance')
    const monthly = readItemDraft({ ...itemDraft(insurance), frequency: 'monthly', amount: '102.04' }, insurance.categoryId, insurance.destination, ['ada', 'ben'])
    expect(monthly).toMatchObject({ item: { frequency: 'monthly', bill: { paidBy: 'direct-debit', day: 12 } } })
    expect('item' in monthly && monthly.item.bill).not.toHaveProperty('month')
    const water = named(document, 'Water')
    expect(readItemDraft({ ...itemDraft(water), frequency: 'annually' }, water.categoryId, water.destination, ['ada', 'ben'])).toEqual({ error: { rowId: water.id, field: 'billMonth', message: 'Choose the month it renews.' } })
  })

  it('saves a bill with the item from the month it’s edited, by snapshot rules', () => {
    const document = seed()
    const rent = named(document, 'Rent')
    const result = commitItemBatch(document, '2026-12', { rows: [{ ...itemDraft(rent), bill: { ...newBillDraft(), on: true, day: 'last' } }], categoryId: rent.categoryId, destination: { destination: rent.destination }, editingId: rent.id })
    if ('error' in result) throw new Error(result.error.message)
    expect(resolveBudget(result.document.budget, '2026-12').items.find(item => item.id === rent.id)?.bill).toEqual({ paidBy: 'direct-debit', day: 'last' })
    expect(resolveBudget(result.document.budget, '2026-11').items.find(item => item.id === rent.id)?.bill).toBeUndefined()
    expect(decodeBudgetDocument(result.document)).not.toBeNull()
  })

  it('starts unticked on a new item', () => {
    expect(newItemDraft('x', 'ada').bill).toEqual({ on: false, paidBy: 'direct-debit', cardId: '', day: '', month: '', remindWeeks: '4' })
  })
})

describe('cards and bills', () => {
  it('tracks a bill only on a card North has', () => {
    const document = seed()
    expect(billTracked(named(document, 'Streamflix').bill!, document)).toBe(true)
    expect(billTracked(named(document, 'Mobile plans').bill!, document)).toBe(false)
    expect(billTracked(named(document, 'Water').bill!, document)).toBe(false)
    expect(billTracked({ paidBy: 'card', cardId: 'gone', day: 2 }, document)).toBe(false)
    expect(billTracked(named(document, 'Streamflix').bill!, { card: undefined })).toBe(false)
  })

  it('names each item whose bill is on a card, once, by its latest name', () => {
    const document = seed()
    expect(billsOnCard(document, 'amex')).toEqual(['Streamflix', 'Breakdown cover'])
    const renamed = structuredClone(document)
    renamed.budget.snapshots['2027-03']!.items = renamed.budget.snapshots['2027-03']!.items.map((item: BudgetItem) => item.name === 'Streamflix' ? { ...item, name: 'Streamflix Premium' } : item)
    expect(billsOnCard(renamed, 'amex')).toEqual(['Streamflix Premium', 'Breakdown cover'])
    expect(billsOnCard(document, 'other')).toEqual([])
  })
})
