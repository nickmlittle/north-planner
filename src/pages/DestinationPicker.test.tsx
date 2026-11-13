// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { defaultMonthlyBudget, type BudgetDestination } from '../domain/monthlyBudget'
import { DestinationPicker, type DestinationSelection } from './DestinationPicker'

afterEach(cleanup)
const adults = [{ id: 'nick', name: 'Sam' }, { id: 'immy', name: 'Sam' }]
function budgetFixture() {
  const budget = defaultMonthlyBudget()
  budget.accounts = [
    { id: 'joint', name: 'Current account', provider: 'Monzo', accountTypeId: 'current-account', ownerPersonIds: ['nick', 'immy'] },
    { id: 'n2', name: 'Current account', provider: 'Zopa', accountTypeId: 'current-account', ownerPersonIds: ['nick'] },
    { id: 'n1', name: 'Current account', provider: 'Barclays', accountTypeId: 'current-account', ownerPersonIds: ['nick'] },
    { id: 'i1', name: 'Mortgage', provider: 'Nationwide', accountTypeId: 'mortgage', ownerPersonIds: ['immy'] },
    { id: 'legacy', name: 'Old', ownerPersonIds: [] },
  ]
  budget.pots = [
    { id: 'p2', name: 'Spending', accountId: 'n1' },
    { id: 'p1', name: 'Bills', accountId: 'n1' },
    { id: 'p3', name: 'spending', accountId: 'n1' },
    { id: 'p4', name: 'Bills', accountId: 'n2' },
  ]
  return budget
}
function Fixture({ initial, people = adults, mutate }: { initial?: BudgetDestination; people?: typeof adults; mutate?: (budget: ReturnType<typeof budgetFixture>) => void }) {
  const [selection, setSelection] = useState<DestinationSelection>(initial ? { destination: initial } : {})
  const [budget] = useState(() => { const value = budgetFixture(); mutate?.(value); return value })
  return <><DestinationPicker budget={budget} adults={people} value={selection} onChange={setSelection}/><output data-testid="selection">{JSON.stringify(selection)}</output></>
}
const picker = () => screen.getByRole('region', { name: 'Destination' })

it('drills through stable owner groups, sorted accounts and pots, then changes a selection', () => {
  render(<Fixture/>)
  expect(within(picker()).getAllByRole('button').map(button => button.textContent)).toEqual(['Joint', 'Sam', 'Sam', 'Needs owner'])
  fireEvent.click(within(picker()).getAllByRole('button', { name: 'Sam' })[0]!)
  expect(within(picker()).getByRole('heading', { name: 'Choose an account' })).toHaveFocus()
  const accountButtons = within(picker()).getAllByRole('button').filter(button => button.classList.contains('destination-bubble'))
  expect(accountButtons.map(button => button.textContent)).toEqual(['Barclays · Current account', 'Zopa · Current account', '+ Add account'])
  fireEvent.click(accountButtons[0]!)
  expect(within(picker()).getByRole('navigation', { name: 'Destination path' })).toHaveTextContent('Sam›Barclays · Current account')
  expect(within(picker()).getAllByRole('button').filter(button => button.classList.contains('destination-bubble')).map(button => button.textContent)).toEqual(['Use account directly', 'Bills', 'Spending (Pot 1)', 'spending (Pot 2)', '+ Add pot'])
  fireEvent.click(within(picker()).getByRole('button', { name: 'Spending (Pot 1)' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"potId":"p2"')
  fireEvent.click(within(picker()).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Use account directly' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"accountId":"n1"')
})

it('supports no-pot accounts, unowned accounts and duplicate display names with stable IDs', () => {
  render(<Fixture initial={{ kind: 'account', accountId: 'i1' }}/>)
  expect(within(picker()).getByText('Nationwide Sam')).toBeVisible()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Change' }))
  expect(within(picker()).getByText('No pots in this account yet.')).toBeVisible()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Needs owner' }))
  fireEvent.click(within(picker()).getByRole('button', { name: /Old/ }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Use account directly' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"accountId":"legacy"')
})

it('keeps the saved destination while browsing back, until a new one is confirmed', () => {
  render(<Fixture initial={{ kind: 'pot', potId: 'p1' }}/>)
  const saved = screen.getByTestId('selection').textContent
  fireEvent.click(within(picker()).getByRole('button', { name: 'Change' }))
  expect(within(picker()).getByRole('button', { name: 'Bills' })).toHaveAttribute('aria-current', 'true')
  fireEvent.click(within(picker()).getByRole('button', { name: 'Owners' }))
  expect(screen.getByTestId('selection').textContent).toBe(saved)
  expect(within(picker()).getAllByRole('button', { name: 'Sam' })[0]).toHaveAttribute('aria-current', 'true')
  expect(within(picker()).getByText('Bills · Barclays Sam')).toBeVisible()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Joint' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Monzo · Current account' }))
  expect(screen.getByTestId('selection').textContent).toBe(saved)
  fireEvent.click(within(picker()).getByRole('button', { name: '← Keep current' }))
  expect(screen.getByTestId('selection').textContent).toBe(saved)
  // Chosen: the destination and Change, with no second "Destination" label.
  expect(within(picker()).queryByRole('heading')).not.toBeInTheDocument()
  expect(within(picker()).getByText('Bills · Barclays Sam')).toBeVisible()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Use account directly' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"accountId":"n1"')
})

it('stages only the selected account and pot, and keeps them while browsing away', () => {
  render(<Fixture/>)
  fireEvent.click(within(picker()).getAllByRole('button', { name: 'Sam' })[1]!)
  fireEvent.click(within(picker()).getByRole('button', { name: '+ Add account' }))
  expect(within(picker()).getAllByRole('checkbox')[1]).toBeChecked()
  fireEvent.change(within(picker()).getByLabelText('Bank / provider'), { target: { value: 'Monzo' } })
  fireEvent.change(within(picker()).getByLabelText('Account type'), { target: { value: 'current-account' } })
  fireEvent.click(within(picker()).getByRole('button', { name: 'Continue' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('{}')
  fireEvent.click(within(picker()).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(picker()).getByLabelText('Pot name'), { target: { value: ' Spending ' } })
  fireEvent.click(within(picker()).getByRole('button', { name: 'Use new pot' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"stagedAccount"')
  expect(screen.getByTestId('selection')).toHaveTextContent('"name":"Spending"')
  const saved = screen.getByTestId('selection').textContent
  fireEvent.click(within(picker()).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Owners' }))
  expect(screen.getByTestId('selection').textContent).toBe(saved)
  fireEvent.click(within(picker()).getByRole('button', { name: 'Joint' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Use account directly' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"accountId":"joint"')
  expect(screen.getByTestId('selection')).not.toHaveTextContent('"stagedAccount"')
  expect(screen.getByTestId('selection')).not.toHaveTextContent('"stagedPot"')
})

it('prevents a case-insensitive duplicate pot while allowing the existing match', () => {
  render(<Fixture/>)
  fireEvent.click(within(picker()).getAllByRole('button', { name: 'Sam' })[0]!)
  fireEvent.click(within(picker()).getByRole('button', { name: 'Barclays · Current account' }))
  fireEvent.click(within(picker()).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(picker()).getByLabelText('Pot name'), { target: { value: ' BILLS ' } })
  expect(within(picker()).getByText(/Already exists in this account/)).toBeVisible()
  expect(within(picker()).getByRole('button', { name: 'Use new pot' })).toBeDisabled()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Bills' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"potId":"p1"')
})

it('includes an owner without accounts and numbers matching legacy labels by stored order', () => {
  render(<Fixture people={[...adults, { id: 'third', name: 'Taylor' }]} mutate={budget => {
    budget.accounts.push({ id: 'duplicate', name: 'Current account', provider: 'Barclays', accountTypeId: 'current-account', ownerPersonIds: ['nick'] })
  }}/>)
  fireEvent.click(within(picker()).getByRole('button', { name: 'Taylor' }))
  expect(within(picker()).getByText('No accounts for this owner yet.')).toBeVisible()
  expect(within(picker()).getByRole('button', { name: '+ Add account' })).toBeVisible()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(picker()).getAllByRole('button', { name: 'Sam' })[0]!)
  expect(within(picker()).getByRole('button', { name: 'Barclays · Current account (Account 1)' })).toBeVisible()
  fireEvent.click(within(picker()).getByRole('button', { name: 'Barclays · Current account (Account 2)' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Use account directly' }))
  expect(screen.getByTestId('selection')).toHaveTextContent('"accountId":"duplicate"')
})

it('validates account creation and lets Cancel discard the inline draft', () => {
  render(<Fixture/>)
  fireEvent.click(within(picker()).getAllByRole('button', { name: 'Sam' })[0]!)
  fireEvent.click(within(picker()).getByRole('button', { name: '+ Add account' }))
  fireEvent.click(within(picker()).getByRole('button', { name: 'Continue' }))
  expect(within(picker()).getByRole('alert')).toHaveTextContent('Choose at least one owner and an account type')
  fireEvent.click(within(picker()).getByRole('button', { name: 'Cancel' }))
  expect(within(picker()).queryByLabelText('Bank / provider')).not.toBeInTheDocument()
  expect(screen.getByTestId('selection')).toHaveTextContent('{}')
})
