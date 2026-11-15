// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import type { SpendingSection } from '../state/navigation'
import { FreshnessLine } from './Freshness'
import { freshness } from './spendingFormat'
import { MonthPage } from './MonthPage'
import { Spending } from './Spending'
import { PotDetail } from './SpendingMonth'

/** Spending ↔ Month link, PR 1: links both ways (F1) and the freshness line (F2). */

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

const desktop = () => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
const TODAY = '2026-11-14'

const tx = (id: string, date: string, description: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description, merchant: description, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: '2026-11-14T10:00:00Z', ...overrides,
})
const to = (destination: { kind: 'pot'; potId: string } | { kind: 'account'; accountId: string }, amountPence: number) => ({ lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' })

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }]
  document.budget.categories = [{ id: 'c', name: 'Food' }]
  document.budget.snapshots['2026-11'] = { items: [{ id: 'g', name: 'Groceries', categoryId: 'c', entryAmountPence: 45000, amountPence: 45000, frequency: 'monthly', destination: { kind: 'pot', potId: 'groceries' }, funding: 'equal' }] }
  document.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }] }] }
  document.card.transactions = [
    tx('tesco-1', '2026-11-06', 'TESCO STORES', 13581, { sort: to({ kind: 'pot', potId: 'groceries' }, 13581) }),
    tx('tesco-2', '2026-11-13', 'TESCO STORES', 7276, { sort: to({ kind: 'pot', potId: 'groceries' }, 7276) }),
    tx('amazon', '2026-11-04', 'AMAZON MARKETPLACE', 1889, { sort: to({ kind: 'account', accountId: 'joint' }, 1889) }),
    tx('waiting', '2026-11-12', 'CORNER SHOP', 900),
    tx('paid', '2026-11-14', 'PAYMENT RECEIVED', -50000, { kind: 'payment' }),
  ]
  return document
}

function SpendingHarness({ initial = household(), view = 'transactions', onOpenMonth = () => {}, transactionId = null }: { initial?: BudgetDocument; view?: SpendingSection; onOpenMonth?: (potId: string, month: string) => void; transactionId?: string | null }) {
  const [document, setDocument] = useState(initial)
  const [section, setSection] = useState<SpendingSection>(view)
  return <Spending document={document} setDocument={setDocument} view={section} onSelectView={setSection} onOpenCardSettings={() => {}} onOpenMonth={onOpenMonth} transactionId={transactionId} today={TODAY}/>
}

describe('the freshness line (F2)', () => {
  it('says how far the card is sorted and what is waiting, leaving payments out', () => {
    expect(freshness(household())).toEqual({ lead: 'Amex sorted to Fri 13 Nov', toSort: 1, broughtIn: true })
    const sorted = household()
    sorted.card!.transactions = sorted.card!.transactions.filter(row => row.id !== 'waiting')
    expect(freshness(sorted)).toEqual({ lead: 'Amex sorted to Fri 13 Nov', toSort: 0, broughtIn: true })
    const empty = household()
    empty.card!.transactions = []
    expect(freshness(empty)).toEqual({ lead: 'Amex not brought in yet', toSort: 0, broughtIn: false })
    const noCard = household()
    delete noCard.card
    expect(freshness(noCard)).toBeNull()
  })

  it('links what is waiting to To sort, and says all sorted otherwise', () => {
    const onSort = vi.fn()
    const { container, rerender } = render(<FreshnessLine document={household()} onSort={onSort}/>)
    expect(container).toHaveTextContent('Amex sorted to Fri 13 Nov · 1 to sort')
    fireEvent.click(screen.getByRole('button', { name: '1 to sort' }))
    expect(onSort).toHaveBeenCalled()
    const sorted = household()
    sorted.card!.transactions = sorted.card!.transactions.filter(row => row.id !== 'waiting')
    rerender(<FreshnessLine document={sorted} onSort={onSort}/>)
    expect(container).toHaveTextContent('Amex sorted to Fri 13 Nov · all sorted')
    const empty = household()
    empty.card!.transactions = []
    rerender(<FreshnessLine document={empty} onSort={onSort}/>)
    expect(container.textContent).toBe('Amex not brought in yet')
  })

  it('shows on Month: beside Pots on desktop, under the month on phones, and not for a month still to come', () => {
    const onSort = vi.fn()
    const month = (value: string) => <MonthPage document={household()} setDocument={() => {}} month={value} onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={onSort} today={TODAY}/>
    const { rerender } = render(month('2026-11'))
    expect(screen.getByText(/^Amex sorted to Fri 13 Nov/).closest('.page-header-context')).not.toBeNull()
    rerender(month('2026-12'))
    expect(screen.queryByText(/^Amex sorted to/)).toBeNull()
    cleanup()
    desktop()
    render(month('2026-11'))
    const aside = screen.getByText(/^Amex sorted to Fri 13 Nov/).closest('.ui-section-aside')!
    expect(aside).toHaveTextContent('Amex sorted to Fri 13 Nov · 1 to sort · Not checked yet')
    fireEvent.click(within(aside as HTMLElement).getByRole('button', { name: '1 to sort' }))
    expect(onSort).toHaveBeenCalled()
  })

  it('shows under the pace chart on a pot page', () => {
    render(<PotDetail document={household()} setDocument={() => {}} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}} onSort={() => {}}/>)
    expect(window.document.querySelector('.pot-freshness')).toHaveTextContent('Amex sorted to Fri 13 Nov · 1 to sort')
  })
})

describe('Month → Spending (F1)', () => {
  it('opens a pot page’s transaction in Spending, and the pot’s transactions with See in Spending', () => {
    const onOpenTransactions = vi.fn()
    render(<PotDetail document={household()} setDocument={() => {}} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}} onOpenTransactions={onOpenTransactions}/>)
    const rows = within(screen.getByRole('list', { name: 'Transactions' })).getAllByRole('button')
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['TESCO STORES, £72.76, Fri 13 Nov · Ada ··41001, open in Spending', 'TESCO STORES, £135.81, Fri 6 Nov · Ada ··41001, open in Spending'])
    fireEvent.click(rows[0]!)
    expect(onOpenTransactions).toHaveBeenLastCalledWith({ transactionId: 'tesco-2' })
    fireEvent.click(screen.getByRole('button', { name: 'See in Spending' }))
    expect(onOpenTransactions).toHaveBeenLastCalledWith({ destinationKey: 'pot:groceries' })
    fireEvent.click(screen.getByRole('button', { name: 'More Groceries options' }))
    expect(screen.getByRole('menuitem', { name: 'See in Spending' })).toBeInTheDocument()
  })

  it('leaves a pot page’s transactions as plain rows without the link', () => {
    render(<PotDetail document={household()} setDocument={() => {}} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}}/>)
    expect(within(screen.getByRole('list', { name: 'Transactions' })).queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'See in Spending' })).toBeNull()
  })

  it('opens an account’s one-offs in Spending, on phones and desktop', () => {
    const onOpenTransactions = vi.fn()
    const month = <MonthPage document={household()} setDocument={() => {}} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={() => {}} onOpenTransactions={onOpenTransactions} today={TODAY}/>
    render(month)
    fireEvent.click(screen.getByRole('button', { name: 'See Joint one-offs in Spending' }))
    expect(onOpenTransactions).toHaveBeenLastCalledWith({ destinationKey: 'account:joint' })
    cleanup()
    desktop()
    render(month)
    const row = screen.getByRole('button', { name: 'See Joint one-offs in Spending' }).closest('tr')!
    expect(row).toHaveClass('is-link')
    fireEvent.click(row.querySelector('td')!)
    expect(onOpenTransactions).toHaveBeenCalledTimes(2)
  })
})

describe('Spending › Transactions, arriving from Month (F1)', () => {
  it('arrives filtered to the pot, with a chip to remove', () => {
    window.history.replaceState({ northTransactionFilter: ['pot:groceries'] }, '')
    render(<SpendingHarness/>)
    expect(screen.getAllByRole('button', { name: /^TESCO STORES|^AMAZON|^CORNER SHOP/ }).map(row => row.getAttribute('aria-label')!.split(', ')[0])).toEqual(['TESCO STORES', 'TESCO STORES'])
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Groceries · Joint' }))
    expect(screen.getAllByRole('button', { name: /^TESCO STORES|^AMAZON|^CORNER SHOP/ })).toHaveLength(4)
  })

  it('brings the transaction into view, focused and marked', () => {
    render(<SpendingHarness transactionId="tesco-1"/>)
    const row = screen.getByRole('button', { name: /^TESCO STORES, £135.81/ })
    expect(row).toHaveFocus()
    expect(row.closest('li')).toHaveClass('is-arrived')
    expect(window.document.querySelectorAll('.is-arrived')).toHaveLength(1)
  })

  it('marks the row on desktop too', () => {
    desktop()
    render(<SpendingHarness transactionId="tesco-1"/>)
    const row = window.document.querySelector('tr[data-transaction="tesco-1"]')
    expect(row).toHaveFocus()
    expect(row).toHaveClass('is-arrived')
  })
})

describe('Spending → Month (F1)', () => {
  it('links a pot in the desktop table to its page for the transaction’s month, without opening the sort sheet', () => {
    desktop()
    const onOpenMonth = vi.fn()
    render(<SpendingHarness onOpenMonth={onOpenMonth}/>)
    const links = screen.getAllByRole('button', { name: 'Open Groceries in Month' })
    expect(links.map(link => link.textContent)).toEqual(['Groceries · Joint', 'Groceries · Joint'])
    fireEvent.click(links[0]!)
    expect(onOpenMonth).toHaveBeenCalledWith('groceries', '2026-11')
    expect(screen.queryByRole('dialog')).toBeNull()
    // An account isn't a page on Month: it stays plain text.
    expect(window.document.querySelector('tr[data-transaction="amazon"]')!.querySelectorAll('button')).toHaveLength(0)
  })

  it('offers Open Groceries in Month in the sort sheet once a transaction is placed in a pot', () => {
    const onOpenMonth = vi.fn()
    render(<SpendingHarness onOpenMonth={onOpenMonth}/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES, £72.76/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open Groceries in Month' }))
    expect(onOpenMonth).toHaveBeenCalledWith('groceries', '2026-11')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /close/i }))
    fireEvent.click(screen.getByRole('button', { name: /^CORNER SHOP/ }))
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /in Month$/ })).toBeNull()
  })
})

/** PR 2: Where it went (F4) and the "by today" marker on the pace chart. */
describe('Where it went (F4)', () => {
  const withLidl = () => {
    const document = household()
    document.card!.transactions.push(tx('lidl', '2026-11-07', 'LIDL FOOTS CRAY', 903, { merchant: 'LIDL FOOTS CRAY', sort: to({ kind: 'pot', potId: 'groceries' }, 903) }))
    return document
  }
  const open = (document: BudgetDocument) => render(<PotDetail document={document} setDocument={() => {}} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}}/>)
  const listed = () => within(screen.getByRole('list', { name: 'Transactions' })).getAllByRole('listitem').map(row => row.textContent!.split(/[A-Z][a-z]{2} \d/)[0])

  it('shows the pot’s card spend by brand, adding up to its transactions', () => {
    open(withLidl())
    const bars = within(screen.getByRole('list', { name: 'Where it went' })).getAllByRole('button')
    expect(bars.map(bar => bar.getAttribute('aria-label'))).toEqual(['Tesco, £208.57, 2 transactions', 'Lidl, £9.03'])
    expect(bars[0]).toHaveTextContent('Tesco · 2 transactions£208.57')
    expect(bars.every(bar => bar.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('shows only a brand’s transactions when its bar is tapped, and all again with Show all', () => {
    open(withLidl())
    expect(listed()).toEqual(['TESCO STORES', 'LIDL FOOTS CRAY', 'TESCO STORES'])
    fireEvent.click(screen.getByRole('button', { name: 'Tesco, £208.57, 2 transactions' }))
    expect(screen.getByRole('button', { name: 'Tesco, £208.57, 2 transactions' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 2, name: /^Transactions/ })).toHaveTextContent('Tesco only')
    expect(listed()).toEqual(['TESCO STORES', 'TESCO STORES'])
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(listed()).toHaveLength(3)
    // Tapping the picked bar again also shows them all.
    fireEvent.click(screen.getByRole('button', { name: 'Lidl, £9.03' }))
    expect(listed()).toEqual(['LIDL FOOTS CRAY'])
    fireEvent.click(screen.getByRole('button', { name: 'Lidl, £9.03' }))
    expect(listed()).toHaveLength(3)
  })

  it('has no Where it went for a pot with no card spend', () => {
    const document = household()
    document.card!.transactions = []
    open(document)
    expect(screen.queryByRole('list', { name: 'Where it went' })).toBeNull()
  })

  it('marks what the plan expects by today on the pace chart, this month only', () => {
    // £450 planned, day 14 of 30: £210 by today.
    const { unmount } = open(withLidl())
    expect(screen.getByRole('img', { name: /^Groceries spending so far/ })).toHaveTextContent('£210 by today')
    expect(window.document.querySelector('.pot-chart-expected')).not.toBeNull()
    unmount()
    render(<PotDetail document={withLidl()} setDocument={() => {}} potId="groceries" month="2026-11" today="2026-12-02" onBack={() => {}}/>)
    expect(screen.queryByText(/by today$/)).toBeNull()
  })
})
