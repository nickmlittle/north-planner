// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { markWaiting } from '../domain/cardSorting'
import { settleWithoutFinal } from '../domain/cardStatements'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { checkPotBalance } from '../domain/potBalances'
import { recordMove } from '../domain/setAside'
import { Spending } from './Spending'

afterEach(cleanup)

const NOV = 'amex:2026-11-24', OCT = 'amex:2026-10-24'
const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const tx = (id: string, date: string, amountPence: number, destination: BudgetDestination | null, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: 'purchase', cardSuffix: '41001', personId: 'ada', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})

/**
 * Settle up with rows waiting (audit 6, PR 7). Ada and Ben; the Amex pot, Groceries and a Buffer pot sit in Monzo Joint,
 * whose main balance is the buffer. November's £200.00: Tesco £120.00 moved in; Zara £50.00 asks Ada, Pizza £30.00 to discuss.
 */
function household(): BudgetDocument {
  let document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'buffer-pot', name: 'Buffer', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [tx('tesco', '2026-11-03', 12000, pot('groceries')), tx('zara', '2026-11-10', 5000, null), tx('pizza', '2026-11-15', 3000, null), tx('oct', '2026-10-10', 1500, null, { statementKey: OCT })],
  }
  document = recordMove(document, 'amex', ['tesco'], new Date('2026-11-20T09:00:00Z'), 'm1')
  document = markWaiting(document, 'zara', { kind: 'person', personId: 'ada' }, 'Which jumper?', new Date('2026-11-21T09:00:00Z'))
  document = markWaiting(document, 'pizza', { kind: 'discuss' }, undefined, new Date('2026-11-21T09:00:00Z'))
  document = checkPotBalance(document, 'amex-pot', 12000, new Date('2026-11-21T10:00:00Z'))
  return settleWithoutFinal(document, NOV, new Date('2026-11-30T09:00:00Z'))
}

let latest: BudgetDocument
function open(document: BudgetDocument, statementKey = NOV) {
  latest = document
  const Harness = () => {
    const [current, setCurrent] = useState(document)
    return <Spending document={current} setDocument={update => setCurrent(value => { latest = typeof update === 'function' ? update(value) : update; return latest })} view="statements" onSelectView={() => {}} onOpenCardSettings={() => {}} statementKey={statementKey} onOpenStatement={() => {}} today="2026-12-18"/>
  }
  render(<Harness/>)
}
const payRow = () => screen.getByRole('button', { name: 'Pay Amex from Monzo Joint done' }).closest('li')!

describe('a bill with rows waiting', () => {
  it('can be settled: the buffer covers the waiting, and the Amex pot covers its part', () => {
    open(household())
    expect(document.querySelector('.statement-summary-parts')).toHaveTextContent('In the Amex pot£120.00Waiting · 2£80.00')
    expect(screen.queryByRole('heading', { name: 'Before you can settle up' })).toBeNull()
    const pay = payRow()
    expect(pay).toHaveTextContent('£120.00 from the Amex pot + £80.00 from the buffer for 2 waiting.')
    expect(within(pay).getByRole('combobox', { name: 'Cover the waiting from' })).toHaveDisplayValue('Monzo Joint (the buffer)')
    expect(pay).toHaveTextContent('North keeps track. Once they’re sorted, their pots pay the buffer back.')
    expect(pay).toHaveTextContent('The Amex pot covers its part exactly.')
  })

  it('can be covered from another pot, which has to reach Monzo Joint first', () => {
    open(household())
    fireEvent.change(within(payRow()).getByRole('combobox', { name: 'Cover the waiting from' }), { target: { value: 'pot:buffer-pot' } })
    expect(latest.card!.statements[NOV]!.frontSource).toEqual(pot('buffer-pot'))
    expect(payRow()).toHaveTextContent('£80.00 from Buffer for 2 waiting.')
    expect(payRow()).toHaveTextContent('Move £80.00 from Buffer to Monzo Joint before you pay.')
    // The Amex pot itself is never offered.
    expect(within(payRow()).queryByRole('option', { name: /^Amex/ })).toBeNull()
  })

  it('ticking Pay records what the buffer covered, and unticking removes it (WP9)', () => {
    open(household())
    fireEvent.click(screen.getByRole('button', { name: 'Pay Amex from Monzo Joint done' }))
    expect(latest.card!.fronts).toEqual([expect.objectContaining({ statementKey: NOV, source: { kind: 'account', accountId: 'joint' }, transactions: [{ transactionId: 'zara', pence: 5000 }, { transactionId: 'pizza', pence: 3000 }] })])
    expect(screen.getByRole('heading', { level: 2, name: 'November statement' }).parentElement).toHaveTextContent(/Settled/)
    expect(document.querySelector('.statement-summary-parts')).toHaveTextContent('From the Amex pot£120.00From the buffer for 2 waiting£80.00')
    fireEvent.click(screen.getByRole('button', { name: /^Settle up2 of 2 done/ }))
    expect(payRow()).toHaveTextContent('£120.00 from the Amex pot + £80.00 from the buffer for 2 waiting.')
    fireEvent.click(screen.getByRole('button', { name: 'Pay Amex from Monzo Joint done' }))
    expect(latest.card!.fronts).toBeUndefined()
  })

  it('lists what’s waiting on it, and goes through a group from there', () => {
    open(household())
    const list = screen.getByRole('list', { name: 'Waiting on this bill' })
    expect(within(list).getAllByRole('listitem').map(row => row.textContent)).toEqual(['Ask Ada · 1£50.00Go through themGo through', 'To discuss · 1£30.00Go through themGo through'])
    expect(screen.getByText('Sort them before you pay, and they go into the Amex pot as usual: the buffer covers less.')).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Go through them: Ask Ada' }))
    expect(screen.getByRole('dialog', { name: 'Go through with Ada' })).toBeInTheDocument()
  })
})

describe('a statement that settles once', () => {
  it('still waits for every row to be sorted (WP3)', () => {
    open(markWaiting(settleWithoutFinal(household(), OCT, new Date('2026-11-30T09:00:00Z')), 'oct', { kind: 'discuss' }, undefined, new Date('2026-11-21T09:00:00Z')), OCT)
    expect(screen.getByRole('heading', { name: 'Before you can settle up' })).toBeInTheDocument()
    expect(screen.getByText('The October statement settles once, so sort them before you settle up.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Waiting on this bill' })).toBeInTheDocument()
  })
})
