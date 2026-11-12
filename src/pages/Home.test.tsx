// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
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
  render(<Home document={document} month={month} today={today} onOpen={onOpen}/>)
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
  expect(screen.getByRole('heading', { name: 'To do7' })).toBeInTheDocument()
  expect(within(todo).getAllByRole('button').map(row => row.querySelector('.list-row-title')?.textContent)).toEqual([
    'Settle the October statement', 'Close October', 'Fund November', 'Sort 4 Amex transactions', 'Set aside in the Amex pot', 'Bring the plan back to Available', expect.stringMatching(/ahead of pace$/),
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
    'Tue 24November statement closes£649.23 so far', 'Fri 27Ada’s pay arrivesDecember’s money', 'Mon 30Ben’s pay arrivesDecember’s money', 'Sat 19November statement due', 'Thu 24Ada’s pay arrivesJanuary’s money',
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
  const { unmount } = render(<Home document={household()} month={month} today="2026-11-11" onOpen={vi.fn()}/>)
  const note = screen.getByRole('note')
  expect(note).toHaveTextContent('Transfers is now Payday, on Month. Household is in Settings.')
  fireEvent.click(within(note).getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('note')).toBeNull()
  unmount()
  render(<Home document={household()} month={month} today="2026-11-11" onOpen={vi.fn()}/>)
  expect(screen.queryByRole('note')).toBeNull()
  window.localStorage.removeItem('north.whatMoved')
})
