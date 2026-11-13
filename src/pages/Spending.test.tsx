// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import type { SpendingSection } from '../state/navigation'
import { BringInSheet } from './BringInSheet'
import { MonthPage } from './MonthPage'
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

function Harness({ initial, onChange = () => {}, startView = 'sort', today = '2026-11-12' }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void; startView?: SpendingSection; today?: string }) {
  const [document, setDocument] = useState(initial)
  const [view, setView] = useState<SpendingSection>(startView)
  const [statement, setStatement] = useState<string | null>(null)
  return <Spending document={document} view={view} onSelectView={next => { setView(next); setStatement(null) }} onOpenCardSettings={() => {}} onOpenMonth={() => {}} statementKey={statement} onOpenStatement={setStatement} today={today} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

/** Month's pots, a pot's page and Close <Month> (they moved from Spending's This month in audit 3 PR 06). */
function MonthHarness({ initial, onChange = () => {}, today = '2026-11-12' }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void; today?: string }) {
  const [document, setDocument] = useState(initial)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [pot, setPot] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  return <MonthPage document={document} month={month} onMonthChange={next => { setMonth(next); setPot(null); setClosing(false) }} payday={null} potId={pot} onOpenPot={setPot} closing={closing} onOpenClose={setClosing} onSort={() => {}} today={today} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

it('asks for a card before anything else', () => {
  const document = household()
  delete document.card
  const onOpenCardSettings = vi.fn()
  render(<Spending document={document} setDocument={() => {}} view="sort" onSelectView={() => {}} onOpenCardSettings={onOpenCardSettings} onOpenMonth={() => {}}/>)
  expect(screen.getByText('Add your card first')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Set up a card' }))
  expect(onOpenCardSettings).toHaveBeenCalled()
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
  // Phones: rows are the tap target (no Choose pill), with who and any suggestion in the meta.
  const list = screen.getByRole('list', { name: 'To sort' })
  expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual([
    'TRAIN TICKETS ONLINESun 8 Nov · Ada · Suggested: Groceries · Joint£112.81',
    'HOMEWARE HUT LEEDSThu 5 Nov · Ben · Suggested: Groceries · Joint−£24.99',
    'BOOK NOOK YORKTue 3 Nov · Ada · Suggested: Groceries · Joint£12.50',
  ])
  expect(screen.queryByText('Choose')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'To sort3' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /^To sort/ })).toHaveTextContent('To sort3')
})

it('shows the empty states', () => {
  render(<Harness initial={household()}/>)
  expect(screen.getByText('Nothing to sort')).toBeInTheDocument()
  expect(screen.getByText('Bring in the Excel export from Amex to start.')).toBeInTheDocument()
  cleanup()
  const document = household()
  document.card!.transactions = [tx('e', '2026-11-06', 'GREEN GROCER', 4460, { sort: { lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'groceries' } }], by: 'person', at: 'x' } })]
  render(<Harness initial={document}/>)
  expect(screen.getByText('Everything is sorted')).toBeInTheDocument()
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
  fireEvent.click(screen.getByRole('button', { name: 'More Spending options' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Add a transaction (N)' }))
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
  expect(screen.getByText('Everything is sorted')).toBeInTheDocument()
})

it('checks rule sorts, and offers to change the rule when one is re-sorted', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Sorted by rules · 1 · Check' }))
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
  fireEvent.click(screen.getByRole('button', { name: 'Sorted by rules · 1 · Check' }))
  fireEvent.click(screen.getByRole('button', { name: 'They all look right' }))
  expect(screen.queryByRole('button', { name: /Sorted by rules/ })).not.toBeInTheDocument()
  expect(saved!.card!.transactions.find(row => row.id === 'grocer')!.sort?.checkedAt).toEqual(expect.any(String))
})

it('lists all transactions on the Transactions tab, where any can be sorted again or put back', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }))
  expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
  // Phones: month headings, newest first, then rows that name where each went.
  expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['November 2026', 'October 2026'])
  const rows = screen.getAllByRole('button', { name: /TRAIN TICKETS ONLINE|GREEN GROCER/ })
  expect(rows.map(row => row.getAttribute('aria-label')!.split(', ').slice(3).join(', '))).toEqual(['To sort', 'To sort', 'Groceries · Joint, rule', 'Treats · Ada'])
  expect(screen.getByText('4 transactions · £186.41')).toBeInTheDocument()
  fireEvent.click(rows[3]!)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move back to To sort' }))
  expect(saved!.card!.transactions.find(row => row.id === 'old')!.sort).toBeUndefined()
  fireEvent.click(screen.getByRole('tab', { name: /^To sort/ }))
  expect(screen.getByRole('heading', { name: /^To sort/ })).toBeInTheDocument()
})

it('searches and filters transactions, with removable chips and Clear', () => {
  render(<Harness initial={sortingHousehold()} startView="transactions"/>)
  const search = screen.getByRole('searchbox', { name: 'Search transactions' })
  fireEvent.change(search, { target: { value: 'green' } })
  expect(screen.getAllByRole('button', { name: /TRAIN TICKETS ONLINE|GREEN GROCER/ })).toHaveLength(1)
  expect(screen.getByText('1 transaction · £44.60')).toBeInTheDocument()
  fireEvent.change(search, { target: { value: 'nothing like it' } })
  expect(screen.getByText('No transactions match “nothing like it”')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(search).toHaveValue('')

  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  const sheet = screen.getByRole('dialog', { name: 'Filter' })
  fireEvent.click(within(sheet).getByRole('checkbox', { name: 'To sort' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
  expect(screen.getAllByRole('button', { name: /TRAIN TICKETS ONLINE|GREEN GROCER/ }).map(row => row.getAttribute('aria-label')!.split(', ')[1])).toEqual(['£9.00', '£112.81'])
  expect(screen.getByRole('button', { name: 'Filter, 1 on' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter: To sort' }))
  expect(screen.getAllByRole('button', { name: /TRAIN TICKETS ONLINE|GREEN GROCER/ })).toHaveLength(4)
})

describe('Transactions on desktop', () => {
afterEach(() => vi.unstubAllGlobals())
it('shows a table banded by month, with Enter and ↓ on rows', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  render(<Harness initial={sortingHousehold()} startView="transactions"/>)
  const table = screen.getByRole('table', { name: 'Transactions' })
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Date', 'Merchant', 'Card', 'Amount', 'Pot or account', 'Tags'])
  expect(within(table).getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['November 2026 · 3 transactions · £166.41', 'October 2026 · 1 transaction · £20.00'])
  const rows = within(table).getAllByRole('row').filter(row => row.classList.contains('transactions-row'))
  expect(rows.map(row => row.textContent)).toContain('Sat 7 NovGREEN GROCER LONDONAda ··41001£44.60Groceries · JointRule')
  rows[0]!.focus()
  fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
  expect(rows[1]).toHaveFocus()
  fireEvent.keyDown(rows[1]!, { key: 'Enter' })
  expect(screen.getByRole('dialog', { name: /^Sort / })).toBeInTheDocument()
})
})

it('has three tabs everywhere, a Statements badge, and ⋯ with Add a transaction, Sorting rules and Card settings', () => {
  const onOpenRules = vi.fn(), onOpenCardSettings = vi.fn()
  render(<Spending document={sortingHousehold()} setDocument={() => {}} view="sort" onSelectView={() => {}} onOpenCardSettings={onOpenCardSettings} onOpenRules={onOpenRules} today="2026-11-12"/>)
  expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['To sort2', 'Transactions', 'Statements'])
  fireEvent.click(screen.getByRole('button', { name: 'More Spending options' }))
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Add a transaction (N)', 'Sorting rules', 'Card settings'])
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sorting rules' }))
  expect(onOpenRules).toHaveBeenCalled()
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

  fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }))
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

function refundHousehold(): BudgetDocument {
  const document = splitHousehold()
  document.card!.transactions.push(
    tx('costco', '2026-10-24', 'COSTCO', 18640, { merchant: 'COSTCO', sort: { lines: [
      { amountPence: 12179, destination: { kind: 'pot', potId: 'groceries' } }, { amountPence: 3250, destination: { kind: 'pot', potId: 'treats' }, item: 'Skincare' },
      { amountPence: 1712, destination: { kind: 'pot', potId: 'eating' }, item: 'Screenwash' }, { amountPence: 1499, destination: { kind: 'pot', potId: 'ben-treats' }, item: 'Running socks' },
    ], by: 'person', at: 'x' } }),
    tx('costco-refund', '2026-11-06', 'COSTCO', -1000, { merchant: 'COSTCO', refundOf: { transactionId: 'costco' } }),
    tx('shop', '2026-10-20', 'BOOK NOOK', 3000, { merchant: 'BOOK NOOK', sort: { lines: [{ amountPence: 3000, destination: { kind: 'pot', potId: 'treats' } }], by: 'person', at: 'x' } }),
    tx('shop-refund', '2026-11-05', 'BOOK NOOK', -1250, { merchant: 'BOOK NOOK' }),
    tx('paid', '2026-11-08', 'PAYMENT RECEIVED - THANK YOU', -35000, { kind: 'payment' }),
  )
  return document
}

it('sends a refund back to the purchase’s pot, in the month it arrived, and links the two rows', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={refundHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: /^BOOK NOOK, −£12.50/ }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Matches BOOK NOOK £30.00 on 20 Oct. It counts in November, the month it arrived.')).toBeInTheDocument()
  const first = within(within(dialog).getByRole('list', { name: 'Suggested pots and accounts' })).getAllByRole('button')[0]!
  expect(first).toHaveTextContent('Treats · AdaSuggested · Where the purchase went')
  fireEvent.click(first)
  expect(saved!.card!.transactions.find(row => row.id === 'shop-refund')).toMatchObject({ refundOf: { transactionId: 'shop' }, sort: { lines: [{ amountPence: -1250, destination: { kind: 'pot', potId: 'treats' } }] } })
  fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }))
  expect(screen.getByRole('button', { name: /^BOOK NOOK, −£12.50, .*Refund of BOOK NOOK £30.00 · 20 Oct/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^BOOK NOOK, £30.00, .*Refunded −£12.50 · 5 Nov/ })).toBeInTheDocument()
})

it('asks which part of a split purchase came back, or spreads it', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={refundHousehold()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: /^COSTCO, −£10.00/ }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/Matches the COSTCO purchase on 24 Oct, which was split. Which part came back\?/)).toBeInTheDocument()
  const parts = within(within(dialog).getByRole('list', { name: 'Parts of the purchase' })).getAllByRole('button')
  expect(parts.map(part => part.textContent)).toEqual(['Groceries · Joint£121.79', 'SkincareTreats · Ada£32.50', 'ScreenwashEating out · Joint£17.12', 'Running socksTreats · Ben£14.99', 'Spread across the splitIn proportion to each line'])
  fireEvent.click(parts[4]!)
  expect(saved!.card!.transactions.find(row => row.id === 'costco-refund')!.sort!.lines.map(line => line.amountPence)).toEqual([-653, -174, -92, -81])
  expect(screen.getByRole('status')).toHaveTextContent('Sorted to each part of the split.')
})

it('lists payments to Amex apart, and never as something to sort', () => {
  render(<Harness initial={refundHousehold()}/>)
  expect(screen.queryByRole('button', { name: /PAYMENT RECEIVED/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }))
  const section = screen.getByRole('region', { name: 'Payments to Amex' })
  expect(within(section).getByText('PAYMENT RECEIVED - THANK YOU')).toBeInTheDocument()
  expect(within(section).queryByRole('button')).not.toBeInTheDocument()
})

function monthHousehold(): BudgetDocument {
  const document = splitHousehold()
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: { kind: 'pot' as const, potId }, funding: 'equal' as const })
  document.budget.snapshots['2026-11'] = { items: [item('g', 'groceries', 52000), item('e', 'eating', 15000), item('t', 'treats', 20000)] }
  const sorted = (potId: string, pence: number) => ({ lines: [{ amountPence: pence, destination: { kind: 'pot' as const, potId } }], by: 'person' as const, at: 'x' })
  document.card!.transactions = [
    tx('g1', '2026-11-01', 'MARKET HALL DELI', 7490, { sort: sorted('groceries', 7490) }), tx('g2', '2026-11-03', 'GREEN GROCER', 8835, { sort: sorted('groceries', 8835) }),
    tx('g3', '2026-11-05', 'GREEN GROCER', 4460, { sort: sorted('groceries', 4460) }), tx('g4', '2026-11-07', 'GREEN GROCER', 4120, { sort: sorted('groceries', 4120) }),
    tx('g5', '2026-11-08', 'GREEN GROCER', 2715, { sort: sorted('groceries', 2715) }), tx('g6', '2026-11-10', 'GREEN GROCER', 6240, { sort: sorted('groceries', 6240) }),
    tx('g0', '2026-10-30', 'GREEN GROCER', 1000, { sort: sorted('groceries', 1000), statementKey: 'amex:2026-11-24' }),
    tx('g7', '2026-11-26', 'GREEN GROCER', 1, { sort: sorted('groceries', 1), statementKey: 'amex:2026-12-24' }),
    tx('e1', '2026-11-06', 'CORNER CAFE', 6400, { sort: sorted('eating', 6400) }),
    tx('t1', '2026-11-04', 'BOOK NOOK', 21250, { sort: sorted('treats', 21250) }),
    tx('j1', '2026-11-09', 'TRAIN TICKETS', 11281, { sort: { lines: [{ amountPence: 11281, destination: { kind: 'account', accountId: 'joint' } }], by: 'person', at: 'x' } }),
    tx('u1', '2026-11-09', 'UNSORTED', 900),
  ]
  return document
}

it('shows planned vs spent for each pot this month, grouped like Plan, with pace', () => {
  render(<MonthHarness initial={monthHousehold()}/>)
  expect(screen.getByRole('heading', { level: 2, name: 'Pots£727.92 spent of £870.00' })).toBeInTheDocument()
  // Phones: a card per group, three lines a pot.
  expect([...window.document.querySelectorAll('.pots-card-title')].map(heading => heading.textContent)).toEqual(['Joint', 'Ada', 'Accounts'])
  expect(screen.getByRole('button', { name: 'Groceries: £181.39 left. £131 ahead · runs out ~Thu 19 Nov' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Eating out: £86.00 left. On track' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Treats: £12.50 over. £12.50 over · covered when November closes' })).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Accounts' })).getByText(/one-offs/).closest('.pots-card-row')).toHaveTextContent('£112.81 spent')
  expect(window.document.querySelector('.pots-status.is-warning')).toHaveTextContent('£131 ahead · runs out ~Thu 19 Nov')
})

it('shows the pots as one aligned table on desktop', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const onOpenPot = vi.fn()
  render(<MonthPage document={monthHousehold()} setDocument={() => {}} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={onOpenPot} onSort={() => {}} today="2026-11-12"/>)
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Pot', 'Spent', 'Planned', 'Left', 'Pace', 'In Monzo'])
  const row = (name: string) => within(table).getByRole('button', { name: new RegExp(`^${name}:`) }).closest('tr')!
  expect([...row('Groceries').querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['£338.61', '£520.00', '£181.39', '£131 ahead · runs out ~Thu 19 Nov', '—'])
  expect(within(table).getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(expect.arrayContaining(['Joint', 'Ada', 'Accounts']))
  fireEvent.click(row('Groceries'))
  expect(onOpenPot).toHaveBeenCalledWith('groceries')
  vi.unstubAllGlobals()
})

it('opens a steady pot: what’s left a day, the pace chart, when it runs out, and its transactions', () => {
  render(<MonthHarness initial={monthHousehold()}/>)
  fireEvent.click(screen.getByRole('button', { name: /^Groceries:/ }))
  expect(screen.getByRole('heading', { level: 1, name: 'Groceries' })).toBeInTheDocument()
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Month' })).toBeInTheDocument()
  expect(screen.getByText('Joint · monthly · November 2026 · day 12 of 30')).toBeInTheDocument()
  expect(screen.getByText('for 18 days').parentElement).toHaveTextContent('£181.39 for 18 days')
  expect(screen.getByText('About £10 a day · you’ve averaged £28')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Groceries spending so far against the plan: £338.61 spent by day 12, against £208.00 at the planned pace, of £520.00 planned. Runs out around Thu 19 Nov.' })).toBeInTheDocument()
  // One run-out message, under the chart.
  expect(screen.getAllByText(/runs out/i)).toHaveLength(1)
  expect(screen.getByText('At this rate it runs out around Thu 19 Nov, 11 days before the month ends.')).toBeInTheDocument()
  const rows = within(screen.getByRole('list', { name: 'Transactions' })).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('GREEN GROCERThu 26 Nov · Ada ··41001 · on December statement£0.01')
  expect(rows).toHaveLength(7)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Month' }))
  expect(screen.getByRole('heading', { level: 2, name: /^Pots/ })).toBeInTheDocument()
})

it('shows what’s left in each pot when sorting', () => {
  render(<Harness initial={monthHousehold()}/>)
  fireEvent.click(screen.getByRole('button', { name: /^UNSORTED/ }))
  const options = within(within(screen.getByRole('dialog')).getByRole('list', { name: 'Suggested pots and accounts' })).getAllByRole('button')
  expect(options.map(option => option.textContent)).toContain('Eating out · JointJoint£86.00 left')
  expect(options.map(option => option.textContent)).toContain('Treats · AdaSuggested · Ada’s card£12.50 over')
})

it('shows what’s free in a carry-over pot, how it’s worked out, and checks it against the bank', () => {
  const document = monthHousehold()
  document.budget.pots.push({ id: 'bills', name: 'Bills', accountId: 'joint' })
  document.budget.snapshots['2026-11']!.items.push({ id: 'ins', name: 'Car insurance', categoryId: 'c', entryAmountPence: 61200, amountPence: 5100, frequency: 'annually', destination: { kind: 'pot', potId: 'bills' }, funding: 'equal' })
  document.card!.pots = { bills: { carriesOver: true } }
  document.card!.transactions.push(
    tx('b1', '2026-10-10', 'STREAMFLIX', 8600, { statementKey: 'amex:2026-10-24', sort: { lines: [{ amountPence: 8600, destination: { kind: 'pot', potId: 'bills' } }], by: 'person', at: 'x' } }),
    tx('b2', '2026-11-05', 'STREAMFLIX', 1999, { sort: { lines: [{ amountPence: 1999, destination: { kind: 'pot', potId: 'bills' } }], by: 'person', at: 'x' } }),
  )
  let saved: BudgetDocument | undefined
  render(<MonthHarness initial={document} onChange={next => { saved = next }}/>)
  expect(screen.getByRole('button', { name: 'Bills · carries over: £19.99 spent. Check the balance to see what’s free' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Bills · carries over:/ }))
  expect(screen.getByText('Free in the pot').parentElement).toHaveTextContent('Free in the pot—')
  const sums = () => [...window.document.body.querySelectorAll('.carry-over-sums > div')].map(row => row.textContent)
  expect(sums()).toEqual(['Not checked yet—', 'Waiting to settle · October statement−£86.00', 'Waiting to settle · November statement−£19.99'])
  // The yearly item it saves for has no renewal date yet.
  expect(screen.getByRole('list', { name: 'Yearly bills set aside here' })).toHaveTextContent('Car insuranceNo renewal date£51.00 a month£612.00 a year')
  fireEvent.click(screen.getByRole('button', { name: 'Check against Monzo' }))
  const dialog = screen.getByRole('dialog', { name: 'Check against Monzo' })
  fireEvent.change(within(dialog).getByLabelText('What’s in Bills now?'), { target: { value: '1,240' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save balance' }))
  expect(saved!.card!.pots.bills!.checkedBalance).toEqual({ pence: 124000, at: expect.any(String) })
  expect(sums()[0]).toMatch(/^In Monzo · checked .+£1,240.00$/)
  expect(sums()).toContain('Free£1,134.01')
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Month' }))
  expect(screen.getByRole('button', { name: 'Bills · carries over: £1,134.01 free. No pace' })).toBeInTheDocument()
})

function statementHousehold(): BudgetDocument {
  const document = monthHousehold()
  document.card!.transactions = document.card!.transactions.filter(row => row.id !== 'u1' && row.id !== 'g7')
  document.card!.transactions.push(
    tx('oct', '2026-10-20', 'GREEN GROCER', 4000, { statementKey: 'amex:2026-10-24', sort: { lines: [{ amountPence: 4000, destination: { kind: 'pot', potId: 'groceries' } }], by: 'person', at: 'x' } }),
    tx('pay', '2026-11-08', 'PAYMENT RECEIVED - THANK YOU', -4000, { kind: 'payment' }),
  )
  document.card!.statements = {
    'amex:2026-10-24': { cardId: 'amex', closeDate: '2026-10-24', finalImportAt: '2026-10-27T08:00:00Z', amexSummary: { previousPence: 0, paymentsAndCreditsPence: 0, chargesPence: 4000, totalPence: 4000, at: 'x' } },
  }
  return document
}

it('lists statements newest first with where each one is', () => {
  render(<Harness initial={statementHousehold()} startView="statements" today="2026-11-30"/>)
  expect(within(screen.getByRole('list', { name: 'Statements' })).getAllByRole('button').map(row => row.textContent)).toEqual([
    'November statement25 Oct – 24 Nov · due Sat 19 Dec£737.91Needs the final export',
    'October statement25 Sep – 24 Oct · due Wed 18 Nov£40.00Ready to settle · due Wed 18 Nov',
  ])
  expect(screen.getByText('Needs the final export')).toHaveClass('is-warning')
})

it('shows a statement’s checks, then its Settle up steps on the same page, with the breakdown folded', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={statementHousehold()} startView="statements" today="2026-11-30" onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: /^November statement/ }))
  expect(screen.getByRole('heading', { name: 'November statement' })).toBeInTheDocument()
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Statements' })).toBeInTheDocument()
  expect(screen.getByText('To Amex by Sat 19 Dec').nextElementSibling).toHaveTextContent('£737.91')
  expect(screen.getByText('✓ All 10 sorted')).toBeInTheDocument()
  expect(screen.getByText('No summary from Amex yet')).toBeInTheDocument()
  // The breakdown is folded, with its figures inside.
  const months = screen.getByText('Which months it counts in').closest('details')!
  expect(months).not.toHaveAttribute('open')
  expect(months.querySelector('summary')).toHaveTextContent('October £10.00 · November £727.91')
  expect([...months.querySelectorAll('.statement-months > div')].map(row => row.textContent)).toEqual(['Counts in October£10.00', 'Counts in November£727.91'])
  const shares = screen.getByText('Shares by account').closest('details')!
  expect(within(within(shares).getByRole('region', { name: 'Ada' })).getByText('Treats · Ada').nextElementSibling).toHaveTextContent('£212.50')
  expect(within(within(shares).getByRole('region', { name: 'Joint' })).getByText('One-offs, already in Joint').nextElementSibling).toHaveTextContent('£112.81')
  // Not complete yet: what it's waiting for instead of steps.
  const waiting = screen.getByRole('list', { name: 'Before you can settle up' })
  expect(waiting).toHaveTextContent('Bring in the final export')
  expect(waiting).toHaveTextContent('Amex shows a payment of £40.00 on 8 Nov')
  expect(screen.queryByRole('region', { name: 'Settle-up steps' })).not.toBeInTheDocument()
  fireEvent.click(within(waiting).getByRole('button', { name: 'Settle without it' }))
  // Ready: the steps come inline, in account columns.
  expect(screen.getByRole('heading', { name: 'Settle up0 of 5 done' })).toBeInTheDocument()
  const ada = within(screen.getByRole('region', { name: 'Ada steps' }))
  expect(ada.getAllByRole('listitem').map(item => item.querySelector('.step-main')?.textContent)).toEqual(['Out of Treats£212.50', 'Send to Joint£212.50'])
  // Joint's pot moves and paying Amex from Joint are one group, with Pay last.
  const joint = within(screen.getByRole('region', { name: 'Joint steps' }))
  expect(joint.getAllByRole('listitem').map(item => item.querySelector('.step-main')?.textContent)).toEqual(['Out of Eating out£64.00', 'Out of Groceries£348.60', 'Pay Amex from Joint£737.91'])
  expect(joint.getByText('Includes £112.81 of one-offs already in Joint')).toBeInTheDocument()
  fireEvent.click(ada.getByRole('button', { name: 'Out of Treats done' }))
  expect(saved!.card!.statements['amex:2026-11-24']!.ticks!['settle:out:treats']).toMatchObject({ amountPence: 21250 })
  expect(screen.getByRole('heading', { name: 'Settle up1 of 5 done' })).toBeInTheDocument()
  for (const name of ['Send to Joint done', 'Out of Eating out done', 'Out of Groceries done', 'Pay Amex from Joint done']) fireEvent.click(screen.getByRole('button', { name }))
  expect(saved!.card!.statements['amex:2026-11-24']!.settledAt).toEqual(expect.any(String))
  // All ticked: the chip says Settled and the steps fold to one line; no banner.
  expect(screen.getAllByText(/^Settled /).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /^Settle up5 of 5 done/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText(/is settled/)).not.toBeInTheDocument()
})

it('says what a statement is waiting for before it can be settled', () => {
  const document = statementHousehold()
  document.card!.transactions.push(tx('late', '2026-11-20', 'NEW SHOP', 500))
  render(<Harness initial={document} startView="statements" today="2026-11-20"/>)
  fireEvent.click(screen.getByRole('button', { name: /^November statement/ }))
  const waiting = screen.getByRole('list', { name: 'Before you can settle up' })
  expect(within(waiting).getByText('Closes Tue 24 Nov')).toBeInTheDocument()
  expect(within(waiting).getByText('1 transaction to sort')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Settle up/ })).not.toBeInTheDocument()
  fireEvent.click(within(waiting).getByRole('button', { name: 'Sort them' }))
  expect(screen.getByRole('heading', { name: /^To sort/ })).toBeInTheDocument()
})

it('offers to tick Pay when Amex shows a matching payment', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={statementHousehold()} startView="statements" today="2026-11-30" onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: /^October statement/ }))
  expect(screen.getByText('✓ Matches Amex’s summary')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tick Pay Amex' })).not.toBeInTheDocument()
  cleanup()
  const document = statementHousehold()
  document.card!.transactions.find(row => row.id === 'pay')!.statementKey = 'amex:2026-10-24'
  render(<Harness initial={document} startView="statements" today="2026-11-30" onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: /^October statement/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Tick Pay Amex' }))
  expect(saved!.card!.statements['amex:2026-10-24']!.ticks!['settle:pay']).toMatchObject({ amountPence: 4000 })
})

function closingHousehold(): BudgetDocument {
  const document = monthHousehold()
  document.budget.pots.push({ id: 'car', name: 'Car', accountId: 'joint' })
  document.budget.snapshots['2026-10'] = { items: [...document.budget.snapshots['2026-11']!.items, { id: 'c', name: 'c', categoryId: 'c', entryAmountPence: 8000, amountPence: 8000, frequency: 'monthly', destination: { kind: 'pot', potId: 'car' }, funding: 'equal' }] }
  const sorted = (potId: string, pence: number) => ({ lines: [{ amountPence: pence, destination: { kind: 'pot' as const, potId } }], by: 'person' as const, at: 'x' })
  document.card!.transactions = [
    tx('o1', '2026-10-05', 'GREEN GROCER', 51180, { statementKey: 'amex:2026-10-24', sort: sorted('groceries', 51180) }),
    tx('o2', '2026-10-10', 'CORNER CAFE', 18500, { statementKey: 'amex:2026-10-24', sort: sorted('eating', 18500) }),
    tx('o3', '2026-10-12', 'GARAGE', 3500, { statementKey: 'amex:2026-10-24', sort: sorted('car', 3500) }),
  ]
  document.card!.months = { '2026-07': { closedAt: 'x', leftovers: { car: 4500 } }, '2026-08': { closedAt: 'x', leftovers: { car: 4500 } }, '2026-09': { closedAt: 'x', leftovers: { car: 4500 } } }
  document.card!.imports = [{ at: '2026-11-04T08:00:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 1, added: 1, skipped: 0, sortedByRules: 0, latestDate: '2026-11-02', matchesSummary: true }]
  return document
}

it('closes a month inline: covers the overspend, ticks the cover, sees leftovers and the build-up, then closes from the header', () => {
  let saved: BudgetDocument | undefined
  render(<MonthHarness initial={closingHousehold()} today="2026-11-04" onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
  expect(screen.getByText(/^Closing · ended \w{3} 31 Oct$/)).toBeInTheDocument()
  // The ended month is the close checklist: Cover overspends first, Pots after it.
  const headings = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
  expect(headings.indexOf('Cover overspends1')).toBeLessThan(headings.findIndex(text => text?.startsWith('Pots')))
  expect(screen.queryByRole('heading', { name: 'Waiting' })).not.toBeInTheDocument()
  const coverFrom = screen.getByLabelText('Covered from')
  expect(coverFrom).toHaveDisplayValue('Joint')
  expect([...(coverFrom as HTMLSelectElement).options].map(option => option.text)).toEqual(['Joint', 'Treats · Ada · £200.00 left', 'Car · Joint · £45.00 left', 'Groceries · Joint · £8.20 left', 'November’s Eating out (moves no money)'])
  // The cover is a payday-style step: the amount is its own copyable chip, not part of the words.
  expect(screen.getByRole('button', { name: 'Copy £35.00' })).toBeInTheDocument()
  expect(coverFrom.closest('.step-row')).toHaveTextContent('Eating out · Joint is £35.00 over · covered from')
  fireEvent.click(screen.getByRole('button', { name: 'Move from Joint into Eating out done' }))
  expect(saved!.card!.months['2026-10']!.coverTicks!['cover:eating']).toMatchObject({ amountPence: 3500 })
  expect([...window.document.querySelectorAll('.close-left tr')].map(row => row.textContent)).toEqual(['PotLeftBuilt upBuild-up', 'Car · Joint£45.00£180.00Move £100.00…Keep it', 'Groceries · Joint£8.20£8.20', 'Treats · Ada£200.00£200.00'])
  expect(screen.getByText('Car has built up £180.00, more than £160.00 (2× its £80.00 monthly plan). Move some?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Move £100.00…' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }))
  expect(saved!.card!.pots.car!.movedOut).toEqual([{ pence: 10000, at: expect.any(String) }])
  expect(screen.queryByText(/Car has built up/)).not.toBeInTheDocument()
  fireEvent.change(coverFrom, { target: { value: 'next-month' } })
  expect(screen.getByText(/Leaves Eating out £35.00 short in November\./)).toBeInTheDocument()
  const close = screen.getByRole('button', { name: 'Close October' })
  expect(close).toHaveClass('primary-button')
  fireEvent.click(close)
  expect(saved!.card!.months['2026-10']).toMatchObject({ closedAt: expect.any(String), covers: [{ potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } }], leftovers: { car: 4500, groceries: 820, treats: 20000 } })
  // Closed: the chip says what's next and the sections fold to one line.
  expect(screen.getByText(/^To settle · closed /)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^October closed/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Close October' })).not.toBeInTheDocument()
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
})

it('waits for late postings before closing, unless all transactions are in', () => {
  const document = closingHousehold()
  document.card!.imports[0]!.at = '2026-11-02T08:00:00.000Z'
  let saved: BudgetDocument | undefined
  render(<MonthHarness initial={document} today="2026-11-02" onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
  const close = screen.getByRole('button', { name: 'Close October' })
  expect(close).toBeDisabled()
  expect(close).toHaveAttribute('title', 'Waiting for late October transactions to post.')
  expect(within(screen.getByRole('list', { name: 'Waiting' })).getByText('Late October transactions can take a few days to post.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'All October transactions are in' }))
  expect(saved!.card!.months['2026-10']!.allInAt).toEqual(expect.any(String))
  expect(screen.getByRole('button', { name: 'Close October' })).toBeEnabled()
  expect(screen.queryByRole('heading', { name: 'Waiting' })).not.toBeInTheDocument()
})

it('shows a change after closing, and closes again', () => {
  let document = closingHousehold()
  document.card!.months['2026-10'] = { closedAt: '2026-11-04T09:00:00Z', closedSpent: { 'pot:groceries': 50000, 'pot:eating': 18500, 'pot:car': 3500 }, leftovers: { groceries: 2000, car: 4500 }, covers: [] }
  let saved: BudgetDocument | undefined
  render(<MonthHarness initial={document} today="2026-11-06" onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
  expect(screen.getByText('Changed since closed: Groceries · Joint £500.00 → £511.80.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close again' }))
  expect(saved!.card!.months['2026-10']!.closedSpent!['pot:groceries']).toBe(51180)
  document = saved!
  expect(document.card!.months['2026-10']!.leftovers).toEqual({ groceries: 820, car: 4500, treats: 20000 })
})

describe('on desktop', () => {
  const desktop = () => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  afterEach(() => vi.unstubAllGlobals())

  it('sorts from the keyboard: arrows move, Enter places the suggestion, A makes a rule, S splits, / chooses a pot', async () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={sortingHousehold()} onChange={next => { saved = next }}/>)
    expect(screen.getByRole('tab', { name: 'Transactions' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'To sort' })
    expect(table).toHaveAccessibleDescription('J K move · ↵ place · / choose a pot · A always · S split')
    // No Place column: Enter places, and a quiet ✓ does for the mouse.
    expect(within(table).queryByRole('button', { name: 'Place' })).not.toBeInTheDocument()
    const rows = () => within(table).getAllByRole('row').slice(1)
    expect(rows().map(row => row.getAttribute('aria-label'))).toEqual(['TRAIN TICKETS ONLINE, £9.00, Mon 9 Nov', 'TRAIN TICKETS ONLINE, £112.81, Sun 8 Nov'])
    expect(within(rows()[0]!).getByLabelText('Pot for TRAIN TICKETS ONLINE')).toHaveDisplayValue('Treats · Ada')
    expect(within(rows()[0]!).getByText('Suggested')).toHaveClass('status-chip')
    expect(within(rows()[0]!).getByRole('button', { name: 'Place TRAIN TICKETS ONLINE in Treats · Ada' })).toBeInTheDocument()
    rows()[0]!.focus()
    fireEvent.keyDown(rows()[0]!, { key: 'j' })
    expect(rows()[1]).toHaveFocus()
    fireEvent.keyDown(rows()[1]!, { key: 'k' })
    expect(rows()[0]).toHaveFocus()
    fireEvent.keyDown(rows()[0]!, { key: 'ArrowDown' })
    expect(rows()[1]).toHaveFocus()
    fireEvent.keyDown(rows()[1]!, { key: '/' })
    expect(within(rows()[1]!).getByLabelText('Pot for TRAIN TICKETS ONLINE')).toHaveFocus()
    fireEvent.change(within(rows()[1]!).getByLabelText('Pot for TRAIN TICKETS ONLINE'), { target: { value: 'pot:eating' } })
    fireEvent.keyDown(within(rows()[1]!).getByLabelText('Pot for TRAIN TICKETS ONLINE'), { key: 'Enter' })
    expect(saved!.card!.transactions.find(row => row.id === 'new')!.sort?.lines[0]?.destination).toEqual({ kind: 'pot', potId: 'eating' })
    expect(screen.getByRole('status')).toHaveTextContent('Sorted TRAIN TICKETS ONLINE to Eating out · Joint.')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveFocus()
    fireEvent.keyDown(rows()[0]!, { key: 'a' })
    expect(within(rows()[0]!).getByRole('checkbox')).toBeChecked()
    fireEvent.keyDown(rows()[0]!, { key: 'Enter' })
    // The merchant went to Eating out a moment ago, so that's now the suggestion.
    expect(saved!.card!.rules.at(-1)).toMatchObject({ contains: 'TRAIN', destination: { kind: 'pot', potId: 'eating' } })
    expect(screen.getByText('Everything is sorted')).toBeInTheDocument()
  })

  it('opens the split editor with S', () => {
    desktop()
    render(<Harness initial={sortingHousehold()}/>)
    const row = within(screen.getByRole('table', { name: 'To sort' })).getAllByRole('row')[1]!
    fireEvent.keyDown(row, { key: 's' })
    expect(screen.getByRole('dialog', { name: 'Split TRAIN TICKETS ONLINE' })).toBeInTheDocument()
  })

  it('leads with the card and its open statement, one Bring in, and no side rail', () => {
    desktop()
    render(<Harness initial={statementHousehold()} today="2026-11-30"/>)
    expect(screen.getByRole('heading', { level: 1, name: 'Amex' })).toBeInTheDocument()
    expect(screen.getByText(/^December statement £[\d,.]+ · closes Thu 24 Dec$/)).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(window.document.querySelectorAll('.primary-button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Bring in' })).toHaveClass('primary-button')
    expect(screen.getByRole('heading', { name: /^To sort/ }).parentElement?.parentElement).toHaveTextContent('Nothing brought in yet · sorted to 10 Nov')
    // October is ready and unsettled: the Statements tab says so.
    expect(screen.getByRole('tab', { name: /^Statements/ })).toHaveTextContent('Statements1 to settle')
  })
})

describe('the Amex pot', () => {
  const sorted = (potId: string, amountPence: number) => ({ sort: { lines: [{ amountPence, destination: { kind: 'pot' as const, potId } }], by: 'person' as const, at: 'x' } })
  function withPot(): BudgetDocument {
    const document = household()
    document.budget.accounts.push({ id: 'ben-own', name: 'Current', provider: 'Nationwide', ownerPersonIds: ['ben'] })
    document.budget.pots.push({ id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }, { id: 'fuel', name: 'Fuel', accountId: 'ben-own' })
    document.card!.cards[0]!.setAside = { potId: 'amex-pot', fromCloseDate: '2026-11-24' }
    document.card!.transactions = [
      tx('old', '2026-10-20', 'OLD SHOP', 999, { statementKey: 'amex:2026-10-24', ...sorted('groceries', 999) }),
      tx('grocer', '2026-11-04', 'GREEN GROCER', 4460, sorted('groceries', 4460)),
      tx('fuel', '2026-11-06', 'FUEL STOP', 5820, { cardSuffix: '41009', personId: 'ben', ...sorted('fuel', 5820) }),
      tx('todo', '2026-11-07', 'CORNER CAFE', 1800),
    ]
    return document
  }

  it('sets aside after To sort: the moves to copy, Mark moved with Undo, and Not all of it for the checklist', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    let saved: BudgetDocument | undefined
    render(<Harness initial={withPot()} onChange={next => { saved = next }}/>)
    const block = screen.getByRole('heading', { name: /^Set aside in the Amex pot/ }).closest('section')!
    expect(block).toHaveTextContent('£102.80 · 2 transactions sorted since the start')
    expect(within(block).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Out of Fuel£58.20', 'Send to Joint£58.20', 'Out of Groceries£44.60', 'Into Amex£102.80'])
    expect(screen.queryByText(/to move to the Amex pot/)).not.toBeInTheDocument()
    // Not all of it: the checklist, where the fuel can wait for next time.
    fireEvent.click(within(block).getByRole('button', { name: 'Not all of it' }))
    const dialog = screen.getByRole('dialog', { name: 'Move to the Amex pot' })
    const steps = within(dialog).getByRole('region', { name: 'Moves to make' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /FUEL STOP/ }))
    expect(within(steps).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Out of Groceries£44.60', 'Into Amex£44.60'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Moved £44.60' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const message = () => window.document.querySelector('.spending-message')
    expect(message()).toHaveTextContent('Moved £44.60 to the Amex pot. Undo')
    expect(saved!.card!.moves![0]!.transactions.map(row => row.transactionId)).toEqual(['grocer'])
    expect(decodeBudgetDocument(saved)).not.toBeNull()
    expect(screen.getByRole('heading', { name: /^Set aside in the Amex pot/ }).closest('section')).toHaveTextContent('£58.20 · 1 transaction sorted since')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(saved!.card!.moves).toBeUndefined()
    // Mark moved: everything at once.
    fireEvent.click(screen.getByRole('button', { name: 'Mark £102.80 moved' }))
    expect(saved!.card!.moves![0]!.transactions.map(row => row.transactionId).sort()).toEqual(['fuel', 'grocer'])
    expect(message()).toHaveTextContent('Moved £102.80 to the Amex pot. Undo')
    expect(screen.queryByRole('heading', { name: /^Set aside/ })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('tags moved transactions in All transactions, and a re-sort as changed since moved', () => {
    const document = withPot()
    document.card!.moves = [{ id: 'm1', cardId: 'amex', at: '2026-11-07T09:00:00Z', transactions: [{ transactionId: 'grocer', lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'fuel' } }] }] }]
    render(<Harness initial={document} startView="transactions"/>)
    expect(screen.getByRole('button', { name: /^GREEN GROCER.*changed since moved/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^FUEL STOP/ })).not.toHaveAccessibleName(/moved/)
    // October is before the pot: no tag.
    expect(screen.getByRole('button', { name: /^OLD SHOP/ })).not.toHaveAccessibleName(/moved/)
  })

  it('works out each pot’s balance, checks them all at once, and shows the Amex pot', () => {
    const document = withPot()
    document.card!.pots = { groceries: { checkedBalance: { pence: 50000, at: '2026-11-01T00:00:00.000Z' } } }
    document.card!.moves = [{ id: 'm1', cardId: 'amex', at: '2026-11-05T09:00:00.000Z', transactions: [{ transactionId: 'grocer', lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'groceries' } }] }] }]
    let saved: BudgetDocument | undefined
    render(<MonthHarness initial={document} onChange={next => { saved = next }}/>)
    expect(screen.getByRole('button', { name: /^Groceries: £44.60 spent\./ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More Month options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Check balances' }))
    const dialog = screen.getByRole('dialog', { name: 'Check balances' })
    const groceries = within(dialog).getByLabelText(/^Groceries/)
    expect(groceries).toHaveAccessibleName(/North: £455.40 · checked/)
    fireEvent.change(groceries, { target: { value: '455.40' } })
    expect(within(dialog).getByText('Matches')).toBeInTheDocument()
    fireEvent.change(groceries, { target: { value: '450' } })
    expect(within(dialog).getByText('£5.40 less than North worked out')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 balance' }))
    expect(saved!.card!.pots.groceries!.checkedBalance!.pence).toBe(45000)
    expect(screen.getByRole('status')).toHaveTextContent('1 balance checked.')
    // The Amex pot: what each statement it pays costs, and what's still to move.
    expect(screen.getByRole('button', { name: /^Amex · set aside: .*£76.20 still to move for November$/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Amex · set aside:/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Amex pot' })).toBeInTheDocument()
    expect(screen.getByText(/^Pays the Amex from the \w+ statement$/)).toBeInTheDocument()
    const statements = within(screen.getByRole('list', { name: 'Statements it pays' })).getAllByRole('listitem')
    expect(statements[0]).toHaveTextContent('November statement£44.60 moved in · £76.20 still to move£120.80')
  })

  it('a statement paid from the pot shows what’s in it, moves the rest, then pays from the pot', () => {
    const document = withPot()
    document.card!.transactions = document.card!.transactions.filter(row => row.id !== 'todo')
    document.card!.statements['amex:2026-11-24'] = { cardId: 'amex', closeDate: '2026-11-24', settleWithoutFinalAt: '2026-11-26T09:00:00Z' }
    render(<Harness initial={document} startView="statements" today="2026-11-30"/>)
    fireEvent.click(screen.getByRole('button', { name: /^November statement/ }))
    // Ready: the steps are inline, starting with the Amex pot.
    expect(screen.getByText('Move the rest to the Amex pot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Amex from the Amex pot done' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settle up0 of 2 done' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move them' }))
    const dialog = screen.getByRole('dialog', { name: 'Move to the Amex pot' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Moved £102.80' }))
    expect(screen.getByText('Everything is in the Amex pot')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pay Amex from the Amex pot done' }))
    expect(screen.getByRole('button', { name: /^Settle up2 of 2 done/ })).toBeInTheDocument()
  })

  it('shows nothing to move without a set-aside pot', () => {
    const document = withPot()
    delete document.card!.cards[0]!.setAside
    render(<Harness initial={document}/>)
    expect(screen.queryByRole('button', { name: 'Move to the Amex pot' })).not.toBeInTheDocument()
  })
})
