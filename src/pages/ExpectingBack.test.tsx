// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction, type SplitLine } from '../domain/cardTracker'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { MonthPage } from './MonthPage'
import { MoveToPotSheet } from './MoveToPotSheet'
import { Spending } from './Spending'
import { SplitEditor } from './SplitEditor'

afterEach(cleanup)

// Phone layout (jsdom has no matchMedia). Day 1 of December: the December bill (closes 24 Dec) is open.
const TODAY = '2026-12-01'
const DEC = 'amex:2026-12-24'
const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const tx = (id: string, date: string, description: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description, merchant: description, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: DEC, personId: 'ada', importedAt: '2026-11-30T10:00:00Z', ...overrides,
})
// The ASOS order (plan §6): Ada keeps the jeans; the coat and boots go back.
const asosLines: SplitLine[] = [
  { amountPence: 6900, destination: pot('ada-spending'), item: 'Jeans' },
  { amountPence: 4500, destination: pot('ada-spending'), item: 'Coat', expectingBack: true },
  { amountPence: 3400, destination: pot('ada-spending'), item: 'Boots', expectingBack: true },
]

function household(held = true): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }, { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'going-out', name: 'Going out', accountId: 'joint' }, { id: 'ada-spending', name: 'Spending', accountId: 'ada-own' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
    transactions: [
      tx('asos', '2026-11-26', 'ASOS', 14800, held ? { sort: { lines: asosLines.map(line => ({ ...line })), by: 'person', at: '2026-11-27T12:00:00Z' } } : {}),
      tx('pizza', '2026-11-27', 'PIZZA UNION', 2740, { sort: { lines: [{ amountPence: 2740, destination: pot('going-out') }], by: 'person', at: 'x' } }),
    ],
  }
  return document
}

function SpendingHarness({ initial, onChange = () => {} }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void }) {
  const [document, setDocument] = useState(initial)
  return <Spending document={document} view="sort" onSelectView={() => {}} onOpenCardSettings={() => {}} onOpenMonth={() => {}} today={TODAY} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

function MonthHarness({ initial, potId }: { initial: BudgetDocument; potId: string }) {
  const [document, setDocument] = useState(initial)
  return <MonthPage document={document} month="2026-12" onMonthChange={() => {}} payday={null} potId={potId} onOpenPot={() => {}} closing={false} onOpenClose={() => {}} onSort={() => {}} today={TODAY} setDocument={setDocument}/>
}

it('ticks Back on receipt items: they are saved as expecting back, and the sheet says what is held', () => {
  let saved: BudgetDocument | undefined
  let message = ''
  function Harness() {
    const [document, setDocument] = useState(household(false))
    return <SplitEditor document={document} transaction={document.card!.transactions[0]!} onClose={() => {}} onSaved={text => { message = text }} now={() => new Date('2026-11-27T12:00:00Z')}
      setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; saved = next; return next })}/>
  }
  render(<Harness/>)
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Receipt items' }))
  expect(within(dialog).getByText(/Tick/)).toHaveTextContent('Tick Back for anything you’re sending back. It stays in its pot, not spent, until the refund or the bill.')
  const items: Array<[string, string, boolean]> = [['Jeans', '69', false], ['Coat', '45', true], ['Boots', '34', true]]
  items.forEach(([name, amount, back], index) => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add an item' }))
    const row = within(dialog).getByRole('listitem', { name: `Item ${index + 1}` })
    fireEvent.change(within(row).getByLabelText('Item'), { target: { value: name } })
    fireEvent.change(within(row).getByLabelText('Amount'), { target: { value: amount } })
    fireEvent.change(within(row).getByLabelText('Pot or account'), { target: { value: 'pot:ada-spending' } })
    if (back) fireEvent.click(within(row).getByRole('checkbox', { name: 'Back' }))
  })
  expect(within(dialog).getByText('£148.00 in items · £79.00 expecting back')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save 3 items' }))
  expect(saved!.card!.transactions[0]!.sort!.lines).toEqual(asosLines)
  expect(message).toBe('ASOS: £79.00 expecting back, held in its pot until the bill.')
})

it('has no Back tick on a refund', () => {
  const document = household(false)
  const refund = tx('r', '2026-11-28', 'ASOS', -4500)
  document.card!.transactions.push(refund)
  render(<SplitEditor document={document} setDocument={() => {}} transaction={refund} onClose={() => {}} onSaved={() => {}}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Receipt items' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
  expect(screen.queryByRole('checkbox', { name: 'Back' })).not.toBeInTheDocument()
})

it('lists what is expecting back on Spending, and Not coming back turns it into spending, with Undo', () => {
  let saved: BudgetDocument | undefined
  render(<SpendingHarness initial={household()} onChange={next => { saved = next }}/>)
  const list = screen.getByRole('list', { name: 'Expecting back' })
  expect(screen.getByRole('heading', { name: 'Expecting back£79.00' })).toBeInTheDocument()
  expect(within(list).getByRole('listitem')).toHaveTextContent('ASOS£79.00Coat £45.00 · Boots £34.00Bought Thu 26 Nov · marked Back 4 days agoHeld in Spending · Ada until the refund or the billNot coming back')
  fireEvent.click(within(list).getByRole('button', { name: 'ASOS: not coming back' }))
  expect(saved!.card!.transactions[0]!.sort!.lines.filter(line => line.notComingBackAt)).toHaveLength(2)
  expect(screen.queryByRole('list', { name: 'Expecting back' })).not.toBeInTheDocument()
  expect(screen.getByText('ASOS: £79.00 now counts as spending.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(saved!.card!.transactions[0]!.sort!.lines.some(line => line.notComingBackAt)).toBe(false)
  expect(screen.getByRole('list', { name: 'Expecting back' })).toBeInTheDocument()
})

it('keeps held money out of the set-aside moves, and says it stays in the pot', () => {
  render(<SpendingHarness initial={household()}/>)
  // £69.00 kept + £27.40 pizza: the £79.00 held stays in Ada's Spending.
  expect(screen.getByRole('heading', { name: /^Set aside in the Amex pot/ })).toHaveTextContent('£96.40 · 2 transactions')
  cleanup()
  render(<MoveToPotSheet document={household()} setDocument={() => {}} cardId="amex" onClose={() => {}} onMoved={() => {}} now={() => new Date('2026-12-01T10:00:00Z')}/>)
  expect(screen.getByText('ASOS: £79.00 expecting back stays in Spending · Ada until the refund or the bill.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Moved £96.40' })).toBeInTheDocument()
})

it('moves what is still held at settle up, once the bill has closed, and labels it', () => {
  render(<MoveToPotSheet document={household()} setDocument={() => {}} cardId="amex" onClose={() => {}} onMoved={() => {}} now={() => new Date('2026-12-28T10:00:00Z')}/>)
  expect(screen.getByText('Includes £79.00 expecting back: not refunded by the bill, so it moves now')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Moved £175.40' })).toBeInTheDocument()
})

it('shows the bill’s fifth part and the list on the Amex pot page', () => {
  render(<MonthHarness initial={household()} potId="amex-pot"/>)
  const bills = within(screen.getByRole('list', { name: 'Bills it pays' })).getAllByRole('listitem')
  expect(bills[0]).toHaveTextContent('December bill so far£0.00 in the Amex pot · £96.40 to move · £79.00 expecting back£175.40')
  expect(screen.getByRole('list', { name: 'Expecting back' })).toHaveTextContent('ASOS£79.00')
})

it('shows what is held on a Funded only pot, beside its next move', () => {
  render(<MonthHarness initial={household()} potId="ada-spending"/>)
  expect(screen.getByText('Next move to the Amex pot: £69.00')).toBeInTheDocument()
  expect(screen.getByText(/^£79.00 expecting back/)).toHaveTextContent('£79.00 expecting back · held here until the refund or the bill, not spent')
})
