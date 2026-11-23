// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction } from '../domain/cardTracker'
import { monthSpending, needsALook } from '../domain/cardSpending'
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

function SpendingHarness({ initial = household(), view = 'transactions', onOpenMonth = () => {}, transactionId = null }: { initial?: BudgetDocument; view?: SpendingSection; onOpenMonth?: (potId: string | null, month: string) => void; transactionId?: string | null }) {
  const [document, setDocument] = useState(initial)
  const [section, setSection] = useState<SpendingSection>(view)
  return <Spending document={document} setDocument={setDocument} view={section} onSelectView={setSection} onOpenCardSettings={() => {}} onOpenMonth={onOpenMonth} transactionId={transactionId} today={TODAY}/>
}

describe('the freshness line (F2)', () => {
  it('says how far the card is sorted and what is waiting, leaving payments out', () => {
    expect(freshness(household())).toEqual({ lead: 'Amex sorted to Fri 13 Nov', toSort: 1, waiting: 0, broughtIn: true })
    const sorted = household()
    sorted.card!.transactions = sorted.card!.transactions.filter(row => row.id !== 'waiting')
    expect(freshness(sorted)).toEqual({ lead: 'Amex sorted to Fri 13 Nov', toSort: 0, waiting: 0, broughtIn: true })
    const parked = household()
    parked.card!.transactions = parked.card!.transactions.map(row => row.id === 'waiting' ? { ...row, waiting: { on: { kind: 'discuss' }, at: 'x' } } : row)
    expect(freshness(parked)).toEqual({ lead: 'Amex sorted to Fri 13 Nov', toSort: 0, waiting: 1, broughtIn: true })
    const empty = household()
    empty.card!.transactions = []
    expect(freshness(empty)).toEqual({ lead: 'Amex not brought in yet', toSort: 0, waiting: 0, broughtIn: false })
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
    // Waiting rows join it (W12), and keep it from reading all sorted.
    const parked = household()
    parked.card!.transactions.push(tx('lewis', '2026-11-10', 'JOHN LEWIS', 3800, { waiting: { on: { kind: 'discuss' }, at: '2026-11-12T09:00:00Z' } }))
    rerender(<FreshnessLine document={parked} onSort={onSort}/>)
    expect(container).toHaveTextContent('Amex sorted to Fri 13 Nov · 1 to sort · 1 waiting')
    fireEvent.click(screen.getByRole('button', { name: '1 to sort · 1 waiting' }))
    parked.card!.transactions = parked.card!.transactions.filter(row => row.id !== 'waiting')
    rerender(<FreshnessLine document={parked} onSort={onSort}/>)
    expect(container).toHaveTextContent('Amex sorted to Fri 13 Nov · 1 waiting')
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

/** PR 3: Needs a look (F3) on Month, Home and Spending's header, with one pace wording. */
describe('Needs a look (F3)', () => {
  /** Groceries ahead and mostly Tesco; Holidays ahead with no brand at half; two Treats pots over. */
  function lookHousehold(): BudgetDocument {
    const document = household()
    document.budget.accounts.push({ id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] }, { id: 'ben-own', name: 'Ben', provider: 'Starling', ownerPersonIds: ['ben'] })
    document.budget.pots.push({ id: 'holidays', name: 'Holidays', accountId: 'joint' }, { id: 'treats-ada', name: 'Treats', accountId: 'ada-own' }, { id: 'treats-ben', name: 'Treats', accountId: 'ben-own' })
    const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: { kind: 'pot' as const, potId }, funding: 'equal' as const })
    document.budget.snapshots['2026-11']!.items.push(item('h', 'holidays', 60000), item('ta', 'treats-ada', 10000), item('tb', 'treats-ben', 10000))
    // A pot in one person's account would default to Funded only; these two are Tracked.
    document.card!.pots = { ...document.card!.pots, 'treats-ada': { kind: 'tracked' }, 'treats-ben': { kind: 'tracked' } }
    const pot = (potId: string, pence: number) => to({ kind: 'pot', potId }, pence)
    document.card!.transactions.push(
      tx('tesco-3', '2026-11-10', 'TESCO STORE 3180 SIDCUP', 9481, { merchant: 'TESCO STORE SIDCUP', sort: pot('groceries', 9481) }),
      tx('lidl', '2026-11-07', 'LIDL FOOTS CRAY', 903, { sort: pot('groceries', 903) }),
      tx('airbnb', '2026-11-02', 'AIRBNB', 18000, { sort: pot('holidays', 18000) }),
      tx('train', '2026-11-03', 'TRAINLINE', 12000, { sort: pot('holidays', 12000) }),
      tx('hotel', '2026-11-04', 'HOTEL CHOCOLAT', 10000, { sort: pot('holidays', 10000) }),
      tx('book-a', '2026-11-05', 'BOOK NOOK', 15000, { sort: pot('treats-ada', 15000) }),
      tx('book-b', '2026-11-05', 'GAME SHOP', 15000, { personId: 'ben', sort: pot('treats-ben', 15000) }),
    )
    return document
  }
  const month = (props: { onOpenPot?: (potId: string | null) => void } = {}) => <MonthPage document={lookHousehold()} setDocument={() => {}} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={props.onOpenPot ?? (() => {})} onSort={() => {}} today={TODAY}/>

  it('puts over first, then the bigger gap, each with its reason: mostly one brand, else the biggest transaction', () => {
    const document = lookHousehold()
    const rows = needsALook(document, monthSpending(document, '2026-11', TODAY))
    expect(rows.map(({ row, reason }) => [row.key, row.status, reason])).toEqual([
      ['pot:treats-ada', 'over', { kind: 'mostly', name: 'Book Nook', pence: 15000 }],
      ['pot:treats-ben', 'over', { kind: 'mostly', name: 'Game Shop', pence: 15000 }],
      ['pot:holidays', 'ahead', { kind: 'biggest', name: 'AIRBNB', pence: 18000 }],
      ['pot:groceries', 'ahead', { kind: 'mostly', name: 'Tesco', pence: 30338 }],
    ])
  })

  it('leads phone Month with Needs a look, and those pots leave their groups', () => {
    const onOpenPot = vi.fn()
    render(month({ onOpenPot }))
    const cards = within(screen.getByRole('region', { name: 'Needs a look' })).getAllByRole('button')
    expect(cards.map(card => card.getAttribute('aria-label'))).toEqual([
      'Treats · Ada: £50.00 over. Mostly Book Nook £150.00. Covered when November closes',
      'Treats · Ben: £50.00 over. Mostly Game Shop £150.00. Covered when November closes',
      'Holidays · Joint: £120 ahead. Biggest: AIRBNB £180.00. Runs out ~Sat 21 Nov',
      'Groceries · Joint: £102 ahead. Mostly Tesco £303.38. Runs out ~Sat 21 Nov',
    ])
    expect(screen.getByRole('heading', { level: 3, name: 'Needs a look 4' })).toBeInTheDocument()
    expect([...window.document.querySelectorAll('.pots-card-title')].map(heading => heading.textContent)).toEqual(['Accounts'])
    fireEvent.click(cards[3]!)
    expect(onOpenPot).toHaveBeenCalledWith('groceries')
  })

  it('puts a strip of cards above the desktop table, which keeps every pot', () => {
    desktop()
    render(month())
    const strip = screen.getByRole('region', { name: 'Needs a look' })
    expect(within(strip).getAllByRole('button')).toHaveLength(4)
    expect(within(strip).getByRole('button', { name: /^Groceries · Joint/ })).toHaveTextContent('Groceries · Joint£102 aheadMostly Tesco £303.38Runs out ~Sat 21 Nov')
    const table = screen.getByRole('table')
    expect(within(table).getByRole('button', { name: /^Groceries:/ }).closest('tr')).toHaveTextContent('£102 ahead · runs out ~Sat 21 Nov')
    expect(within(table).getAllByRole('button', { name: /^Treats · (Ada|Ben):/ })).toHaveLength(2)
  })

  it('has no Needs a look when every pot is on track', () => {
    render(<MonthPage document={household()} setDocument={() => {}} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={() => {}} today={TODAY}/>)
    expect(screen.queryByRole('region', { name: 'Needs a look' })).toBeNull()
  })

  it('shows November so far in Spending’s header, opening the pot, or Month for pots that share a name', () => {
    const onOpenMonth = vi.fn()
    render(<SpendingHarness initial={lookHousehold()} view="sort" onOpenMonth={onOpenMonth}/>)
    const chips = within(screen.getByRole('list', { name: 'November so far' })).getAllByRole('button')
    expect(chips.map(chip => chip.textContent)).toEqual(['Treats · 2 over', 'Holidays £120 ahead', 'Groceries £102 ahead'])
    expect(chips[0]).toHaveClass('is-critical')
    fireEvent.click(chips[2]!)
    expect(onOpenMonth).toHaveBeenLastCalledWith('groceries', '2026-11')
    fireEvent.click(chips[0]!)
    expect(onOpenMonth).toHaveBeenLastCalledWith(null, '2026-11')
  })

  it('has no so-far chips when nothing needs a look', () => {
    render(<SpendingHarness view="sort"/>)
    expect(screen.queryByRole('list', { name: 'November so far' })).toBeNull()
  })
})

/** PR 4: pace in the pot picker, the impact line and the toast (F5). */
describe('Pace where you sort (F5)', () => {
  // Groceries is on track on the 14th (£208.57 of £450.00, £210.00 expected). This £60.00 shop tips it £59 ahead.
  const tipping = () => {
    const document = household()
    document.card!.transactions.push(tx('big', '2026-11-14', 'TESCO STORES', 6000))
    return document
  }

  it('shows Left and pace on each pot, and what placing the suggestion would change, on phones', () => {
    render(<SpendingHarness initial={tipping()} view="sort"/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES, £60\.00/ }))
    const dialog = screen.getByRole('dialog')
    const suggested = within(within(dialog).getByRole('list', { name: 'Suggested pots and accounts' })).getAllByRole('button')
    expect(suggested[0]).toHaveTextContent(/^Groceries · JointSuggested.*£241\.43 left$/)
    expect(within(dialog).getByText('Groceries: On track → £59 ahead · runs out ~Tue 24 Nov')).toHaveClass('sort-impact', 'is-warning')
  })

  it('says when a placing tips a pot, with Open and Undo', () => {
    const onOpenMonth = vi.fn()
    render(<SpendingHarness initial={tipping()} view="sort" onOpenMonth={onOpenMonth}/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES, £60\.00/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Place in Groceries · Joint' }))
    expect(screen.getByText('Groceries is now £59 ahead of pace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Groceries' }))
    expect(onOpenMonth).toHaveBeenCalledWith('groceries', '2026-11')
    expect(screen.queryByText(/ahead of pace/)).toBeNull()
  })

  it('puts a tipping placing back in To sort with Undo', () => {
    render(<SpendingHarness initial={tipping()} view="sort"/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES, £60\.00/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Place in Groceries · Joint' }))
    expect(screen.queryByRole('button', { name: /^TESCO STORES, £60\.00/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: /^TESCO STORES, £60\.00/ })).toBeInTheDocument()
    expect(screen.getByText('TESCO STORES is back in To sort.')).toBeInTheDocument()
  })

  it('puts a waiting row placed from its sheet back in Waiting with Undo (audit 6, waiting/3)', () => {
    const document = tipping()
    const mark = { on: { kind: 'discuss' as const }, note: 'Ours?', at: '2026-11-14T09:00:00Z' }
    document.card!.transactions.find(row => row.id === 'big')!.waiting = mark
    render(<SpendingHarness initial={document} view="sort"/>)
    fireEvent.click(within(screen.getByRole('region', { name: 'To discuss' })).getByRole('button', { name: /^TESCO STORES, £60\.00/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Place in Groceries · Joint' }))
    expect(screen.queryByRole('region', { name: 'To discuss' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(within(screen.getByRole('region', { name: 'To discuss' })).getByRole('button', { name: /^TESCO STORES, £60\.00.*“Ours\?”/ })).toBeInTheDocument()
    expect(screen.getByText('TESCO STORES is back in Waiting.')).toBeInTheDocument()
  })

  it('has no toast when the pot stays on track', () => {
    render(<SpendingHarness view="sort"/>)
    fireEvent.click(screen.getByRole('button', { name: /^CORNER SHOP/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Groceries · Joint/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Place in Groceries · Joint' }))
    expect(screen.queryByText(/of pace/)).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('puts Left and pace in the desktop select, and the impact under the focused row', () => {
    desktop()
    render(<SpendingHarness initial={tipping()} view="sort"/>)
    const select = screen.getByLabelText('Pot for TESCO STORES')
    expect(within(select).getByRole('option', { name: 'Groceries · Joint · £241.43 left' })).toBeInTheDocument()
    expect(screen.queryByText(/→/)).toBeNull()
    const row = window.document.querySelector<HTMLElement>('tr[data-transaction="big"]')!
    act(() => row.focus())
    const impact = screen.getByText('Groceries: On track → £59 ahead · runs out ~Tue 24 Nov')
    expect(select).toHaveAttribute('aria-describedby', impact.id)
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(screen.getByText('Groceries is now £59 ahead of pace')).toBeInTheDocument()
  })
})

/** PR 5: Sorts itself here (F6), the pot page's rules and suggestions. */
describe('Sorts itself here (F6)', () => {
  function PotHarness({ initial, onOpenRules }: { initial: BudgetDocument; onOpenRules?: () => void }) {
    const [document, setDocument] = useState(initial)
    return <PotDetail document={document} setDocument={setDocument} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}} {...onOpenRules ? { onOpenRules } : {}}/>
  }

  it('suggests a rule for a merchant sorted here by hand twice, and makes it', () => {
    const document = household()
    // Waiting in To sort: the new rule sorts it too.
    document.card!.transactions.push(tx('express', '2026-11-14', 'TESCO EXPRESS', 450))
    render(<PotHarness initial={document}/>)
    const section = screen.getByRole('list', { name: 'Sorts itself here' })
    expect(within(section).getByText('TESCO STORES')).toBeInTheDocument()
    expect(within(section).getByText('Sorted here 2 times · a rule for “TESCO”')).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Make rule: “TESCO” to Groceries' }))
    expect(screen.getByText('Rule added. It also sorted 1 more.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Sorts itself here' })).getByText('TESCO')).toBeInTheDocument()
    expect(screen.getByText('Your rule')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Make rule/ })).toBeNull()
    // The waiting Tesco now counts on the pot.
    expect(within(screen.getByRole('list', { name: 'Transactions' })).getByText('TESCO EXPRESS')).toBeInTheDocument()
  })

  it('lists the pot’s rules, opening Sorting rules, with a card-only rule saying whose card', () => {
    const onOpenRules = vi.fn()
    const document = household()
    document.card!.rules = [
      { id: 'tesco', contains: 'TESCO', destination: { kind: 'pot', potId: 'groceries' }, createdAt: 'x' },
      { id: 'lidl', contains: 'LIDL', cardSuffix: '41001', destination: { kind: 'pot', potId: 'groceries' }, createdAt: 'x' },
      { id: 'amazon', contains: 'AMAZON', destination: { kind: 'account', accountId: 'joint' }, createdAt: 'x' },
    ]
    render(<PotHarness initial={document} onOpenRules={onOpenRules}/>)
    const rows = within(screen.getByRole('list', { name: 'Sorts itself here' })).getAllByRole('button')
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['LIDL, your rule, open Sorting rules', 'TESCO, your rule, open Sorting rules'])
    expect(screen.getByText('Your rule · only on Ada’s card')).toBeInTheDocument()
    fireEvent.click(rows[1]!)
    fireEvent.click(screen.getByRole('button', { name: 'Sorting rules' }))
    expect(onOpenRules).toHaveBeenCalledTimes(2)
  })

  it('has no section with no rules and nothing sorted here twice', () => {
    const document = household()
    document.card!.transactions = document.card!.transactions.filter(row => row.id !== 'tesco-2')
    render(<PotHarness initial={document}/>)
    expect(screen.queryByRole('list', { name: 'Sorts itself here' })).toBeNull()
  })
})

/** Follow-up: choose, then Place, in the sort sheet (board M2). */
describe('Choose, then Place', () => {
  it('starts on the suggestion, and the impact line and Place follow the pot you choose', () => {
    const document = household()
    document.budget.pots.push({ id: 'treats', name: 'Treats', accountId: 'joint' })
    document.card!.transactions.push(tx('big', '2026-11-14', 'TESCO STORES', 6000))
    render(<SpendingHarness initial={document} view="sort"/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES, £60\.00/ }))
    const dialog = screen.getByRole('dialog')
    const place = () => within(dialog).getAllByRole('button').find(button => button.classList.contains('sort-place'))!
    expect(place()).toHaveTextContent('Place in Groceries · Joint')
    expect(place()).toHaveAccessibleDescription('Groceries: On track → £59 ahead · runs out ~Tue 24 Nov')
    fireEvent.click(within(dialog).getAllByRole('button', { name: /^Treats · Joint/ })[0]!)
    expect(place()).toHaveTextContent('Place in Treats · Joint')
    expect(within(dialog).getByText('Treats has nothing planned in November')).toBeInTheDocument()
    expect(within(dialog).queryByText(/^Groceries:/)).toBeNull()
  })

  it('says it’s already there, with Place off, until something would change', () => {
    render(<SpendingHarness/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES, £72\.76/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Already in Groceries · Joint' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Joint/ }))
    expect(within(dialog).getByRole('button', { name: 'Place in Joint' })).toBeEnabled()
  })
})
