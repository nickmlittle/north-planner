// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { markWaiting, sortTransaction } from '../domain/cardSorting'
import { setSettleTick, settleWithoutFinal } from '../domain/cardStatements'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import { frontsOwed, setFrontSource } from '../domain/fronts'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { recordMove } from '../domain/setAside'
import { Spending } from './Spending'

// Moves are recorded at the real time, so it's 20 Dec: after November's Pay tick.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-12-20T12:00:00Z'))
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const NOV = 'amex:2026-11-24', DEC = 'amex:2026-12-24'
const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const at = (date: string, hour = 9) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)
const tx = (id: string, date: string, amountPence: number, destination: BudgetDestination | null, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: 'purchase', cardSuffix: '41001', personId: 'ada', statementKey: NOV, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {}, ...overrides,
})

/**
 * Paying the buffer back (audit 6, PR 8; example figures). Ada and Ben; the Amex pot, Groceries, Going out and a Buffer pot
 * sit in Monzo Joint, whose main balance is the buffer. November's £200.00 was paid on 18 Dec with Zara £50.00 and Pizza
 * £30.00 waiting, so the buffer covered £80.00. Zara has since been sorted to Going out; December has Sainsbury's £45.10.
 */
function household(): BudgetDocument {
  let document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' },
    { id: 'going-out', name: 'Going out', accountId: 'joint' }, { id: 'buffer-pot', name: 'Buffer', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [tx('tesco', '2026-11-03', 12000, pot('groceries')), tx('zara', '2026-11-10', 5000, null), tx('pizza', '2026-11-15', 3000, null), tx('sainsburys', '2026-12-02', 4510, pot('groceries'), { statementKey: DEC })],
  }
  document = recordMove(document, 'amex', ['tesco'], at('2026-11-20'), 'm1')
  document = markWaiting(document, 'zara', { kind: 'person', personId: 'ada' }, undefined, at('2026-11-21'))
  document = markWaiting(document, 'pizza', { kind: 'discuss' }, undefined, at('2026-11-21'))
  return settleWithoutFinal(document, NOV, at('2026-11-30'))
}
const paid = (document = household()) => sortTransaction(setSettleTick(document, NOV, 'settle:pay', 20000, at('2026-12-18')), 'zara', [{ amountPence: 5000, destination: pot('going-out') }], at('2026-12-20'))

let latest: BudgetDocument
function open(document: BudgetDocument) {
  latest = document
  const Harness = () => {
    const [current, setCurrent] = useState(document)
    return <Spending document={current} setDocument={update => setCurrent(value => { latest = typeof update === 'function' ? update(value) : update; return latest })} view="sort" onSelectView={() => {}} onOpenCardSettings={() => {}} today="2026-12-20"/>
  }
  render(<Harness/>)
}
const message = () => window.document.querySelector('.spending-message')

describe('paying the buffer back (W11)', () => {
  it('the Set aside band says what pays the buffer back, and Mark moved does both', () => {
    open(paid())
    const band = screen.getByRole('region', { name: 'Set aside in the Amex pot' })
    expect(band).toHaveTextContent('Set aside in the Amex pot · £45.10 · 1 transaction sorted since Fri 20 Nov')
    expect(band).toHaveTextContent('£50.00 stays in Monzo Joint’s main balance. It pays the buffer back for the November bill. £30.00 is still owed, for the 1 still waiting.')
    fireEvent.click(within(band).getByRole('button', { name: 'See the moves' }))
    expect(within(band).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Out of Going out£50.00', 'Out of Groceries£45.10', 'Into Amex£45.10Only December’s'])
    fireEvent.click(within(band).getByRole('button', { name: 'Mark £95.10 moved' }))
    expect(message()).toHaveTextContent('Moved £45.10 to the Amex pot and £50.00 back to the buffer. Undo')
    expect(frontsOwed(latest, '2026-12-20')[0]).toMatchObject({ owedPence: 3000, toMove: [] })
    expect(decodeBudgetDocument(latest)).not.toBeNull()
    // Undo takes back the pay-back too.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(frontsOwed(latest, '2026-12-20')[0]).toMatchObject({ owedPence: 8000, toMovePence: 5000 })
  })

  it('the Move sheet splits what it covers, and can pay the buffer back alone', () => {
    open(paid())
    fireEvent.click(screen.getByRole('button', { name: 'Not all of it' }))
    const dialog = screen.getByRole('dialog', { name: 'Move to the Amex pot' })
    expect(within(dialog).getByText('£50.00 stays in Monzo Joint’s main balance').closest('p')).toHaveTextContent('It pays the buffer back for the November bill. £30.00 is still owed, for the 1 still waiting.')
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Monzo Joint', 'Pays the buffer back · November bill', 'Into the Amex pot · December bill'])
    expect(within(dialog).getByRole('button', { name: 'Moved £95.10' })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /SAINSBURYS/ }))
    expect(within(within(dialog).getByRole('region', { name: 'Moves to make' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Out of Going out£50.00'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Moved £50.00' }))
    expect(message()).toHaveTextContent('Moved £50.00 back to the buffer. Undo')
    expect(latest.card!.moves!.at(-1)!.transactions.map(row => row.transactionId)).toEqual(['zara'])
    // Only December's left: the band is Set aside again, with no pay-back line.
    const band = screen.getByRole('region', { name: 'Set aside in the Amex pot' })
    expect(band).toHaveTextContent('£45.10 · 1 transaction sorted since')
    expect(band).not.toHaveTextContent('buffer')
  })

  it('with only pay-backs to move, the band is named for them; a source pot gets Into <pot>', () => {
    open(recordMove(paid(setFrontSource(household(), NOV, pot('buffer-pot'))), 'amex', ['sainsburys'], at('2026-12-19'), 'm2'))
    const band = screen.getByRole('region', { name: 'Pay Buffer back' })
    expect(band).toHaveTextContent('Pay Buffer back · £50.00 · 1 transaction sorted since Sat 19 Dec')
    expect(band).toHaveTextContent('£50.00 goes into Buffer. It pays Buffer back for the November bill.')
    fireEvent.click(within(band).getByRole('button', { name: 'See the moves' }))
    expect(within(band).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Out of Going out£50.00', 'Into Buffer£50.00'])
  })
})
