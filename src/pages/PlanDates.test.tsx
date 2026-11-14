// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { planDates, reminderFrom } from '../domain/recurringBills'
import { resolveBudget } from '../domain/monthlyBudget'
import { MonthlyBudget } from './MonthlyBudget'

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const TODAY = '2026-11-13'
beforeEach(() => { try { window.localStorage.clear() } catch { /* jsdom */ } })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('planDates', () => {
  it('orders monthly bills by day, the last day last, and yearly ones by next renewal', () => {
    const document = seed()
    const items = resolveBudget(document.budget, '2026-11').items.map(item => item.name === 'Broadband' ? { ...item, bill: { paidBy: 'direct-debit' as const, day: 'last' as const } } : item)
    const { monthly, yearly, undated } = planDates(document, items, TODAY)
    expect(monthly.map(row => row.item.name)).toEqual(['Council tax', 'Streamflix', 'Water', 'Mobile plans', 'Electricity', 'Broadband'])
    expect(yearly.map(row => [row.item.name, row.renews, row.remindFrom])).toEqual([
      ['Breakdown cover', '2026-12-06', '2026-11-08'], ['Home insurance', '2027-01-12', '2026-12-15'],
      ['Car insurance', '2027-03-03', '2027-01-20'], ['TV licence', '2027-04-01', '2027-03-18'],
    ])
    expect(undated).toEqual([])
  })

  it('has no reminder when it’s off, and lists yearly items with no date', () => {
    expect(reminderFrom('2027-03-03', { remindWeeks: 0 })).toBeUndefined()
    expect(reminderFrom('2027-03-03', {})).toBe('2027-02-03')
    const document = seed()
    const items = resolveBudget(document.budget, '2026-11').items.map(item => item.name === 'TV licence' ? { ...item, bill: undefined } : item)
    expect(planDates(document, items, TODAY).undated.map(item => item.name)).toEqual(['TV licence'])
  })
})

function Harness({ initial }: { initial: BudgetDocument }) {
  const [document, setDocument] = useState(initial)
  return <MonthlyBudget document={document} setDocument={setDocument} view="plan" month="2026-11" today={TODAY}/>
}
const desktop = () => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))

describe('Plan › Dates', () => {
  it('switches to Dates on desktop: every month by day, once a year by renewal with the reminder', () => {
    desktop()
    render(<Harness initial={seed()}/>)
    fireEvent.click(within(screen.getByRole('group', { name: 'Group items by' })).getByRole('button', { name: 'Dates' }))
    expect(screen.getByText('10 bills')).toBeInTheDocument()
    const monthly = screen.getByRole('table', { name: 'Every month, by day' })
    expect(within(monthly).getAllByRole('row').slice(1).map(row => [...row.children].map(cell => cell.textContent))).toEqual([
      ['1st', 'Council tax', 'Direct debit', 'Bills · Monzo Joint', '£59.26'],
      ['2nd', 'Streamflix', 'Card · Amex', 'Bills · Monzo Joint', '£73.52'],
      ['5th', 'Water', 'Direct debit', 'Bills · Monzo Joint', '£80.65'],
      ['9th', 'Mobile plans', 'Card', 'Bills · Monzo Joint', '£94.91'],
      ['18th', 'Electricity', 'Direct debit', 'Bills · Monzo Joint', '£66.39'],
      ['22nd', 'Broadband', 'Direct debit', 'Bills · Monzo Joint', '£87.78'],
    ])
    expect(screen.getByText('£462.51 a month')).toBeInTheDocument()
    const yearly = screen.getByRole('table', { name: 'Once a year, by renewal' })
    expect(within(yearly).getAllByRole('row').slice(1).map(row => [...row.children].map(cell => cell.textContent))).toEqual([
      ['6 Dec', 'Breakdown coverBills · Monzo Joint', 'Card · Amex', 'Showing on Home', '£1,395.60£116.30 a month'],
      ['12 Jan', 'Home insuranceBills · Monzo Joint', 'Direct debit', 'From 15 Dec', '£1,224.48£102.04 a month'],
      ['3 Mar', 'Car insuranceBills · Monzo Joint', 'Direct debit', 'From 20 Jan', '£1,310.04£109.17 a month'],
      ['1 Apr', 'TV licenceBills · Monzo Joint', 'Direct debit', 'From 18 Mar', '£1,481.16£123.43 a month'],
    ])
    expect(screen.getByText('£5,411.28 a year · £450.94 a month set aside')).toBeInTheDocument()
    // Each row opens the item editor.
    fireEvent.click(within(yearly).getByRole('button', { name: 'Car insurance' }))
    expect(within(screen.getByRole('dialog', { name: 'Edit item' })).getByLabelText('Renews on')).toHaveValue('3')
  })

  it('prompts for yearly items with no date, and Add dates opens the first', () => {
    desktop()
    const document = seed()
    for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items = snapshot.items.map(item => item.name === 'TV licence' ? { ...item, bill: undefined } : item)
    render(<Harness initial={document}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Dates' }))
    expect(screen.getByText('1 yearly item has no renewal date.').parentElement).toHaveTextContent('TV licence')
    fireEvent.click(screen.getByRole('button', { name: 'Add dates' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit item' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('TV licence')
  })

  it('lists rows on phones and remembers Dates on this device', () => {
    render(<Harness initial={seed()}/>)
    fireEvent.click(screen.getByRole('button', { name: /^Filter/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: 'Dates' }))
    expect(window.localStorage.getItem('north.plan.grouping')).toBe('dates')
    fireEvent.keyDown(window.document.activeElement ?? window.document.body, { key: 'Escape' })
    const list = screen.getByRole('list', { name: 'Every month' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Council tax1st · Direct debit · Bills · Monzo Joint£59.26')
  })

  it('shows an empty state when nothing has a date', () => {
    desktop()
    const document = seed()
    for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items = snapshot.items.map(item => ({ ...item, bill: undefined }))
    render(<Harness initial={document}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Dates' }))
    expect(screen.getByText('No recurring bills yet')).toBeInTheDocument()
    expect(screen.getByText('4 yearly items have no renewal date.')).toBeInTheDocument()
  })
})

describe('Edit the item from the Renewal sheet', () => {
  it('arrives on Plan with that item’s editor open, once', () => {
    const document = seed()
    const id = resolveBudget(document.budget, '2026-11').items.find(item => item.name === 'Breakdown cover')!.id
    window.history.replaceState({ northEditItem: id }, '')
    render(<Harness initial={document}/>)
    const editor = screen.getByRole('dialog', { name: 'Edit item' })
    expect(within(editor).getByDisplayValue('Breakdown cover')).toBeInTheDocument()
    expect(window.history.state?.northEditItem).toBeUndefined()
  })
})
