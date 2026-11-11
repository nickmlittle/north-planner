// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import type { SpendingView } from '../state/navigation'
import { BringInSheet } from './BringInSheet'
import { Spending } from './Spending'

afterEach(cleanup)

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'docs/fixtures', name))

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }]
  document.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }] }] }
  return document
}

const tx = (id: string, date: string, description: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description, merchant: description, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: '2026-11-09T10:00:00Z', ...overrides,
})

function Harness({ initial, onChange = () => {} }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void }) {
  const [document, setDocument] = useState(initial)
  const [view, setView] = useState<SpendingView>('sort')
  return <Spending document={document} view={view} onSelectView={setView} onOpenHousehold={() => {}} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

it('asks for a card before anything else', () => {
  const document = household()
  delete document.card
  const onOpenHousehold = vi.fn()
  render(<Spending document={document} setDocument={() => {}} view="sort" onSelectView={() => {}} onOpenHousehold={onOpenHousehold}/>)
  expect(screen.getByRole('heading', { name: 'Add your card first' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Set up a card' }))
  expect(onOpenHousehold).toHaveBeenCalled()
})

it('lists what is left to sort, newest first, with card and person, and leaves payments and sorted rows out', () => {
  const document = household()
  document.card!.transactions = [
    tx('a', '2026-11-03', 'BOOK NOOK YORK', 1250),
    tx('b', '2026-11-08', 'TRAIN TICKETS ONLINE', 11281),
    tx('c', '2026-11-05', 'HOMEWARE HUT LEEDS', -2499, { cardSuffix: '41009', personId: 'ben' }),
    tx('d', '2026-11-08', 'PAYMENT RECEIVED - THANK YOU', -35000, { kind: 'payment' }),
    tx('e', '2026-11-06', 'GREEN GROCER LONDON', 4460, { sort: { lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'groceries' } }], by: 'rule', at: 'x' } }),
  ]
  document.card!.imports = [{ at: '2026-11-09T19:30:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 5, added: 5, skipped: 0, sortedByRules: 1, latestDate: '2026-11-08', matchesSummary: true }]
  render(<Harness initial={document}/>)
  expect(screen.getByText('Last brought in Mon 9 Nov')).toBeInTheDocument()
  const list = screen.getByRole('list')
  expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual([
    'TRAIN TICKETS ONLINE£112.81Sun 8 Nov · Ada ··41001Choose',
    'HOMEWARE HUT LEEDS−£24.99Thu 5 Nov · Ben ··41009 · refundChoose',
    'BOOK NOOK YORK£12.50Tue 3 Nov · Ada ··41001Choose',
  ])
  expect(screen.getByText('3 transactions')).toBeInTheDocument()
})

it('shows the empty states', () => {
  render(<Harness initial={household()}/>)
  expect(screen.getByText('Nothing brought in yet')).toBeInTheDocument()
  expect(screen.getByText('Nothing to sort. Bring in new transactions to start.')).toBeInTheDocument()
  cleanup()
  const document = household()
  document.card!.transactions = [tx('e', '2026-11-06', 'GREEN GROCER', 4460, { sort: { lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'groceries' } }], by: 'person', at: 'x' } })]
  render(<Harness initial={document}/>)
  expect(screen.getByText('Everything is sorted.')).toBeInTheDocument()
})

it('brings in an Excel export, shows the counts and the summary check, then lists the new rows to sort', async () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Bring in transactions' }))
  const dialog = screen.getByRole('dialog', { name: 'Bring in transactions' })
  expect(within(dialog).getByText('Download the Excel version of your transactions from Amex online, then choose the file here.')).toBeInTheDocument()
  const input = within(dialog).getByLabelText('Choose the Excel file')
  expect(input).toHaveAttribute('accept', expect.stringContaining('.xlsx'))
  fireEvent.change(input, { target: { files: [new File([fixture('amex-export-sample.xlsx')], 'activity.xlsx')] } })
  await waitFor(() => expect(within(dialog).getByText('activity.xlsx')).toBeInTheDocument())
  expect(within(dialog).getByText('15 transactions · 25 Oct – 24 Nov statement')).toBeInTheDocument()
  const counts = Object.fromEntries([...dialog.querySelectorAll('.bring-in-counts > div')].map(row => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]))
  expect(counts).toEqual({ 'Already here': '0', New: '15', 'Sorted by your rules': '0', 'To sort': '14' })
  expect(within(dialog).getByText('All 15 transactions match Amex’s summary')).toBeInTheDocument()
  expect(saved?.card?.transactions).toHaveLength(15)
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sort 14 transactions' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(14)
})

it('warns when the export doesn’t match Amex’s summary, and rejects a file that isn’t the Excel export', async () => {
  render(<BringInSheet document={household()} setDocument={() => {}} onClose={() => {}} onSort={() => {}}/>)
  const input = screen.getByLabelText('Choose the Excel file')
  fireEvent.change(input, { target: { files: [new File(['Date,Description,Amount\n'], 'activity.csv')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('This doesn’t look like an Amex Excel export. Download the Excel version of your transactions.')
  fireEvent.change(input, { target: { files: [new File([fixture('amex-export-mismatch.xlsx')], 'activity.xlsx')] } })
  expect(await screen.findByText(/£12.34 of charges in Amex’s summary aren’t in this file/)).toBeInTheDocument()
})

it('asks whose card an unknown ending is, and saves the answer', async () => {
  const document = household()
  document.card!.cards[0]!.cardholders = [{ suffix: '41001', personId: 'ada' }]
  let saved: BudgetDocument = document
  function Sheet() {
    const [current, setCurrent] = useState(document)
    return <BringInSheet document={current} setDocument={update => setCurrent(previous => { saved = typeof update === 'function' ? update(previous) : update; return saved })} onClose={() => {}} onSort={() => {}}/>
  }
  render(<Sheet/>)
  fireEvent.change(screen.getByLabelText('Choose the Excel file'), { target: { files: [new File([fixture('amex-export-sample.xlsx')], 'activity.xlsx')] } })
  const question = await screen.findByLabelText('Whose card ends 41009?')
  fireEvent.change(question, { target: { value: 'ben' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(saved.card!.cards[0]!.cardholders).toEqual([{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }])
  expect(saved.card!.transactions.filter(row => row.cardSuffix === '41009').every(row => row.personId === 'ben')).toBe(true)
  expect(screen.queryByLabelText('Whose card ends 41009?')).not.toBeInTheDocument()
})

it('offers to update the closing day when the export’s period ends on another day', async () => {
  const document = household()
  document.card!.cards[0]!.closeDay = 2
  let saved: BudgetDocument = document
  function Sheet() {
    const [current, setCurrent] = useState(document)
    return <BringInSheet document={current} setDocument={update => setCurrent(previous => { saved = typeof update === 'function' ? update(previous) : update; return saved })} onClose={() => {}} onSort={() => {}}/>
  }
  render(<Sheet/>)
  fireEvent.change(screen.getByLabelText('Choose the Excel file'), { target: { files: [new File([fixture('amex-export-sample.xlsx')], 'activity.xlsx')] } })
  expect(await screen.findByText(/This export’s statement ends on the 24th, but Amex is set to close on the 2nd/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Change it to the 24th' }))
  expect(saved.card!.cards[0]!.closeDay).toBe(24)
})

it('adds a transaction by hand, on the statement its date falls in', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Add a transaction' }))
  const dialog = screen.getByRole('dialog', { name: 'Add a transaction' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
  expect(within(dialog).getByLabelText('Description')).toHaveAccessibleDescription('Enter what it was.')
  expect(within(dialog).getByLabelText('Amount')).toHaveAccessibleDescription('Enter an amount, like 12.50.')
  fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-25' } })
  fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Village market' } })
  fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '£8.40' } })
  fireEvent.change(within(dialog).getByLabelText('Whose card'), { target: { value: '41009' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Added Village market.')
  expect(saved?.card?.transactions[0]).toMatchObject({ id: expect.stringMatching(/^manual:/), date: '2026-11-25', description: 'Village market', amountPence: 840, kind: 'purchase', cardSuffix: '41009', personId: 'ben', statementKey: 'amex:2026-12-24' })
  expect(screen.getByText('Village market')).toBeInTheDocument()
})

function sortingHousehold(): BudgetDocument {
  const document = household()
  document.budget.accounts.push({ id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] })
  document.budget.pots.push({ id: 'treats', name: 'Treats', accountId: 'ada-own' }, { id: 'eating', name: 'Eating out', accountId: 'joint' })
  document.card!.transactions = [
    tx('old', '2026-10-02', 'TRAIN TICKETS ONLINE', 2000, { merchant: 'TRAIN TICKETS ONLINE', sort: { lines: [{ amountPence: 2000, destination: { kind: 'pot', potId: 'treats' } }], by: 'person', at: 'x' } }),
    tx('new', '2026-11-08', 'TRAIN TICKETS ONLINE', 11281, { merchant: 'TRAIN TICKETS ONLINE' }),
    tx('again', '2026-11-09', 'TRAIN TICKETS ONLINE', 900, { merchant: 'TRAIN TICKETS ONLINE' }),
    tx('grocer', '2026-11-07', 'GREEN GROCER LONDON', 4460, { merchant: 'GREEN GROCER', sort: { lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'groceries' } }], by: 'rule', ruleId: 'r-grocer', at: 'x' } }),
  ]
  document.card!.rules = [{ id: 'r-grocer', contains: 'GREEN GROCER', destination: { kind: 'pot', potId: 'groceries' }, createdAt: 'x' }]
  return document
}

it('places a transaction with one tap on a suggestion', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getAllByRole('button', { name: /^TRAIN TICKETS ONLINE, £112.81/ })[0]!)
  const dialog = screen.getByRole('dialog', { name: 'Sort TRAIN TICKETS ONLINE' })
  const options = within(within(dialog).getByRole('list', { name: 'Suggested pots and accounts' })).getAllByRole('button')
  expect(options.map(option => option.textContent)).toEqual([
    'Treats · AdaSuggested · Used last time',
    'Eating out · JointJoint',
    'Groceries · JointJoint',
    'JointOne-offs',
  ])
  fireEvent.click(options[1]!)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(saved!.card!.transactions.find(row => row.id === 'new')!.sort).toMatchObject({ lines: [{ amountPence: 11281, destination: { kind: 'pot', potId: 'eating' } }], by: 'person' })
  expect(screen.getByRole('status')).toHaveTextContent('Sorted to Eating out · Joint.')
  expect(saved!.card!.rules).toHaveLength(1)
})

it('makes a rule in place with Always, and it sorts the others from that merchant too', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getAllByRole('button', { name: /^TRAIN TICKETS ONLINE, £112.81/ })[0]!)
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByLabelText('Always put TRAIN TICKETS ONLINE in this pot'))
  expect(within(dialog).getByLabelText('Matching text')).toHaveValue('TRAIN')
  fireEvent.change(within(dialog).getByLabelText('Matching text'), { target: { value: 'train tickets' } })
  fireEvent.click(within(dialog).getByLabelText('Only on Ada’s card'))
  fireEvent.click(within(dialog).getByRole('button', { name: /^Treats · Ada/ }))
  expect(saved!.card!.rules[1]).toMatchObject({ contains: 'TRAIN TICKETS', cardSuffix: '41001', destination: { kind: 'pot', potId: 'treats' } })
  expect(saved!.card!.transactions.find(row => row.id === 'again')!.sort).toMatchObject({ by: 'rule', ruleId: saved!.card!.rules[1]!.id })
  expect(screen.getByRole('status')).toHaveTextContent('Sorted to Treats · Ada. New rule for “TRAIN TICKETS”, which sorted 1 more.')
  expect(screen.getByText('Everything is sorted.')).toBeInTheDocument()
})

it('checks rule sorts, and offers to change the rule when one is re-sorted', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  expect(screen.getByRole('heading', { name: 'Sorted by rules · 1' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
  const row = screen.getByRole('button', { name: /GREEN GROCER LONDON/ })
  expect(row).toHaveAccessibleName('GREEN GROCER LONDON, £44.60, Sat 7 Nov · Ada ··41001, Groceries · Joint, rule')
  fireEvent.click(row)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Sorted by your rule “GREEN GROCER”.')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByLabelText('Change the rule too'))
  fireEvent.click(within(dialog).getByRole('button', { name: /^Eating out · Joint/ }))
  expect(saved!.card!.rules[0]!.destination).toEqual({ kind: 'pot', potId: 'eating' })
  expect(saved!.card!.transactions.find(row => row.id === 'grocer')!.sort?.by).toBe('person')
  cleanup()
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Check' }))
  fireEvent.click(screen.getByRole('button', { name: 'They all look right' }))
  expect(screen.queryByRole('heading', { name: /Sorted by rules/ })).not.toBeInTheDocument()
  expect(saved!.card!.transactions.find(row => row.id === 'grocer')!.sort?.checkedAt).toEqual(expect.any(String))
})

it('lists all transactions under ⋯ on phones, where any can be sorted again or put back', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'More Spending sections' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'All transactions' }))
  expect(screen.getByRole('heading', { name: 'All transactions' })).toBeInTheDocument()
  const rows = screen.getAllByRole('button', { name: /TRAIN TICKETS ONLINE|GREEN GROCER/ })
  expect(rows.map(row => row.querySelector('.spending-row-where')?.textContent)).toEqual(['To sort', 'To sort', 'Groceries · JointRule', 'Treats · Ada'])
  fireEvent.click(rows[3]!)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move back to To sort' }))
  expect(saved!.card!.transactions.find(row => row.id === 'old')!.sort).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: 'Back to To sort' }))
  expect(screen.getByRole('heading', { name: 'To sort' })).toBeInTheDocument()
})

it('edits, reorders and deletes rules', () => {
  const document = sortingHousehold()
  document.card!.rules.push({ id: 'r-cafe', contains: 'CORNER CAFE', cardSuffix: '41009', destination: { kind: 'pot', potId: 'eating' }, createdAt: 'x' })
  let saved: BudgetDocument | undefined
  render(<Harness initial={document} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'More Spending sections' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rules' }))
  const items = () => within(screen.getByRole('list')).getAllByRole('listitem').map(item => item.querySelector('.rule-row-text')?.textContent)
  expect(items()).toEqual(['“GREEN GROCER” → Groceries · JointSorted 1 transaction', '“CORNER CAFE” → Eating out · JointOnly Ben ··41009 · Sorted 0 transactions'])
  fireEvent.click(screen.getByRole('button', { name: 'Move the rule for CORNER CAFE up' }))
  expect(saved!.card!.rules.map(rule => rule.id)).toEqual(['r-cafe', 'r-grocer'])
  fireEvent.click(screen.getByRole('button', { name: 'Edit the rule for GREEN GROCER' }))
  const form = screen.getByRole('form', { name: 'Edit the rule for GREEN GROCER' })
  fireEvent.change(within(form).getByLabelText('Matching text'), { target: { value: 'grocer' } })
  fireEvent.change(within(form).getByLabelText('Card'), { target: { value: '41001' } })
  fireEvent.change(within(form).getByLabelText('Sort to'), { target: { value: 'pot:treats' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save rule' }))
  expect(saved!.card!.rules[1]).toMatchObject({ id: 'r-grocer', contains: 'GROCER', cardSuffix: '41001', destination: { kind: 'pot', potId: 'treats' } })
  fireEvent.click(screen.getByRole('button', { name: 'Delete the rule for CORNER CAFE' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete rule' }))
  expect(saved!.card!.rules.map(rule => rule.id)).toEqual(['r-grocer'])
})

function splitHousehold(): BudgetDocument {
  const document = sortingHousehold()
  document.budget.accounts.push({ id: 'ben-own', name: 'Ben', provider: 'Nationwide', ownerPersonIds: ['ben'] })
  document.budget.pots.push({ id: 'ben-treats', name: 'Treats', accountId: 'ben-own' })
  document.budget.incomeSources = [
    { id: 'a', personId: 'ada', name: 'Pay', type: 'employment', baseAmountPence: 300000, changes: {} },
    { id: 'b', personId: 'ben', name: 'Pay', type: 'employment', baseAmountPence: 200000, changes: {} },
  ]
  return document
}

it('splits by amount, with Left to place, Half each and the funding share', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={splitHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getAllByRole('button', { name: /^TRAIN TICKETS ONLINE, £112.81/ })[0]!)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Split across pots' }))
  const dialog = screen.getByRole('dialog', { name: 'Split TRAIN TICKETS ONLINE' })
  expect(within(dialog).getByText('Left to place £0.00')).toBeInTheDocument()
  // Typing an exception leaves something to place, and Save waits for it.
  fireEvent.change(within(within(dialog).getByRole('listitem', { name: 'Line 1' })).getByLabelText('Amount'), { target: { value: '100' } })
  expect(within(dialog).getByText('Left to place £12.81')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Save split' })).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add a line' }))
  const second = within(dialog).getByRole('listitem', { name: 'Line 2' })
  expect(within(second).getByLabelText('Amount')).toHaveValue('12.81')
  fireEvent.change(within(second).getByLabelText('Pot or account'), { target: { value: 'pot:groceries' } })
  fireEvent.change(within(second).getByLabelText('Note'), { target: { value: 'Snacks' } })
  expect(within(dialog).getByRole('region', { name: 'By pot' })).toHaveTextContent('Treats · Ada£100.00Groceries · Joint£12.81')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save split' }))
  expect(saved!.card!.transactions.find(row => row.id === 'new')!.sort?.lines).toEqual([
    { amountPence: 10000, destination: { kind: 'pot', potId: 'treats' } },
    { amountPence: 1281, destination: { kind: 'pot', potId: 'groceries' }, note: 'Snacks' },
  ])
  expect(screen.getByRole('status')).toHaveTextContent('TRAIN TICKETS ONLINE: split across 2 pots.')

  fireEvent.click(screen.getByRole('button', { name: 'More Spending sections' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'All transactions' }))
  expect(screen.getByRole('button', { name: /^TRAIN TICKETS ONLINE, £112.81, .*Split · 2 pots/ })).toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'TRAIN TICKETS ONLINE split' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Treats · Ada£100.00', 'Groceries · Joint · Snacks£12.81'])

  fireEvent.click(screen.getByRole('button', { name: /^TRAIN TICKETS ONLINE, £112.81, .*Split/ }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change the split' }))
  const again = screen.getByRole('dialog', { name: 'Split TRAIN TICKETS ONLINE' })
  fireEvent.click(within(again).getByRole('button', { name: 'Half each' }))
  expect(within(again).getAllByLabelText('Amount').map(input => (input as HTMLInputElement).value)).toEqual(['56.41', '56.40'])
  fireEvent.click(within(again).getByRole('button', { name: 'Split by your 60/40 funding share' }))
  expect(within(again).getAllByLabelText('Amount').map(input => (input as HTMLInputElement).value)).toEqual(['67.69', '45.12'])
  fireEvent.click(within(again).getByRole('button', { name: 'Save split' }))
  expect(saved!.card!.transactions.find(row => row.id === 'new')!.sort?.lines).toEqual([
    { amountPence: 6769, destination: { kind: 'pot', potId: 'treats' } },
    { amountPence: 4512, destination: { kind: 'pot', potId: 'ben-treats' } },
  ])
})

it('splits by receipt items, with Everything else taking the rest', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={splitHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getAllByRole('button', { name: /^TRAIN TICKETS ONLINE, £112.81/ })[0]!)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Split across pots' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Receipt items' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add an item' }))
  const item = within(dialog).getByRole('listitem', { name: 'Item 1' })
  fireEvent.change(within(item).getByLabelText('Item'), { target: { value: 'Seat reservation' } })
  fireEvent.change(within(item).getByLabelText('Amount'), { target: { value: '200' } })
  expect(within(dialog).getByText('The items come to £87.19 more than £112.81')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Save 1 item' })).toBeDisabled()
  fireEvent.change(within(item).getByLabelText('Amount'), { target: { value: '12.81' } })
  fireEvent.change(within(item).getByLabelText('Pot or account'), { target: { value: 'pot:ben-treats' } })
  expect(within(dialog).getByText('Everything else').parentElement).toHaveTextContent('Everything else£100.00')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 item' }))
  expect(saved!.card!.transactions.find(row => row.id === 'new')!.sort?.lines).toEqual([
    { amountPence: 1281, destination: { kind: 'pot', potId: 'ben-treats' }, item: 'Seat reservation' },
    { amountPence: 10000, destination: { kind: 'pot', potId: 'treats' } },
  ])
})
