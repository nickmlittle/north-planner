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
  const [message, setMessage] = useState('')
  return <><p role="status">{message}</p><CardSettings document={document} notify={setMessage} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/></>
}

it('asks for an account first', () => {
  const document = household()
  document.budget.accounts = []
  document.budget.pots = []
  render(<CardSettings document={document} setDocument={() => {}}/>)
  expect(screen.getByText('No accounts yet')).toBeInTheDocument()
  expect(screen.getByText('Add an account first. A card is paid from one of them.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add a card' })).not.toBeInTheDocument()
})

it('requires the closing day and the days until due, then saves the card', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} onChange={document => { saved = document }}/>)
  expect(screen.getByText('No cards yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add a card' }))
  expect(screen.getByRole('dialog', { name: 'Add a card' })).toBeInTheDocument()
  const form = screen.getByRole('form', { name: 'Add a card' })
  expect(within(form).getByLabelText('Name')).toHaveValue('Amex')
  expect(within(form).getByLabelText('Statement closes on day')).toHaveValue('')
  expect(within(form).getByLabelText('Days until payment is due')).toHaveValue('')
  // The joint account is the default to pay from, and its main balance the default buffer.
  expect(within(form).getByLabelText('Paid from')).toHaveValue('joint')
  expect(within(form).getByRole('option', { name: 'Monzo Joint main balance' })).toBeInTheDocument()

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save card' }))
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
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save card' }))

  expect(saved?.card?.cards).toEqual([{ id: expect.any(String), name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', bufferDestination: { kind: 'pot', potId: 'buffer' }, cardholders: [{ suffix: '41001', personId: 'ada' }] }])
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(screen.getByRole('status')).toHaveTextContent('Amex saved.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Closes on the 24th · due 25 days later · paid from Monzo Joint · Ada ··41001')).toBeInTheDocument()
})

it('edits an existing card', () => {
  const document = household()
  document.card = { cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }], transactions: [], rules: [], statements: {}, months: {}, pots: {}, imports: [] }
  let saved: BudgetDocument | undefined
  render(<Harness initial={document} onChange={next => { saved = next }}/>)
  expect(screen.getByText(/· No card endings yet. North asks when it first sees one.$/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Amex' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
  const form = screen.getByRole('form', { name: 'Edit Amex' })
  expect(within(form).getByLabelText('Statement closes on day')).toHaveValue('24')
  fireEvent.change(within(form).getByLabelText('Days until payment is due'), { target: { value: '21' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save card' }))
  expect(saved?.card?.cards[0]).toMatchObject({ id: 'amex', dueDaysAfterClose: 21 })
})

it('sets money aside in a pot from a chosen statement, and paying from it shows in the summary', () => {
  let saved: BudgetDocument | undefined
  const document = household()
  document.budget.pots.push({ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' })
  document.card = { cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }], transactions: [], rules: [], statements: {}, months: {}, pots: {}, imports: [] }
  render(<Harness initial={document} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Amex' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
  const form = screen.getByRole('form', { name: 'Edit Amex' })
  expect(within(form).getByLabelText('Set money aside in')).toHaveValue('')
  expect(within(form).queryByLabelText('Starting with')).not.toBeInTheDocument()
  fireEvent.change(within(form).getByLabelText('Set money aside in'), { target: { value: 'amex-pot' } })
  // The statement open today is the default (today is the device's date, so check it's one of the choices).
  const from = within(form).getByLabelText('Starting with') as HTMLSelectElement
  expect(from.value).toMatch(/^\d{4}-\d{2}-24$/)
  expect(within(form).getByText('As you review, move each pot’s share into the Amex pot. The bill is paid from it.')).toBeInTheDocument()
  fireEvent.change(from, { target: { value: from.options[1]!.value } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save card' }))
  expect(saved!.card!.cards[0]!.setAside).toEqual({ potId: 'amex-pot', fromCloseDate: from.options[1]!.value })
  expect(decodeBudgetDocument(saved)).not.toBeNull()
  expect(screen.getByText(/paid from the Amex pot from the \w+ statement/)).toBeInTheDocument()
})

it('removes a card with no history, and offers only Edit once it has statements', () => {
  const document = household()
  document.card = { cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }], transactions: [], rules: [], statements: {}, months: {}, pots: {}, imports: [] }
  let saved: BudgetDocument | undefined
  render(<Harness initial={document} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Amex' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove Amex?' })).getByRole('button', { name: 'Remove card' }))
  expect(saved!.card!.cards).toEqual([])
  expect(screen.getByRole('status')).toHaveTextContent('Amex removed.')
  cleanup()
  document.card.statements = { 'amex:2026-10-24': { cardId: 'amex', closeDate: '2026-10-24' } }
  render(<Harness initial={document} onChange={() => {}}/>)
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Amex' }))
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Edit'])
})
