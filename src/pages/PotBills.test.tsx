// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { nextRenewal, yearlyBillsFor } from '../domain/recurringBills'
import { billStatus, paidByLabel } from './billLabels'
import { PotDetail } from './SpendingMonth'

afterEach(cleanup)

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const TODAY = '2026-11-13'
const cards = [{ id: 'amex', name: 'Amex' }]

describe('renewals and labels', () => {
  it('finds the next renewal on or after today', () => {
    expect(nextRenewal({ day: 6, month: 12 }, TODAY)).toBe('2026-12-06')
    expect(nextRenewal({ day: 12, month: 1 }, TODAY)).toBe('2027-01-12')
    expect(nextRenewal({ day: 13, month: 11 }, TODAY)).toBe('2026-11-13')
    expect(nextRenewal({ day: 12, month: 11 }, TODAY)).toBe('2027-11-12')
    expect(nextRenewal({ day: 'last', month: 2 }, '2027-03-01')).toBe('2028-02-29')
  })

  it('lists a pot’s yearly items by renewal, then those with no date', () => {
    const document = seed()
    for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items = snapshot.items.map(item => item.name === 'TV licence' ? { ...item, bill: undefined } : item)
    expect(yearlyBillsFor(document, 'bills', '2026-11', TODAY).map(row => [row.name, row.renews ?? null, row.monthlyPence, row.yearlyPence, row.tracked])).toEqual([
      ['Breakdown cover', '2026-12-06', 11630, 139560, true], ['Home insurance', '2027-01-12', 10204, 122448, false],
      ['Car insurance', '2027-03-03', 10917, 131004, false], ['TV licence', null, 12343, 148116, false],
    ])
  })

  it('says how a bill is paid and where it stands', () => {
    expect(paidByLabel({ paidBy: 'direct-debit', tracked: false }, cards)).toBe('Direct debit')
    expect(paidByLabel({ paidBy: 'card', tracked: true, cardId: 'amex' }, cards)).toBe('Card · Amex')
    expect(paidByLabel({ paidBy: 'card', tracked: false }, cards)).toBe('Card')
    const bill = (date: string, state: 'paid' | 'due', tracked = false) => billStatus({ date, state, tracked, cardId: 'amex' }, TODAY, cards)
    expect(bill('2026-11-09', 'paid')).toBe('Paid')
    expect(bill('2026-11-02', 'paid', true)).toBe('Via Amex')
    expect(bill('2026-11-14', 'due')).toBe('Due tomorrow')
    expect(bill('2026-11-18', 'due')).toBe('Due in 5 days')
    expect(bill('2026-11-20', 'due')).toBe('Due in 7 days')
    expect(bill('2026-11-22', 'due')).toBe('Due 22 Nov')
  })
})

describe('the pot page with bills (phone)', () => {
  const open = (document: BudgetDocument, potId = 'bills', month = '2026-11', today = TODAY) => render(<PotDetail document={document} setDocument={() => {}} potId={potId} month={month} today={today} onBack={() => {}}/>)

  it('shows the month’s figures with Due under Left, and what Spent is made of', () => {
    open(seed())
    const strip = screen.getByRole('region', { name: 'Planned, spent and left this month' })
    // Planned: the ten Bills items. Spent: £19.99 from the Amex, and council tax, water and the phone on their days.
    expect(within(strip).getByText('Spent').parentElement).toHaveTextContent('Spent£254.81£234.82 direct debits and cards, on their day · £19.99 sorted from Amex')
    expect(within(strip).getByText('Left').parentElement).toHaveTextContent(/£154\.17 of it due$/)
  })

  it('lists the bills by date with a Today line, Amex bills muted', () => {
    open(seed())
    const list = screen.getByRole('list', { name: 'Bills in November 2026' })
    expect(within(list).getAllByRole('listitem').map(row => row.getAttribute('aria-label') ?? row.textContent)).toEqual([
      'Council tax, £59.26, Sun 1 Nov, Direct debit, Paid',
      'Streamflix, £73.52, Mon 2 Nov, Card · Amex, Via Amex',
      'Water, £80.65, Thu 5 Nov, Direct debit, Paid',
      'Mobile plans, £94.91, Mon 9 Nov, Card, Paid',
      'Today · 13 Nov',
      'Electricity, £66.39, Wed 18 Nov, Direct debit, Due in 5 days',
      'Broadband, £87.78, Sun 22 Nov, Direct debit, Due 22 Nov',
    ])
    expect(screen.getByText('Amex bills are listed for their date only. Their spending comes in when you sort the statement.')).toBeInTheDocument()
  })

  it('has no Today line in another month, and a yearly bill in its month', () => {
    open(seed(), 'bills', '2026-12')
    const rows = within(screen.getByRole('list', { name: 'Bills in December 2026' })).getAllByRole('listitem').map(row => row.getAttribute('aria-label') ?? '')
    expect(rows.some(row => row.startsWith('Today'))).toBe(false)
    expect(rows).toContain('Breakdown cover, £1,395.60, Sun 6 Dec, Card · Amex, Via Amex')
    expect(rows.find(row => row.startsWith('Council tax'))).toMatch(/Due 1 Dec$/)
  })

  it('lists the yearly bills it sets aside for', () => {
    open(seed())
    expect(within(screen.getByRole('list', { name: 'Yearly bills set aside here' })).getAllByRole('listitem').map(row => row.textContent)).toEqual([
      'Breakdown coverRenews 6 Dec · Card · Amex£116.30 a month£1,395.60 a year',
      'Home insuranceRenews 12 Jan · Direct debit£102.04 a month£1,224.48 a year',
      'Car insuranceRenews 3 Mar · Direct debit£109.17 a month£1,310.04 a year',
      'TV licenceRenews 1 Apr · Direct debit£123.43 a month£1,481.16 a year',
    ])
  })

  it('a monthly pot shows Due and the bills in its lead, and lists them', () => {
    const document = seed()
    for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items = [...snapshot.items, { ...snapshot.items[0]!, id: 'veg', name: 'Veg box', entryAmountPence: 3000, amountPence: 3000, funding: 'equal', bill: { paidBy: 'direct-debit', day: 20 } }]
    open(document, 'groceries')
    expect(screen.getByText(/of it due/)).toHaveTextContent('£30.00 of it due · £181.90 sorted from Amex')
    expect(within(screen.getByRole('list', { name: 'Bills in November 2026' })).getAllByRole('listitem').map(row => row.getAttribute('aria-label') ?? row.textContent)).toEqual(['Today · 13 Nov', 'Veg box, £30.00, Fri 20 Nov, Direct debit, Due in 7 days'])
  })

  it('shows nothing about bills on a pot without any', () => {
    open(seed(), 'holidays')
    expect(screen.queryByRole('region', { name: 'This month' })).not.toBeInTheDocument()
    expect(screen.queryByText('Bills this month')).not.toBeInTheDocument()
  })
})
