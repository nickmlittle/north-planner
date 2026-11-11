// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { buildTransferInstructions } from '../domain/transferInstructions'
import { budgetTransfers } from '../domain/budgetTransfers'
import { orderTransferAccounts, personTransferPlans } from '../domain/personTransfers'
import { planSteps } from '../domain/transferTicks'
import { resolveBudget } from '../domain/monthlyBudget'
import { Home } from './Home'

afterEach(cleanup)
const month = '2026-11'

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'bills', name: 'Bills' }, { id: 'gifts', name: 'Gifts' }]
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['nick', 'immy'] },
    { id: 'immy-own', name: 'Current', provider: 'Monzo', ownerPersonIds: ['immy'] },
  ]
  document.budget.pots = [{ id: 'bills-pot', name: 'Bills', accountId: 'joint' }]
  document.budget.incomeSources = [
    { id: 'n', personId: 'nick', name: 'Job', type: 'employment', baseAmountPence: 300000, changes: {} },
    { id: 'i', personId: 'immy', name: 'Job', type: 'employment', baseAmountPence: 100000, changes: {} },
  ]
  const rent = { id: 'rent', name: 'Rent', categoryId: 'bills', destination: { kind: 'pot' as const, potId: 'bills-pot' }, entryAmountPence: 200000, amountPence: 200000, frequency: 'monthly' as const, funding: 'proportional' as const }
  document.budget.snapshots['2026-10'] = { items: [rent] }
  document.budget.snapshots[month] = { items: [rent, { id: 'gifts', name: 'Christmas presents', categoryId: 'gifts', destination: { kind: 'account', accountId: 'immy-own' }, entryAmountPence: 60000, amountPence: 60000, frequency: 'monthly', funding: 'single', singleFunderId: 'immy' }] }
  return document
}

function tickEverything(document: BudgetDocument): BudgetDocument {
  const ids = document.household.adults.map(person => person.id)
  const items = resolveBudget(document.budget, month).items
  const transfers = budgetTransfers(document.budget, ids, month, items)
  const instructions = buildTransferInstructions(document, month)
  const plans = personTransferPlans(orderTransferAccounts(transfers.accounts, instructions, document.budget.accounts, ids, new Map()), instructions, ids)
  const steps = Object.fromEntries(plans.people.flatMap(planSteps).map(step => [step.key, { amountPence: step.amountPence, at: '2026-11-02T09:00:00Z' }]))
  return { ...document, ticks: { [month]: steps } }
}

const renderHome = (document: BudgetDocument) => {
  const handlers = { onOpenPlan: vi.fn(), onOpenTransfers: vi.fn(), onReviewPerson: vi.fn() }
  render(<Home document={document} month={month} {...handlers}/>)
  return handlers
}

it('lists what each person has left to do, with whoever is over first', () => {
  const handlers = renderHome(household())
  expect(screen.getByRole('heading', { name: 'To do' }).parentElement).toHaveTextContent('To do2 left')
  const immy = screen.getByRole('region', { name: 'Immy' })
  expect(within(immy).getAllByRole('button').map(button => button.textContent)).toEqual([
    '£100.00 over this month£1,100.00 planned of £1,000.00 available. Review Immy’s items.',
    'Payday transfers2 to fund · 1 move · 0 of 3 done',
  ])
  expect(within(immy).getByText('1 to do')).toBeInTheDocument()
  fireEvent.click(within(immy).getByRole('button', { name: /over this month/ }))
  expect(handlers.onReviewPerson).toHaveBeenCalledWith('immy')
  fireEvent.click(within(immy).getByRole('button', { name: /Payday transfers/ }))
  expect(window.localStorage.getItem('north.transferPerson')).toBe('immy')
  expect(handlers.onOpenTransfers).toHaveBeenCalled()
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows what’s new in this month’s budget', () => {
  const handlers = renderHome(household())
  const coming = screen.getByRole('heading', { name: 'Coming up' }).closest('section')!
  fireEvent.click(within(coming).getByRole('button', { name: /New in November’s budget/ }))
  expect(within(coming).getByRole('button', { name: /New in November’s budget/ })).toHaveTextContent('Christmas presents')
  expect(handlers.onOpenPlan).toHaveBeenCalled()
})

it('counts changed steps and says when everyone is up to date', () => {
  const done = tickEverything(household())
  renderHome(done)
  expect(screen.getByRole('status')).toHaveTextContent('You’re up to date for November')
  expect(screen.getByRole('heading', { name: 'To do' }).parentElement).toHaveTextContent('To doAll done')
  expect(within(screen.getByRole('region', { name: 'Nick' })).getByRole('button')).toHaveTextContent('Payday transfersAll 2 steps ticked')
  cleanup()
  const changed = structuredClone(done)
  const key = Object.keys(changed.ticks![month]!).find(step => step.startsWith('nick:fund'))!
  changed.ticks![month]![key]!.amountPence -= 5000
  renderHome(changed)
  expect(screen.queryByText('You’re up to date for November')).toBeNull()
  expect(within(screen.getByRole('region', { name: 'Nick' })).getByRole('button')).toHaveTextContent('Payday transfers1 changed since ticked · send £50.00 more')
})

function withCard(): BudgetDocument {
  const document = household()
  document.budget.pots.push({ id: 'treats', name: 'Treats', accountId: 'immy-own' })
  document.budget.snapshots[month]!.items.push({ id: 'tr', name: 'Treats', categoryId: 'gifts', destination: { kind: 'pot', potId: 'treats' }, entryAmountPence: 20000, amountPence: 20000, frequency: 'monthly', funding: 'single', singleFunderId: 'immy' })
  document.budget.incomeSources[0]!.payday = { day: 28, ifNotWorkingDay: 'next' }
  document.budget.incomeSources[1]!.payday = { day: 28, ifNotWorkingDay: 'previous' }
  const line = (potId: string, pence: number) => ({ lines: [{ amountPence: pence, destination: { kind: 'pot' as const, potId } }], by: 'person' as const, at: 'x' })
  const tx = (id: string, date: string, pence: number, potId: string, statementKey = 'amex:2026-11-24') => ({ id, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence: pence, kind: 'purchase' as const, cardSuffix: '41001', statementKey, importedAt: 'x', sort: line(potId, pence) })
  document.card = {
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    transactions: [tx('a', '2026-10-10', 5000, 'treats', 'amex:2026-10-24'), tx('b', '2026-11-04', 21250, 'treats')],
    rules: [], statements: {}, months: {}, pots: {},
    imports: [{ at: '2026-11-09T19:30:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 2, added: 2, skipped: 0, sortedByRules: 0, latestDate: '2026-11-04', matchesSummary: true }],
  }
  return document
}

it('shows a card per month that isn’t finished: this month, last month’s checklist and next month', () => {
  const onOpenSpending = vi.fn(), onOpenTransfersMonth = vi.fn()
  render(<Home document={withCard()} month={month} today="2026-11-12" onOpenPlan={vi.fn()} onOpenTransfers={vi.fn()} onReviewPerson={vi.fn()} onOpenSpending={onOpenSpending} onOpenTransfersMonth={onOpenTransfersMonth}/>)
  const november = screen.getByRole('region', { name: 'November' })
  expect([...november.querySelectorAll('.spending-chip')].map(chip => chip.textContent)).toEqual(['In progress · 18 days left', 'Funding · 0 of 6', 'Sorted to 4 Nov', '1 pot needs care'])
  expect(november.querySelector('.home-month-spent')).toHaveTextContent('£212.50 of £2,200.00 spent')
  const over = within(november).getByRole('button', { name: /Treats · Current is £12.50 over/ })
  expect(over).toHaveTextContent('Covered when November closes')
  fireEvent.click(over)
  expect(onOpenSpending).toHaveBeenCalledWith({ view: 'month', month: '2026-11', potId: 'treats' })
  expect(within(november).getByRole('button', { name: /Bring in Amex transactions/ })).toHaveTextContent('Last done Mon 9 Nov')
  expect(within(november).getByRole('button', { name: /Bring in the final October statement/ })).toBeInTheDocument()
  const october = screen.getByRole('region', { name: 'October' })
  expect(within(october).getAllByRole('button').map(button => button.querySelector('.home-task-title')?.textContent)).toEqual(['All transactions in and sorted', 'Close October', 'Settle the October statement'])
  fireEvent.click(within(october).getByRole('button', { name: /Close October/ }))
  expect(onOpenSpending).toHaveBeenLastCalledWith({ view: 'month', month: '2026-10', close: true })
  fireEvent.click(within(october).getByRole('button', { name: /Settle the October statement/ }))
  expect(onOpenSpending).toHaveBeenLastCalledWith({ view: 'statements', statementKey: 'amex:2026-10-24' })
  expect(screen.getByRole('heading', { name: 'December · money arrives Fri 27 Nov · Mon 30 Nov' })).toBeInTheDocument()
})

it('keeps Home as it was without a card', () => {
  renderHome(household())
  expect(screen.queryByRole('region', { name: 'October' })).toBeNull()
  expect(document.querySelector('.home-months')).toBeNull()
})
