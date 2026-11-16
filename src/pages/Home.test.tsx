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

/** Open on To do's Open link: the sheet with every task, Coming up and Done. */
const openTodo = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  return screen.getByRole('dialog', { name: 'To do' })
}

it('leads with the month, its stage and the date, then the dated verdict, the top 3 jobs, the pot cards and a strip', () => {
  const onOpen = renderHome(seed())
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Home, November')
  expect(screen.getByText('In progress · 19 days left')).toBeInTheDocument()
  expect(screen.getByText('Wednesday 11 November')).toBeInTheDocument()
  const verdict = screen.getByRole('region', { name: 'How November is going' })
  expect(verdict).toHaveTextContent('Groceries £63 ahead of pace. Holidays on track.')
  expect(verdict).toHaveTextContent('Amex sorted to')
  expect(verdict).toHaveTextContent('to sort')
  // A card per Tracked pot, then the Amex bill.
  const cards = screen.getByRole('list', { name: 'November’s pots and the bill' })
  expect([...cards.querySelectorAll('.home-card-name')].map(node => node.textContent)).toEqual(['Groceries', 'Holidays', 'Amex'])
  expect(within(cards).getByRole('button', { name: 'Open Groceries' })).toHaveTextContent('£143.57 left£63 ahead · runs out ~Fri 20 NovThis week £35.89 · to Sun 15 Nov')
  expect(within(cards).getByRole('button', { name: 'Open Amex' })).toHaveTextContent('£649.23November bill so far · £312.85 in the Amex pot · closes Tue 24 Nov')
  fireEvent.click(within(cards).getByRole('button', { name: 'Open Groceries' }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'month', month, potId: 'groceries' })
  fireEvent.click(within(cards).getByRole('button', { name: 'Open Amex' }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'spending', section: 'sort' })
  // Bills, Saving and Plan.
  const strip = screen.getByRole('region', { name: 'November at a glance' })
  expect([...strip.querySelectorAll('.stat-tile-label')].map(node => node.textContent)).toEqual(['Bills', 'Plan'])
  expect(within(strip).getByText('£1,141.87 over').closest('.stat-tile')).toHaveClass('is-critical')
  expect(strip).toHaveTextContent('£154.17 still to go out · £796.03 spare')
  fireEvent.click(within(strip).getByRole('button', { name: 'Open Plan' }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'plan' })
})

it('shows the top 3 jobs, and Open shows every task, heads-ups last, and opens each', () => {
  const onOpen = renderHome(seed())
  const strip = screen.getByRole('list', { name: 'To do' })
  expect(screen.getByRole('heading', { name: 'To do8' })).toBeInTheDocument()
  expect([...strip.querySelectorAll('.list-row-title')].map(row => row.textContent)).toEqual(['Settle the October statement', 'Close October', 'Fund November'])
  const sheet = openTodo()
  const todo = within(sheet).getByRole('list', { name: 'All to do' })
  expect([...todo.querySelectorAll('.list-row-title')].map(row => row.textContent)).toEqual([
    'Settle the October statement', 'Close October', 'Fund November', 'Sort 4 Amex transactions', 'Set aside in the Amex pot', 'Breakdown cover renews 6 Dec', 'Bring the plan back to Available', expect.stringMatching(/ahead of pace$/),
  ])
  expect(within(todo).getByText('Heads-up')).toBeInTheDocument()
  expect(within(todo).getByRole('button', { name: /Fund November/ })).toHaveTextContent('Ada 0 of 5Ben 0 of 5Either of you 0 of 4')
  fireEvent.click(within(todo).getByRole('button', { name: /Bring the plan back/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'plan', reviewPersonId: 'ben' })
  // A row opens its page and the sheet closes behind it.
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('list', { name: 'To do' })).getByRole('button', { name: /Settle the October statement/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'spending', section: 'statements', statementKey: 'amex:2026-10-24' })
  fireEvent.click(within(screen.getByRole('list', { name: 'To do' })).getByRole('button', { name: /Close October/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'month', month: '2026-10', close: true })
})

it('keeps Coming up and Done in the To do sheet', () => {
  const onOpen = renderHome(seed())
  expect(screen.queryByRole('list', { name: 'Coming up' })).not.toBeInTheDocument()
  const sheet = openTodo()
  const coming = within(sheet).getByRole('list', { name: 'Coming up' })
  expect(within(coming).getAllByRole('button').map(row => row.textContent)).toEqual([
    'Wed 18Electricity · £66.39Direct debit · Bills', 'Tue 24November statement closes£649.23 so far', 'Fri 27Ada’s pay arrivesDecember’s money', 'Mon 30Ben’s pay arrivesDecember’s money', 'Sat 19November statement due', 'Thu 24Ada’s pay arrivesJanuary’s money',
  ])
  expect(within(within(sheet).getByRole('list', { name: 'Done' })).getByText('All October transactions sorted')).toBeInTheDocument()
  fireEvent.click(within(coming).getByRole('button', { name: /Ada’s pay arrivesDecember/ }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'month', month: '2026-12' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('closes the To do sheet on Escape without opening anything', () => {
  const onOpen = renderHome(seed())
  openTodo()
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'To do' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onOpen).not.toHaveBeenCalled()
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
  expect(screen.queryByRole('region', { name: 'How November is going' })).not.toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'November’s pots and the bill' })).not.toBeInTheDocument()
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
  openTodo()
  const todo = screen.getByRole('list', { name: 'All to do' })
  expect(within(todo).getByRole('button', { name: /Breakdown cover renews 6 Dec/ })).toHaveTextContent('In 3 weeks · £1,395.60 a year · Card · Amex')
  fireEvent.click(within(todo).getByRole('button', { name: 'Same price' }))
  expect(within(todo).queryByText('Breakdown cover renews 6 Dec')).not.toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Done' })).getByText('Breakdown cover price checked')).toBeInTheDocument()
  expect(screen.getByText('Breakdown cover: same price')).toBeInTheDocument()
  expect(Object.values(latest!.bills!.renewals)).toEqual(['2026-12-06'])
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(latest!.bills!.renewals).toEqual({})
  expect(within(screen.getByRole('list', { name: 'All to do' })).getByText('Breakdown cover renews 6 Dec')).toBeInTheDocument()
})

it('opens the Renewal sheet, previews a new price from the renewal’s month and saves it', () => {
  let latest: BudgetDocument | undefined
  const document = seed()
  render(<Live initial={document} today="2026-12-20" onOpen={vi.fn()} onChange={next => { latest = next }}/>)
  openTodo()
  fireEvent.click(within(screen.getByRole('list', { name: 'All to do' })).getByRole('button', { name: /Home insurance renews 12 Jan/ }))
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
  openTodo()
  fireEvent.click(within(screen.getByRole('list', { name: 'All to do' })).getByRole('button', { name: /Breakdown cover renewed 6 Dec/ }))
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
  openTodo()
  fireEvent.click(within(screen.getByRole('list', { name: 'All to do' })).getByRole('button', { name: /Breakdown cover renews/ }))
  const sheet = screen.getByRole('dialog')
  expect(sheet).toHaveTextContent('Breakdown cover is split by fixed amounts, so change its price in the item editor.')
  expect(within(sheet).queryByRole('button', { name: 'Save new price' })).not.toBeInTheDocument()
  expect(within(sheet).getByRole('button', { name: 'Same price' })).toBeInTheDocument()
})

it('leads with December’s payday from the first payday: what landed, the total, each person’s steps, and opens Month', () => {
  const document = seed()
  for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000; source.landsInAccountId = source.personId }
  const onOpen = renderHome(document, '2026-11-27')
  const card = screen.getByRole('region', { name: 'December’s payday' })
  expect(within(card).getByRole('heading', { name: 'December’s payday' })).toBeInTheDocument()
  expect(card).toHaveTextContent('0 of 11 steps')
  expect(card).toHaveTextContent('£7,700.00 in all · Ada’s £4,200.00 landed Fri 27 Nov · Ben’s £3,500.00 lands')
  expect(card).toHaveTextContent('Ada 0 of 4')
  expect(card).toHaveTextContent('Ben 0 of 3')
  expect(card).toHaveTextContent('Either of you 0 of 4')
  // It stands in for December's Fund row.
  openTodo()
  expect(within(screen.getByRole('list', { name: 'All to do' })).queryByRole('button', { name: /Fund December/ })).not.toBeInTheDocument()
  fireEvent.click(within(card).getByRole('button', { name: 'Open December’s steps' }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'month', month: '2026-12' })
})

it('shows what has landed on the Fund row before the first payday', () => {
  const document = seed()
  for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000 }
  renderHome(document, '2026-11-20')
  expect(screen.queryByRole('region', { name: 'December’s payday' })).not.toBeInTheDocument()
  openTodo()
  expect(within(screen.getByRole('list', { name: 'All to do' })).getByRole('button', { name: /Fund December/ })).toHaveTextContent('£7,700.00 in all · Ada’s £4,200.00 lands Fri 27 Nov')
})

it('names the month in the verdict on an overlap day, under December’s payday card', () => {
  const document = seed()
  for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000; source.landsInAccountId = source.personId }
  renderHome(document, '2026-11-27')
  expect(screen.getByRole('region', { name: 'December’s payday' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'How November is going' })).toHaveTextContent('November: Groceries £143.57 left. Holidays £1,586.36 left.')
})

it('opens To sort from the verdict’s date line', () => {
  const onOpen = renderHome(seed())
  fireEvent.click(within(screen.getByRole('region', { name: 'How November is going' })).getByRole('button', { name: /to sort/ }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'spending', section: 'sort' })
})
