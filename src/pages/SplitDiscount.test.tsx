// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, validCardTracker, type CardTransaction } from '../domain/cardTracker'
import { SplitEditor } from './SplitEditor'

afterEach(cleanup)

// Phone layout (jsdom has no matchMedia). ASOS charged £148.00 for £165.00 of items less a code (plan §6, D12).
const asos: CardTransaction = { id: 'asos', cardId: 'amex', date: '2026-11-26', description: 'ASOS', merchant: 'ASOS', amountPence: 14800, kind: 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-12-24', personId: 'ada', importedAt: '2026-11-30T10:00:00Z' }

function household(transaction: CardTransaction = asos): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }, { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] }]
  document.budget.pots = [{ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'ada-spending', name: 'Spending', accountId: 'ada-own' }]
  document.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }], transactions: [transaction] }
  return document
}

function open(initial: BudgetDocument, id = 'asos') {
  const latest: { document?: BudgetDocument } = {}
  function Harness() {
    const [document, setDocument] = useState(initial)
    return <SplitEditor document={document} transaction={document.card!.transactions.find(row => row.id === id)!} onClose={() => {}} onSaved={() => {}} now={() => new Date('2026-11-27T12:00:00Z')}
      setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; latest.document = next; return next })}/>
  }
  render(<Harness/>)
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Receipt items' }))
  return { dialog, latest }
}

function addItems(dialog: HTMLElement, items: Array<[string, string]>) {
  items.forEach(([name, amount], index) => {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add an item' }))
    const row = within(dialog).getByRole('listitem', { name: `Item ${index + 1}` })
    fireEvent.change(within(row).getByLabelText('Item'), { target: { value: name } })
    fireEvent.change(within(row).getByLabelText('Amount'), { target: { value: amount } })
    fireEvent.change(within(row).getByLabelText('Pot or account'), { target: { value: 'pot:ada-spending' } })
  })
}

it('adds a discount: items at original prices, the discount spread over them, checked against the charge', () => {
  const { dialog, latest } = open(household())
  addItems(dialog, [['Jeans', '80'], ['Coat', '50'], ['Boots', '35']])
  // Without the code the items come to more than the charge.
  expect(within(dialog).getByText('The items come to £17.00 more than £148.00')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Save 3 items' })).toBeDisabled()

  fireEvent.click(within(dialog).getByRole('button', { name: 'Add discount' }))
  const discount = within(dialog).getByRole('region', { name: 'Discount' })
  // Nothing typed yet: the code has nothing to take off.
  expect(within(dialog).getByRole('button', { name: 'Save 3 items' })).toBeDisabled()
  fireEvent.change(within(discount).getByLabelText('Amount off'), { target: { value: '17' } })
  expect(within(discount).getByText('£17.00 off, spread over the items it covers by price. They save at the discounted price.')).toBeInTheDocument()
  expect(within(dialog).getByText('£165.00 of items − £17.00 discount = £148.00')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Save 3 items' })).toBeEnabled()

  fireEvent.click(within(dialog).getByRole('button', { name: 'Save 3 items' }))
  const sort = latest.document!.card!.transactions[0]!.sort!
  expect(sort.lines.map(line => [line.item, line.amountPence, line.originalPence])).toEqual([['Jeans', 7176, 8000], ['Coat', 4485, 5000], ['Boots', 3139, 3500]])
  expect(sort.lines.reduce((sum, line) => sum + line.amountPence, 0)).toBe(14800)
  expect(sort.discount).toEqual({ pence: 1700 })
  expect(validCardTracker(latest.document!.card, latest.document!.budget, new Set(['ada', 'ben']))).toBe(true)
})

it('takes a percentage off only the items it covers', () => {
  const { dialog, latest } = open(household({ ...asos, amountPence: 13400 }))
  addItems(dialog, [['Jeans', '66'], ['Coat', '50'], ['Boots', '35']])
  expect(within(dialog).getByText('The items come to £17.00 more than £134.00')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add discount' }))
  const discount = within(dialog).getByRole('region', { name: 'Discount' })
  fireEvent.click(within(discount).getByRole('button', { name: 'A percentage' }))
  fireEvent.click(within(discount).getByRole('checkbox', { name: 'Jeans' }))
  fireEvent.change(within(discount).getByLabelText('Percent off'), { target: { value: '20' } })
  // 20% of £85.00 (the coat and boots) is £17.00: £151.00 of items becomes £134.00, the charge.
  expect(within(dialog).getByText('£151.00 of items − £17.00 discount = £134.00')).toBeInTheDocument()
  fireEvent.click(within(within(dialog).getByRole('listitem', { name: 'Item 2' })).getByRole('checkbox', { name: 'Back' }))
  expect(within(dialog).getByText('£151.00 of items − £17.00 discount = £134.00 · £40.00 expecting back')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save 3 items' }))
  const sort = latest.document!.card!.transactions[0]!.sort!
  expect(sort.lines.map(line => [line.item, line.amountPence, line.originalPence])).toEqual([['Jeans', 6600, undefined], ['Coat', 4000, 5000], ['Boots', 2800, 3500]])
  expect(sort.discount).toEqual({ pence: 1700, percent: 20 })
})

it('opens a saved discount with the original prices and the covered items ticked', () => {
  const saved: CardTransaction = { ...asos, sort: { by: 'person', at: 'x', discount: { pence: 1700 }, lines: [
    { amountPence: 7176, destination: { kind: 'pot', potId: 'ada-spending' }, item: 'Jeans', originalPence: 8000 },
    { amountPence: 4485, destination: { kind: 'pot', potId: 'ada-spending' }, item: 'Coat', originalPence: 5000 },
    { amountPence: 3139, destination: { kind: 'pot', potId: 'ada-spending' }, item: 'Boots', originalPence: 3500 },
  ] } }
  render(<SplitEditor document={household(saved)} setDocument={() => {}} transaction={saved} onClose={() => {}} onSaved={() => {}}/>)
  const dialog = screen.getByRole('dialog')
  expect(within(within(dialog).getByRole('listitem', { name: 'Item 1' })).getByLabelText('Amount')).toHaveValue('80.00')
  const discount = within(dialog).getByRole('region', { name: 'Discount' })
  expect(within(discount).getByLabelText('Amount off')).toHaveValue('17.00')
  expect(within(discount).getAllByRole('checkbox').every(box => (box as HTMLInputElement).checked)).toBe(true)
  expect(within(dialog).getByText('£165.00 of items − £17.00 discount = £148.00')).toBeInTheDocument()
  fireEvent.click(within(discount).getByRole('button', { name: 'Remove discount' }))
  expect(within(dialog).queryByRole('region', { name: 'Discount' })).not.toBeInTheDocument()
  expect(within(dialog).getByText('Everything else').parentElement).toHaveTextContent('—')
})

it('refuses a discount that covers nothing, and has no discount on a refund', () => {
  const { dialog } = open(household())
  addItems(dialog, [['Jeans', '80']])
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add discount' }))
  const discount = within(dialog).getByRole('region', { name: 'Discount' })
  fireEvent.change(within(discount).getByLabelText('Amount off'), { target: { value: '10' } })
  expect(within(dialog).getByRole('button', { name: 'Save 1 item' })).toBeEnabled()
  fireEvent.click(within(discount).getByRole('checkbox', { name: 'Jeans' }))
  expect(within(dialog).getByRole('button', { name: 'Save 1 item' })).toBeDisabled()
  cleanup()
  const refund: CardTransaction = { ...asos, id: 'r', amountPence: -4500, kind: 'refund' }
  render(<SplitEditor document={household(refund)} setDocument={() => {}} transaction={refund} onClose={() => {}} onSaved={() => {}}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Receipt items' }))
  expect(screen.queryByRole('button', { name: 'Add discount' })).not.toBeInTheDocument()
})
