// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { checkPotBalance } from '../domain/potBalances'
import { recordMove } from '../domain/setAside'
import { MonthPage } from './MonthPage'
import { Spending } from './Spending'
import { PotDetail } from './SpendingMonth'

afterEach(cleanup)

const TODAY = '2026-11-15'
const NOV = 'amex:2026-11-24'
const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const tx = (id: string, date: string, destination: BudgetDestination, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: 'purchase', cardSuffix: '41001', statementKey: NOV, importedAt: 'x',
  sort: { lines: [{ amountPence, destination }], by: 'person', at: 'x' }, ...overrides,
})

/** The Amex pot is in Monzo Joint; £109.20 of November has moved in (Tesco and Pizza), Fuel hasn't. */
function household(potPence?: number): BudgetDocument {
  let document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'immy', name: 'Immy' }, { id: 'nick', name: 'Nick' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['immy', 'nick'] }]
  document.budget.pots = [
    { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'groceries', name: 'Groceries', accountId: 'joint' },
    { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'spending', name: 'Spending', accountId: 'joint' },
  ]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [tx('tesco', '2026-11-02', pot('groceries'), 8420), tx('pizza', '2026-11-03', pot('eating'), 2500), tx('fuel', '2026-11-05', pot('groceries'), 6000)],
  }
  document = recordMove(document, 'amex', ['tesco', 'pizza'], new Date('2026-11-10T09:00:00Z'), 'm1')
  return potPence === undefined ? document : checkPotBalance(document, 'amex-pot', potPence, new Date('2026-11-12T09:00:00Z'))
}

function Harness({ initial, onChange = () => {}, today = TODAY, onOpenStatement }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void; today?: string; onOpenStatement?: (key: string) => void }) {
  const [document, setDocument] = useState(initial)
  return <PotDetail document={document} potId="amex-pot" month="2026-11" today={today} onBack={() => {}} {...onOpenStatement ? { onOpenStatement } : {}}
    setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

const lead = () => screen.getByRole('region', { name: /^(Should hold|Checked against Monzo)/ })

describe('the Amex pot’s check', () => {
  it('asks for a check before it can say anything', () => {
    render(<Harness initial={household()}/>)
    expect(within(lead()).getByText('£109.20')).toBeInTheDocument()
    expect(within(lead()).getByText(/Check it against Monzo to see if it holds that/)).toBeInTheDocument()
    fireEvent.click(within(lead()).getByRole('button', { name: 'Check against Monzo' }))
    expect(screen.getByRole('dialog', { name: 'Check against Monzo' })).toBeInTheDocument()
  })

  it('matches when Monzo holds what has moved in', () => {
    render(<Harness initial={household(10920)}/>)
    expect(lead()).toHaveAccessibleName('Checked against Monzo · Thu 12 Nov')
    expect(within(lead()).getByText('Matches')).toBeInTheDocument()
    expect(within(lead()).getByText('Should hold').nextSibling).toHaveTextContent('£109.20')
    expect(within(lead()).getByText('In Monzo now').nextSibling).toHaveTextContent('£109.20')
    expect(within(lead()).queryByRole('button')).toBeNull()
  })

  it('moves extra to the buffer: the steps, Moved, then it matches; Undo puts it back', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household(11500)} onChange={next => { saved = next }}/>)
    expect(within(lead()).getByText('£5.80 extra')).toBeInTheDocument()
    expect(within(lead()).getByText('Move it to Monzo Joint.')).toBeInTheDocument()
    const steps = within(lead()).getByRole('list', { name: 'Moves to make' })
    expect(within(steps).getAllByRole('listitem').map(row => row.textContent)).toEqual(['Out of Amex£5.80'])
    expect(within(lead()).getByText(/Moved money early for a purchase that isn’t in North yet\? Leave it/)).toBeInTheDocument()
    fireEvent.click(within(lead()).getByRole('button', { name: 'Moved £5.80' }))
    expect(saved!.card!.gapMoves).toEqual([expect.objectContaining({ pence: 580, destination: { kind: 'account', accountId: 'joint' } })])
    expect(within(lead()).getByText('Matches')).toBeInTheDocument()
    expect(screen.getByText('Moved £5.80 to Monzo Joint. The Amex pot matches.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(saved!.card!.gapMoves).toBeUndefined()
    expect(within(lead()).getByText('£5.80 extra')).toBeInTheDocument()
  })

  it('sends extra into a buffer pot when the card has one', () => {
    const document = household(11500)
    document.card!.cards[0]!.bufferDestination = pot('spending')
    render(<Harness initial={document}/>)
    expect(within(lead()).getByText(/^Move it to Spending/)).toBeInTheDocument()
    expect(within(within(lead()).getByRole('list', { name: 'Moves to make' })).getAllByRole('listitem').map(row => row.textContent)).toEqual(['Out of Amex£5.80', 'Into Spending£5.80'])
  })

  it('when short: the recent moves with Undo, and a top-up from the buffer', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household(10000)} onChange={next => { saved = next }}/>)
    expect(within(lead()).getByText('£9.20 short')).toBeInTheDocument()
    expect(within(lead()).getByText('Did a transfer not happen? Make it now, then check the Amex pot again.')).toBeInTheDocument()
    const moves = within(lead()).getByRole('list', { name: 'Recent moves' })
    expect(within(moves).getAllByRole('listitem')[0]).toHaveTextContent('Tue 10 Nov · £109.20')
    expect(within(moves).getAllByRole('listitem')[0]).toHaveTextContent('2 transactions · Groceries £84.20, Eating out £25.00')
    expect(within(within(lead()).getByRole('list', { name: 'Top-up to make' })).getAllByRole('listitem').map(row => row.textContent)).toEqual(['Into Amex£9.20'])
    fireEvent.click(within(lead()).getByRole('button', { name: 'Topped up £9.20' }))
    expect(saved!.card!.gapMoves).toEqual([expect.objectContaining({ pence: -920 })])
    expect(within(lead()).getByText('Matches')).toBeInTheDocument()
  })

  it('undoing a move that wasn’t made puts its transactions back to move', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household(0)} onChange={next => { saved = next }}/>)
    fireEvent.click(within(lead()).getByRole('button', { name: 'Undo the move on Tue 10 Nov' }))
    expect(saved!.card!.moves).toBeUndefined()
    expect(screen.getByText('Move undone. Those transactions are back on the list to move.')).toBeInTheDocument()
    expect(within(lead()).getByText('Matches')).toBeInTheDocument()
  })

  it('a closed statement with no Pay tick links to its settle up', () => {
    const onOpenStatement = vi.fn()
    render(<Harness initial={household(0)} today="2026-12-15" onOpenStatement={onOpenStatement}/>)
    expect(within(lead()).getByText(/^The November statement has no Pay tick\. Paid it\? Tick Pay when you settle up\./)).toBeInTheDocument()
    fireEvent.click(within(lead()).getByRole('button', { name: 'Open the November statement' }))
    expect(onOpenStatement).toHaveBeenCalledWith(NOV)
    fireEvent.click(screen.getByRole('button', { name: /^November statement, .*open it in Spending$/ }))
    expect(onOpenStatement).toHaveBeenLastCalledWith(NOV)
  })
})

describe('Month’s Amex row', () => {
  it('says extra or short in place of what’s left to move', () => {
    render(<MonthPage document={household(11500)} setDocument={() => {}} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={() => {}} today={TODAY}/>)
    expect(screen.getByRole('button', { name: /^Amex · set aside: .*£5.80 extra$/ })).toBeInTheDocument()
    cleanup()
    render(<MonthPage document={household()} setDocument={() => {}} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={() => {}} today={TODAY}/>)
    expect(screen.getByRole('button', { name: /^Amex · set aside: .*£60.00 still to move for November$/ })).toBeInTheDocument()
  })
})

describe('Check balances, for the Amex pot', () => {
  function MonthHarness({ initial, onChange = () => {}, onOpenPot = () => {} }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void; onOpenPot?: (potId: string | null) => void }) {
    const [document, setDocument] = useState(initial)
    return <MonthPage document={document} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={onOpenPot} onSort={() => {}} today={TODAY}
      setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
  }
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'More Month options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Check balances' }))
    return screen.getByRole('dialog', { name: 'Check balances' })
  }

  it('holds the Amex pot against what it should hold, warns while anything is still to move, and offers to open it', () => {
    const onOpenPot = vi.fn()
    let saved: BudgetDocument | undefined
    render(<MonthHarness initial={household()} onChange={next => { saved = next }} onOpenPot={onOpenPot}/>)
    const dialog = open()
    const amex = within(dialog).getByLabelText(/^Amex/)
    expect(amex).toHaveAccessibleName(/Should hold £109\.20 · not checked yet$/)
    expect(amex).toHaveAccessibleDescription(/£60.00 sorted and still to move\. Moved it in Monzo already\? Press Moved first, or it counts twice\./)
    fireEvent.change(amex, { target: { value: '109.20' } })
    expect(within(dialog).getByText('Matches')).toBeInTheDocument()
    fireEvent.change(amex, { target: { value: '100' } })
    expect(within(dialog).getByText('£9.20 short')).toBeInTheDocument()
    fireEvent.change(amex, { target: { value: '115' } })
    expect(within(dialog).getByText('£5.80 extra')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 balance' }))
    expect(saved!.card!.pots['amex-pot']!.checkedBalance!.pence).toBe(11500)
    expect(screen.getByRole('status')).toHaveTextContent('1 balance checked. The Amex pot has £5.80 extra.')
    fireEvent.click(screen.getByRole('button', { name: 'Open Amex pot' }))
    expect(onOpenPot).toHaveBeenCalledWith('amex-pot')
  })

  it('offers Same as North for the Amex pot only when it already holds what it should', () => {
    render(<MonthHarness initial={household(10920)}/>)
    let dialog = open()
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Same as North' })[0]!)
    expect(within(dialog).getByLabelText(/^Amex/)).toHaveValue('109.20')
    cleanup()
    render(<MonthHarness initial={household(11500)}/>)
    dialog = open()
    expect(within(dialog).queryByRole('button', { name: 'Same as North' })).toBeNull()
  })
})

describe('settling up from the Amex pot', () => {
  /** Everything on November is moved in and the statement is ready to settle on 30 Nov. */
  const ready = (potPence?: number) => {
    let document = recordMove(household(), 'amex', ['fuel'], new Date('2026-11-11T09:00:00Z'), 'm2')
    document.card!.statements[NOV] = { cardId: 'amex', closeDate: '2026-11-24', settleWithoutFinalAt: '2026-11-26T09:00:00Z' }
    if (potPence !== undefined) document = checkPotBalance(document, 'amex-pot', potPence, new Date('2026-11-27T09:00:00Z'))
    return document
  }
  const settle = (document: BudgetDocument) => {
    const Harness = () => { const [current, setCurrent] = useState(document); return <Spending document={current} setDocument={setCurrent} view="statements" onSelectView={() => {}} onOpenCardSettings={() => {}} statementKey={NOV} onOpenStatement={() => {}} today="2026-11-30"/> }
    render(<Harness/>)
    return screen.getByRole('button', { name: 'Pay Amex from the Amex pot done' }).closest('li')!
  }

  it('says whether the pot covers the bill before Pay', () => {
    expect(settle(ready(17500))).toHaveTextContent('The Amex pot covers the £169.20 bill · £5.80 to spare.')
    cleanup()
    expect(settle(ready(16920))).toHaveTextContent('The Amex pot covers the £169.20 bill.')
    cleanup()
    expect(settle(ready(16000))).toHaveTextContent('£9.20 short of the bill: top up the Amex pot before you pay.')
    cleanup()
    expect(settle(ready())).toHaveTextContent('Check the Amex pot against Monzo to see if it covers the bill.')
  })

  it('says nothing once Pay is ticked', () => {
    const pay = settle(ready(17500))
    fireEvent.click(within(pay).getByRole('button', { name: 'Pay Amex from the Amex pot done' }))
    expect(screen.queryByText(/covers the £169.20 bill/)).toBeNull()
  })
})
