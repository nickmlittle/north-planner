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
