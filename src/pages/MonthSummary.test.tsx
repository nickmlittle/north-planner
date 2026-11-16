// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import { closeMonth, markAllIn } from '../domain/monthStages'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { Home } from './Home'
import { MonthPage } from './MonthPage'

afterEach(cleanup)

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, statementKey = 'amex:2026-10-24'): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {},
})
const now = new Date('2026-11-04T09:00:00Z')

/** October: Groceries £8.20 left, Eating out £35.00 over, Car £45.00 left, Bills (carries over) £40.00 gone out, Holidays (Saving) put by. */
function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'car', name: 'Car', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }, { id: 'holidays', name: 'Holidays', accountId: 'joint' }]
  document.budget.incomeSources = [{ id: 'a', personId: 'ada', name: 'Pay', type: 'employment', baseAmountPence: 300000, changes: {} }, { id: 'b', personId: 'ben', name: 'Pay', type: 'employment', baseAmountPence: 200000, changes: {} }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  const items = [item('g', 'groceries', 52000), item('e', 'eating', 15000), item('c', 'car', 8000), item('b', 'bills', 15000), item('h', 'holidays', 20000)]
  document.budget.snapshots['2026-09'] = { items }
  document.budget.snapshots['2026-10'] = { items }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    pots: { bills: { kind: 'carries-over', carriesOver: true }, holidays: { kind: 'saving' } },
    transactions: [tx('2026-09-06', pot('groceries'), 47000, 'amex:2026-09-24'), tx('2026-09-15', pot('eating'), 12000, 'amex:2026-09-24'),
      tx('2026-10-05', pot('groceries'), 51180), tx('2026-10-10', pot('eating'), 18500), tx('2026-10-12', pot('car'), 3500), tx('2026-10-28', pot('bills'), 4000, 'amex:2026-11-24')],
    imports: [{ at: '2026-11-04T08:00:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 1, added: 1, skipped: 0, sortedByRules: 0, latestDate: '2026-10-28', matchesSummary: true }],
  }
  return document
}
const closed = (document = household()) => closeMonth(markAllIn(document, '2026-10', now), '2026-10', '2026-11-04', now)

function LiveHome({ initial, today, onOpen = vi.fn() }: { initial: BudgetDocument; today: string; onOpen?: (target: unknown) => void }) {
  const [document, setDocument] = useState(initial)
  return <Home document={document} setDocument={setDocument} month={today.slice(0, 7)} today={today} onOpen={onOpen}/>
}
function LiveMonth({ initial, today }: { initial: BudgetDocument; today: string }) {
  const [document, setDocument] = useState(initial)
  return <MonthPage document={document} setDocument={setDocument} month="2026-10" onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={() => {}} today={today}/>
}

it('leads Home with how the closed month went, above the verdict, until Seen it', () => {
  render(<LiveHome initial={closed()} today="2026-11-04"/>)
  const summary = screen.getByRole('region', { name: 'How did October go?' })
  expect(within(summary).getByRole('heading', { level: 2 })).toHaveTextContent('How did October go?')
  expect(summary).toHaveTextContent('Eating out £35.00 over. Groceries £8.20 left. Car £45.00 left.')
  expect(summary).toHaveTextContent('Tracked pots£731.80 of £750.00 · £141.80 more than September')
  expect(summary).toHaveTextContent('Groceries £511.80 of £520.00 · £41.80 more than September')
  expect(summary).toHaveTextContent('Bills£40.00 of £150.00 went out')
  expect(summary).toHaveTextContent('Saving£200.00 put by')
  expect(summary).toHaveTextContent('Covers£35.00 from the buffer')
  expect(summary).toHaveTextContent('Eating out £35.00 from Joint · not moved yet')
  expect(summary).toHaveTextContent('Into NovemberCar £45.00 stays in the pot')
  // It leads the page: the To do heading comes after it.
  expect(summary.compareDocumentPosition(screen.getByRole('heading', { name: /^To do/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(summary).getByRole('button', { name: 'Seen it' }))
  expect(screen.queryByRole('region', { name: 'How did October go?' })).not.toBeInTheDocument()
})

it('opens the closed month or one of its pots from the summary', () => {
  const onOpen = vi.fn()
  render(<LiveHome initial={closed()} today="2026-11-04" onOpen={onOpen}/>)
  const summary = screen.getByRole('region', { name: 'How did October go?' })
  fireEvent.click(within(summary).getByRole('button', { name: 'Open October' }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'month', month: '2026-10' })
  fireEvent.click(within(summary).getByRole('button', { name: 'Groceries' }))
  expect(onOpen).toHaveBeenLastCalledWith({ view: 'month', month: '2026-10', potId: 'groceries' })
})

it('stops leading Home after the 7th, and before the month is closed', () => {
  const { unmount } = render(<LiveHome initial={closed()} today="2026-11-07"/>)
  expect(screen.getByRole('region', { name: 'How did October go?' })).toBeInTheDocument()
  unmount()
  render(<LiveHome initial={closed()} today="2026-11-08"/>)
  expect(screen.queryByRole('region', { name: 'How did October go?' })).not.toBeInTheDocument()
  cleanup()
  render(<LiveHome initial={household()} today="2026-11-04"/>)
  expect(screen.queryByRole('region', { name: 'How did October go?' })).not.toBeInTheDocument()
})

it('keeps the summary on the closed month as one line that opens, and Needs a look goes once the cover is ticked', () => {
  render(<LiveMonth initial={closed()} today="2026-11-04"/>)
  const line = screen.getByRole('button', { name: /How did October go\?/ })
  expect(line).toHaveTextContent('Eating out £35.00 over. Groceries £8.20 left. Car £45.00 left.')
  expect(screen.getByRole('region', { name: 'Needs a look' })).toHaveTextContent('Eating out')
  fireEvent.click(line)
  expect(screen.getByRole('region', { name: 'How did October go?' })).toHaveTextContent('Eating out £35.00 from Joint · not moved yet')
  expect(within(screen.getByRole('region', { name: 'How did October go?' })).queryByRole('button', { name: 'Seen it' })).not.toBeInTheDocument()
  // Tick the cover step: it leaves Needs a look and reads "moved" in the summary.
  fireEvent.click(screen.getByRole('button', { name: /October closed/ }))
  fireEvent.click(screen.getByRole('button', { name: /Move from Joint into Eating out.* done/ }))
  expect(screen.queryByRole('region', { name: 'Needs a look' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'How did October go?' })).toHaveTextContent('Eating out £35.00 from Joint · moved')
})
