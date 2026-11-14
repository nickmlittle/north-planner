// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { resolveBudget } from '../domain/monthlyBudget'
import { Home } from './Home'

afterEach(cleanup)
const month = '2026-11'
const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'bills', name: 'Bills' }]
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['nick', 'immy'] }]
  document.budget.pots = [{ id: 'bills-pot', name: 'Bills', accountId: 'joint' }]
  document.budget.incomeSources = [
    { id: 'n', personId: 'nick', name: 'Job', type: 'employment', baseAmountPence: 300000, changes: {}, payday: { day: 27, ifNotWorkingDay: 'previous' } },
    { id: 'i', personId: 'immy', name: 'Job', type: 'employment', baseAmountPence: 100000, changes: {} },
  ]
  return document
}

const renderHome = (document: BudgetDocument, today = '2026-11-11') => {
  const onOpen = vi.fn()
  render(<Home document={document} setDocument={vi.fn()} month={month} today={today} onOpen={onOpen}/>)
  return onOpen
}

it('leads with the month, its stage and the date, then a three-figure strip', () => {
  const onOpen = renderHome(seed())
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Home, November')
  expect(screen.getByText('In progress · 19 days left')).toBeInTheDocument()
  expect(screen.getByText('Wednesday 11 November')).toBeInTheDocument()
  const strip = screen.getByRole('region', { name: 'November at a glance' })
  expect([...strip.querySelectorAll('.stat-tile-label')].map(node => node.textContent)).toEqual(['Plan', 'Spent this month', 'Amex'])
  expect(within(strip).getByText('£1,141.87 over').closest('.stat-tile')).toHaveClass('is-critical')
  expect(strip).toHaveTextContent('£649.23 this statement')
  expect(strip).toHaveTextContent('£312.85 set aside · closes Tue 24 Nov')
  fireEvent.click(within(strip).getByRole('button', { name: 'Open Spending' }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'spending', section: 'sort' })
})

it('lists every task in one To do, by when it matters, with heads-ups last, and opens each', () => {
  const onOpen = renderHome(seed())
  const todo = screen.getByRole('list', { name: 'To do' })
  expect(screen.getByRole('heading', { name: 'To do8' })).toBeInTheDocument()
  expect([...todo.querySelectorAll('.list-row-title')].map(row => row.textContent)).toEqual([
    'Settle the October statement', 'Close October', 'Fund November', 'Sort 4 Amex transactions', 'Set aside in the Amex pot', 'Breakdown cover renews 6 Dec', 'Bring the plan back to Available', expect.stringMatching(/ahead of pace$/),
  ])
  expect(within(todo).getByText('Heads-up')).toBeInTheDocument()
  expect(within(todo).getByRole('button', { name: /Fund November/ })).toHaveTextContent('Ada 0 of 9Ben 0 of 9')
  fireEvent.click(within(todo).getByRole('button', { name: /Settle the October statement/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'spending', section: 'statements', statementKey: 'amex:2026-10-24' })
  fireEvent.click(within(todo).getByRole('button', { name: /Close October/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'month', month: '2026-10', close: true })
  fireEvent.click(within(todo).getByRole('button', { name: /Bring the plan back/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'plan', reviewPersonId: 'ben' })
})

it('shows Coming up and Done beside To do', () => {
  const onOpen = renderHome(seed())
  const coming = screen.getByRole('list', { name: 'Coming up' })
  expect(within(coming).getAllByRole('button').map(row => row.textContent)).toEqual([
    'Wed 18Electricity · £66.39Direct debit · Bills', 'Tue 24November statement closes£649.23 so far', 'Fri 27Ada’s pay arrivesDecember’s money', 'Mon 30Ben’s pay arrivesDecember’s money', 'Sat 19November statement due', 'Thu 24Ada’s pay arrivesJanuary’s money',
  ])
  fireEvent.click(within(coming).getByRole('button', { name: /Ada’s pay arrivesDecember/ }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'month', month: '2026-12' })
  expect(within(screen.getByRole('list', { name: 'Done' })).getByText('All October transactions sorted')).toBeInTheDocument()
})

it('says what comes next when there is nothing to do', () => {
  const document = household()
  document.budget.snapshots[month] = { items: [{ id: 'rent', name: 'Rent', categoryId: 'bills', destination: { kind: 'account', accountId: 'joint' }, entryAmountPence: 100000, amountPence: 100000, frequency: 'monthly', funding: 'proportional' }] }
  // Both fund the joint account; tick both steps.
  document.ticks = { [month]: { 'nick:fund:joint': { amountPence: 75000, at: '2026-11-01T09:00:00Z' }, 'immy:fund:joint': { amountPence: 25000, at: '2026-11-01T09:00:00Z' } } }
  renderHome(document)
  expect(screen.queryByRole('list', { name: 'To do' })).toBeNull()
  expect(screen.getByText('Nothing to do')).toBeInTheDocument()
  expect(screen.getByText('You’re set for November. Next: Nick’s pay arrives Fri 27 Nov.')).toBeInTheDocument()
  expect(screen.queryByText(/up to date/)).toBeNull()
})

it('starts a first run with Plan November and no claim that the plan fits', () => {
  const onOpen = renderHome(household())
  const strip = screen.getByRole('region', { name: 'November at a glance' })
  expect(strip).toHaveTextContent('Nothing planned for November yet')
  expect(strip.querySelectorAll('.stat-tile')).toHaveLength(1)
  expect(document.body).not.toHaveTextContent(/fits/)
  fireEvent.click(within(screen.getByRole('list', { name: 'To do' })).getByRole('button', { name: /Plan November/ }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'plan' })
})

it('says once where Transfers and Household went, until dismissed on this device', () => {
  window.localStorage.removeItem('north.whatMoved')
  const { unmount } = render(<Home document={household()} setDocument={vi.fn()} month={month} today="2026-11-11" onOpen={vi.fn()}/>)
  const note = screen.getByRole('note')
  expect(note).toHaveTextContent('Transfers is now Payday, on Month. Household is in Settings.')
  fireEvent.click(within(note).getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('note')).toBeNull()
  unmount()
  render(<Home document={household()} setDocument={vi.fn()} month={month} today="2026-11-11" onOpen={vi.fn()}/>)
  expect(screen.queryByRole('note')).toBeNull()
  window.localStorage.removeItem('north.whatMoved')
})

/** Home with a live document, so answering a renewal shows on screen. */
function Live({ initial, today, onOpen, onChange }: { initial: BudgetDocument; today: string; onOpen: (target: unknown) => void; onChange?: (document: BudgetDocument) => void }) {
  const [document, setDocument] = useState(initial)
  onChange?.(document)
  return <Home document={document} setDocument={setDocument} month={today.slice(0, 7)} today={today} onOpen={onOpen}/>
}
const insurance = (document: BudgetDocument, name: string, month = '2027-01') => resolveBudget(document.budget, month).items.find(item => item.name === name)!

it('answers a renewal from its row with Same price, with Undo', () => {
  let latest: BudgetDocument | undefined
  render(<Live initial={seed()} today="2026-11-14" onOpen={vi.fn()} onChange={document => { latest = document }}/>)
  const todo = screen.getByRole('list', { name: 'To do' })
  expect(within(todo).getByRole('button', { name: /Breakdown cover renews 6 Dec/ })).toHaveTextContent('In 3 weeks · £1,395.60 a year · Card · Amex')
  fireEvent.click(within(todo).getByRole('button', { name: 'Same price' }))
  expect(within(todo).queryByText('Breakdown cover renews 6 Dec')).not.toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Done' })).getByText('Breakdown cover price checked')).toBeInTheDocument()
  expect(screen.getByText('Breakdown cover: same price')).toBeInTheDocument()
  expect(Object.values(latest!.bills!.renewals)).toEqual(['2026-12-06'])
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(latest!.bills!.renewals).toEqual({})
  expect(within(screen.getByRole('list', { name: 'To do' })).getByText('Breakdown cover renews 6 Dec')).toBeInTheDocument()
})

it('opens the Renewal sheet, previews a new price from the renewal’s month and saves it', () => {
  let latest: BudgetDocument | undefined
  const document = seed()
  render(<Live initial={document} today="2026-12-20" onOpen={vi.fn()} onChange={next => { latest = next }}/>)
  fireEvent.click(within(screen.getByRole('list', { name: 'To do' })).getByRole('button', { name: /Home insurance renews 12 Jan/ }))
  const sheet = screen.getByRole('dialog', { name: 'Home insurance renews' })
  expect(sheet).toHaveTextContent('12 January 2027 · Direct debit · Bills')
  expect(sheet).toHaveTextContent('Planned now£1,224.48 a year · £102.04 a month')
  expect(sheet).toHaveTextContent('North marks £1,224.48 as paid from Bills on 12 January.')
  expect(within(sheet).queryByRole('region', { name: 'From January' })).not.toBeInTheDocument()
  fireEvent.change(within(sheet).getByLabelText(/New price/), { target: { value: '1300.00' } })
  const impact = within(sheet).getByRole('region', { name: 'From January' })
  expect(impact).toHaveTextContent('Bills sets aside£102.04 → £108.33 a month')
  expect(impact).toHaveTextContent('Changes apply: January 2027–February 2027.')
  expect(sheet).toHaveTextContent('12 January 2028')
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save new price' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Home insurance saved from January')).toBeInTheDocument()
  expect(insurance(latest!, 'Home insurance')).toMatchObject({ entryAmountPence: 130000, amountPence: 10833 })
  expect(insurance(latest!, 'Home insurance', '2026-12')).toEqual(insurance(document, 'Home insurance', '2026-12'))
})

it('asks for a price it can read, and links to the item editor', () => {
  const onOpen = vi.fn()
  render(<Live initial={seed()} today="2026-12-10" onOpen={onOpen}/>)
  fireEvent.click(within(screen.getByRole('list', { name: 'To do' })).getByRole('button', { name: /Breakdown cover renewed 6 Dec/ }))
  const sheet = screen.getByRole('dialog', { name: 'Breakdown cover renewed' })
  expect(sheet).toHaveTextContent('This year’s £1,395.60 comes from Bills when you sort it from the Amex statement.')
  fireEvent.change(within(sheet).getByLabelText(/New price/), { target: { value: 'lots' } })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Save new price' }))
  expect(within(sheet).getByRole('alert')).toHaveTextContent('Enter the yearly price, like 104.00.')
  fireEvent.click(within(sheet).getByRole('button', { name: 'Switched provider? Edit the item' }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'plan', editItemId: insurance(seed(), 'Breakdown cover', '2026-12').id, month: '2026-12' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('only offers Same price for an item split by fixed amounts', () => {
  const document = seed()
  const id = insurance(document, 'Breakdown cover', '2026-11').id
  const fixed = (items: BudgetDocument['budget']['snapshots'][string]['items']) => items.map(item => item.id === id ? { ...item, funding: 'fixed' as const, contributions: [{ personId: document.household.adults[0]!.id, amountPence: item.amountPence }] } : item)
  document.budget.snapshots = Object.fromEntries(Object.entries(document.budget.snapshots).map(([key, snapshot]) => [key, { ...snapshot, items: fixed(snapshot.items) }]))
  render(<Live initial={document} today="2026-11-14" onOpen={vi.fn()}/>)
  fireEvent.click(within(screen.getByRole('list', { name: 'To do' })).getByRole('button', { name: /Breakdown cover renews/ }))
  const sheet = screen.getByRole('dialog')
  expect(sheet).toHaveTextContent('Breakdown cover is split by fixed amounts, so change its price in the item editor.')
  expect(within(sheet).queryByRole('button', { name: 'Save new price' })).not.toBeInTheDocument()
  expect(within(sheet).getByRole('button', { name: 'Same price' })).toBeInTheDocument()
})
