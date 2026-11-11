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
    'TRAIN TICKETS ONLINE£112.81Sun 8 Nov · Ada ··41001',
    'HOMEWARE HUT LEEDS−£24.99Thu 5 Nov · Ben ··41009 · refund',
    'BOOK NOOK YORK£12.50Tue 3 Nov · Ada ··41001',
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
