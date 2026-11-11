// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { CardSettings } from './CardSettings'

afterEach(cleanup)

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [
    { id: 'ada-own', name: 'Current account', provider: 'Starling', ownerPersonIds: ['ada'], accountTypeId: 'current-account' },
    { id: 'joint', name: 'Current account', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'], accountTypeId: 'current-account' },
  ]
  document.budget.pots = [{ id: 'buffer', name: 'Buffer', accountId: 'joint' }]
  return document
}

function Harness({ initial, onChange }: { initial: BudgetDocument; onChange: (document: BudgetDocument) => void }) {
  const [document, setDocument] = useState(initial)
  return <CardSettings document={document} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

it('asks for an account first', () => {
  const document = household()
  document.budget.accounts = []
  document.budget.pots = []
  render(<CardSettings document={document} setDocument={() => {}}/>)
  expect(screen.getByText('Add an account on the Plan first. A card is paid from one of them.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add a card' })).not.toBeInTheDocument()
})

it('requires the closing day and the days until due, then saves the card', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} onChange={document => { saved = document }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Add a card' }))
  const form = screen.getByRole('form', { name: 'Add a card' })
  expect(within(form).getByLabelText('Name')).toHaveValue('Amex')
  expect(within(form).getByLabelText('Statement closes on day')).toHaveValue('')
  expect(within(form).getByLabelText('Days until payment is due')).toHaveValue('')
  // The joint account is the default to pay from, and its main balance the default buffer.
  expect(within(form).getByLabelText('Paid from')).toHaveValue('joint')
  expect(within(form).getByRole('option', { name: 'Monzo Joint main balance' })).toBeInTheDocument()

  fireEvent.click(within(form).getByRole('button', { name: 'Save card' }))
  expect(saved).toBeUndefined()
  expect(within(form).getByLabelText('Statement closes on day')).toHaveAccessibleDescription('Enter a day from 1 to 28.')
  expect(within(form).getByLabelText('Days until payment is due')).toHaveAccessibleDescription('Enter a number of days from 1 to 60.')

  fireEvent.change(within(form).getByLabelText('Statement closes on day'), { target: { value: '24' } })
  fireEvent.change(within(form).getByLabelText('Days until payment is due'), { target: { value: '25' } })
  expect(within(form).getByText('Statements run from the 25th to the 24th. The 24 Nov statement is due 19 Dec.')).toBeInTheDocument()
  fireEvent.change(within(form).getByLabelText('Buffer for overspends'), { target: { value: 'pot:buffer' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Add a card ending' }))
  fireEvent.change(within(form).getByLabelText('Card ending'), { target: { value: '-41001' } })
  fireEvent.change(within(form).getByLabelText('Card member'), { target: { value: 'ada' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save card' }))

  expect(saved?.card?.cards).toEqual([{ id: expect.any(String), name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', bufferDestination: { kind: 'pot', potId: 'buffer' }, cardholders: [{ suffix: '41001', personId: 'ada' }] }])
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(screen.getByRole('status')).toHaveTextContent('Amex saved.')
  expect(screen.getByText('Closes on the 24th · due 25 days later · paid from Monzo Joint')).toBeInTheDocument()
  expect(screen.getByText('Ada’s ends 41001')).toBeInTheDocument()
})

it('edits an existing card', () => {
  const document = household()
  document.card = { cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }], transactions: [], rules: [], statements: {}, months: {}, pots: {}, imports: [] }
  let saved: BudgetDocument | undefined
  render(<Harness initial={document} onChange={next => { saved = next }}/>)
  expect(screen.getByText('No card endings yet. North asks when it first sees one.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Amex' }))
  const form = screen.getByRole('form', { name: 'Edit Amex' })
  expect(within(form).getByLabelText('Statement closes on day')).toHaveValue('24')
  fireEvent.change(within(form).getByLabelText('Days until payment is due'), { target: { value: '21' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save card' }))
  expect(saved?.card?.cards[0]).toMatchObject({ id: 'amex', dueDaysAfterClose: 21 })
})
