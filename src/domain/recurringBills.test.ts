import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, type BudgetDocument } from './budgetDocument'
import { billDraft, commitItemBatch, itemDraft, newBillDraft, newItemDraft, readBillDraft, readItemDraft, type BillDraft } from './budgetItemDrafts'
import { resolveBudget, validMonthlyBudget, validRecurringBill, type BudgetItem, type RecurringBill } from './monthlyBudget'
import { billDate, billTracked, billsOnCard, monthBills } from './recurringBills'
import { monthSpending } from './cardSpending'
import { potBalance, potFlows } from './potBalances'

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

/** Every snapshot of the seed, changed the same way. */
const everyMonth = (document: BudgetDocument, change: (items: BudgetItem[]) => BudgetItem[]) => {
  for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items = change(snapshot.items)
  return document
}

describe('monthBills', () => {
  const states = (today: string, month = '2026-11') => monthBills(seed(), month, today).map(bill => [bill.name, bill.date, bill.state])

  it('lists the month’s bills by date, paid once their day has come', () => {
    expect(states('2026-11-11')).toEqual([
      ['Council tax', '2026-11-01', 'paid'], ['Streamflix', '2026-11-02', 'paid'], ['Water', '2026-11-05', 'paid'], ['Mobile plans', '2026-11-09', 'paid'],
      ['Electricity', '2026-11-18', 'due'], ['Broadband', '2026-11-22', 'due'],
    ])
  })

  it('is paid on the bill’s own day, every bill is due before the month and paid after it', () => {
    expect(states('2026-11-01').slice(0, 2)).toEqual([['Council tax', '2026-11-01', 'paid'], ['Streamflix', '2026-11-02', 'due']])
    expect(states('2026-10-31').every(([, , state]) => state === 'due')).toBe(true)
    expect(states('2026-12-01').every(([, , state]) => state === 'paid')).toBe(true)
    expect(states('2026-11-30').every(([, , state]) => state === 'paid')).toBe(true)
  })

  it('puts the last day on the 28th or 29th in February', () => {
    expect(billDate('2027-02', 'last')).toBe('2027-02-28')
    expect(billDate('2028-02', 'last')).toBe('2028-02-29')
    expect(billDate('2026-11', 'last')).toBe('2026-11-30')
    expect(billDate('2026-11', 3)).toBe('2026-11-03')
  })

  it('has a yearly bill only in its renewal month, at the full yearly price', () => {
    const yearly = (month: string) => monthBills(seed(), month, '2026-11-11').filter(bill => !['Council tax', 'Streamflix', 'Water', 'Mobile plans', 'Electricity', 'Broadband'].includes(bill.name)).map(bill => [bill.name, bill.date, bill.amountPence])
    expect(yearly('2026-11')).toEqual([])
    expect(yearly('2026-12')).toEqual([['Breakdown cover', '2026-12-06', 139560]])
    expect(yearly('2027-01')).toEqual([['Home insurance', '2027-01-12', 122448]])
    expect(yearly('2027-03')).toEqual([['Car insurance', '2027-03-03', 131004]])
    expect(yearly('2027-04')).toEqual([['TV licence', '2027-04-01', 148116]])
  })

  it('marks bills on the Amex as tracked, and another card or a card no longer in North as assumed', () => {
    const tracked = (document: BudgetDocument) => Object.fromEntries(monthBills(document, '2026-11', '2026-11-11').map(bill => [bill.name, bill.tracked]))
    expect(tracked(seed())).toMatchObject({ Streamflix: true, 'Mobile plans': false, Water: false })
    const removed = seed()
    removed.card!.cards = []
    expect(tracked(removed)).toMatchObject({ Streamflix: false })
  })

  it('uses each month’s own plan', () => {
    const document = seed()
    document.budget.snapshots['2027-01'] = { items: resolveBudget(document.budget, '2026-12').items.map(item => item.name === 'Water' ? { ...item, bill: { paidBy: 'direct-debit', day: 20 } } : item) }
    expect(monthBills(document, '2026-12', '2026-11-11').find(bill => bill.name === 'Water')?.date).toBe('2026-12-05')
    expect(monthBills(document, '2027-01', '2026-11-11').find(bill => bill.name === 'Water')?.date).toBe('2027-01-20')
  })
})

describe('Spent, Due and pace with bills', () => {
  const bills = (document: BudgetDocument, today = '2026-11-11', month = '2026-11') => monthSpending(document, month, today).rows.find(row => row.key === 'pot:bills')!

  it('counts assumed bills as Spent, and every bill still to come as Due', () => {
    // Card spend: Streamflix £19.99 on 5 Nov. Assumed by the 11th: council tax, water, phone. The Streamflix bill is on the Amex.
    expect(bills(seed())).toMatchObject({ billsPaidPence: 5926 + 8065 + 9491, spentPence: 1999 + 5926 + 8065 + 9491, duePence: 6639 + 8778 })
    // On the 1st, the Amex bill is due too; on the 30th nothing is.
    expect(bills(seed(), '2026-11-01')).toMatchObject({ billsPaidPence: 5926, duePence: 7352 + 8065 + 9491 + 6639 + 8778 })
    expect(bills(seed(), '2026-11-30')).toMatchObject({ duePence: 0 })
  })

  it('leaves a tracked bill out of Spent once its day has passed, and out of Due', () => {
    const row = bills(seed(), '2026-11-03')
    expect(row.billsPaidPence).toBe(5926)
    expect(row.duePence).toBe(8065 + 9491 + 6639 + 8778)
  })

  it('keeps Left as Planned − Spent − Taken', () => {
    const row = bills(seed())
    expect(row.leftPence).toBe(row.plannedPence - row.spentPence - row.takenPence)
  })

  it('counts a yearly bill in full in its month', () => {
    const december = bills(seed(), '2026-12-10', '2026-12')
    // Breakdown cover is on the Amex, so it's never assumed: December's assumed bills are the monthly ones.
    expect(december.billsPaidPence).toBe(5926 + 8065 + 9491)
    const january = bills(seed(), '2027-01-15', '2027-01')
    expect(january.billsPaidPence).toBe(5926 + 8065 + 9491 + 122448)
  })

  it('ignores bills to an account (P2)', () => {
    const document = everyMonth(seed(), items => items.map(item => item.name === 'Streaming' ? { ...item, bill: { paidBy: 'direct-debit', day: 3 } } : item))
    expect(monthBills(document, '2026-11', '2026-11-11').some(bill => bill.name === 'Streaming')).toBe(true)
    const figures = monthSpending(document, '2026-11', '2026-11-11')
    expect(figures.rows.some(row => row.destination.kind === 'account')).toBe(false)
    expect(figures.spentPence).toBe(monthSpending(seed(), '2026-11', '2026-11-11').spentPence)
  })

  it('shows a pot with a bill this month even with nothing spent', () => {
    const document = seed()
    document.budget.pots.push({ id: 'cover', name: 'Cover', accountId: 'joint' })
    document.card!.pots.cover = { carriesOver: true }
    everyMonth(document, items => [...items, { ...items.find(item => item.name === 'Water')!, id: 'cover-item', name: 'Gadget cover', destination: { kind: 'pot', potId: 'cover' }, bill: { paidBy: 'direct-debit', day: 25 } }])
    expect(monthSpending(document, '2026-11', '2026-11-11').rows.find(row => row.key === 'pot:cover')).toMatchObject({ spentPence: 0, duePence: 8065 })
    expect(monthSpending(seed(), '2026-11', '2026-11-11').rows.some(row => row.key === 'pot:cover')).toBe(false)
  })

  it('paces a steady pot with bills on their days (P4)', () => {
    const document = everyMonth(seed(), items => [...items, { ...items.find(item => item.name === 'Groceries')!, id: 'veg', name: 'Veg box', entryAmountPence: 3000, amountPence: 3000, funding: 'equal', bill: { paidBy: 'direct-debit', day: 5 } }])
    const groceries = (today: string) => monthSpending(document, '2026-11', today).rows.find(row => row.key === 'pot:groceries')!
    // Planned £355.47, of which the £30.00 veg box comes out on the 5th; the other £325.47 is steady.
    const eleventh = groceries('2026-11-11')
    expect(eleventh).toMatchObject({ plannedPence: 35547, billsPaidPence: 3000, spentPence: 18190 + 3000 })
    expect(eleventh.expectedPence).toBe(3000 + Math.round(32547 * 11 / 30))
    expect(eleventh.aheadPence).toBe(21190 - eleventh.expectedPence!)
    // Runs out on the steady spend alone: £181.90 over 11 days against £325.47.
    expect(eleventh.runsOut).toBe(`2026-11-${Math.ceil(32547 / (18190 / 11))}`)
    // Before the bill's day it isn't expected yet.
    expect(groceries('2026-11-04').expectedPence).toBe(Math.round(32547 * 4 / 30))
  })
})

describe('pot balances with bills', () => {
  const checkedAt = (document: BudgetDocument, at: string) => { document.card!.pots.bills = { ...document.card!.pots.bills, checkedBalance: { pence: 124000, at } }; return document }
  const billsFlow = (document: BudgetDocument, today = '2026-11-11') => potBalance(document, 'bills', today).since.find(row => row.flow === 'bills')?.pence

  it('takes assumed bills off the balance after the check, at the start of their day', () => {
    // Checked 31 Oct: council tax, water and the phone have gone out since; Streamflix is on the Amex.
    expect(billsFlow(seed())).toBe(-(5926 + 8065 + 9491))
    // Checked mid-morning on the 5th: water went out that morning, before the check.
    expect(billsFlow(checkedAt(seed(), '2026-11-05T10:00:00.000Z'))).toBe(-9491)
    // Checked late on the 4th: water is after it.
    expect(billsFlow(checkedAt(seed(), '2026-11-04T23:30:00.000Z'))).toBe(-(8065 + 9491))
    // Checked after the 9th: nothing since.
    expect(billsFlow(checkedAt(seed(), '2026-11-10T09:00:00.000Z'))).toBeUndefined()
  })

  it('counts bills across months since the check, and none before today', () => {
    expect(billsFlow(checkedAt(seed(), '2026-10-15T12:00:00.000Z'))).toBe(-(6639 + 8778 + 5926 + 8065 + 9491))
    expect(potFlows(seed(), 'bills', '2026-11-11', '2026-11').filter(row => row.flow === 'bills').map(row => row.pence)).toEqual([-5926, -8065, -9491])
  })

  it('leaves bills still due this month out of Free', () => {
    const balance = potBalance(seed(), 'bills', '2026-11-11')
    expect(balance.billsDuePence).toBe(6639 + 8778)
    expect(balance.freePence).toBe(balance.balancePence! - balance.waitingPence - balance.billsDuePence)
  })

  it('ignores bills to an account', () => {
    const document = everyMonth(seed(), items => items.map(item => item.name === 'Streaming' ? { ...item, bill: { paidBy: 'direct-debit', day: 3 } } : item))
    expect(potBalance(document, 'bills', '2026-11-11')).toEqual(potBalance(seed(), 'bills', '2026-11-11'))
  })
})
