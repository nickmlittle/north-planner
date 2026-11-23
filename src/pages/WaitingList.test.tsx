// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker, type CardTransaction, type WaitingMark } from '../domain/cardTracker'
import type { SpendingSection } from '../state/navigation'
import { Spending } from './Spending'
import { waitedFor, waitingReasons } from './spendingFormat'

// Waiting on Spending (audit 6, waiting/3): Set aside on top, then To sort, Waiting and Expecting back (W8); opening a
// waiting row shows its note first, with Change and Back to To sort.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const desktop = () => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))

const ada = (at: string, note?: string): WaitingMark => ({ on: { kind: 'person', personId: 'ada' }, at, ...note ? { note } : {} })
const discuss = (at: string, note?: string): WaitingMark => ({ on: { kind: 'discuss' }, at, ...note ? { note } : {} })
const tx = (id: string, date: string, description: string, amountPence: number, overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id, cardId: 'amex', date, description, merchant: description, amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: '2026-11-09T10:00:00Z', ...overrides,
})
const ben = { cardSuffix: '41009', personId: 'ben' }
const sorted = (potId: string, amountPence: number) => ({ sort: { lines: [{ amountPence, destination: { kind: 'pot' as const, potId } }], by: 'person' as const, at: '2026-11-20T09:00:00Z' } })

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' }]
  document.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' }, cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }] }] }
  document.card.transactions = [
    tx('tesco', '2026-11-22', 'TESCO STORES 3180', 3270, ben),
    tx('zara', '2026-11-19', 'ZARA UK LONDON', 6800, { waiting: ada('2026-11-19T20:00:00Z', 'Keeping both? One may go back') }),
    tx('boots', '2026-11-17', 'BOOTS 1182 SIDCUP', 2345, { waiting: ada('2026-11-17T20:00:00Z', 'Hers or the kids’?') }),
    tx('works', '2026-11-14', 'THE WORKS 0412', 2099, { ...ben, waiting: ada('2026-11-15T09:00:00Z') }),
    tx('lewis', '2026-11-20', 'JOHN LEWIS 0211', 3800, { ...ben, waiting: discuss('2026-11-21T09:00:00Z', 'Joint, or half each?') }),
    tx('grocer', '2026-11-18', 'GREEN GROCER', 4460, sorted('groceries', 4460)),
  ]
  return document
}

function Harness({ initial, onChange = () => {}, today = '2026-11-23' }: { initial: BudgetDocument; onChange?: (document: BudgetDocument) => void; today?: string }) {
  const [document, setDocument] = useState(initial)
  const [view, setView] = useState<SpendingSection>('sort')
  return <Spending document={document} view={view} onSelectView={setView} onOpenCardSettings={() => {}} today={today} setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

const sectionTitles = () => [...window.document.querySelectorAll('.spending-sort h2')].map(heading => heading.textContent)

describe('the To sort tab', () => {
  it('runs Set aside, To sort, Waiting, then Expecting back, on phones and on desktop', () => {
    const document = household()
    document.card!.transactions.push(tx('asos', '2026-11-16', 'ASOS', 3000, { sort: { lines: [{ amountPence: 3000, destination: { kind: 'pot', potId: 'groceries' }, item: 'Coat', expectingBack: true }], by: 'person', at: '2026-11-16T09:00:00Z' } }))
    render(<Harness initial={document}/>)
    expect(sectionTitles()).toEqual(['Set aside in the Amex pot£44.60 · 1 transaction sorted since the start', 'To sort1', 'Waiting4 · £150.44', 'Expecting back£30.00'])
    cleanup()
    desktop()
    render(<Harness initial={document}/>)
    expect(sectionTitles()).toEqual(['Set aside in the Amex pot', 'To sort1', 'Waiting4 · £150.44', 'Expecting back£30.00'])
  })

  it('keeps Set aside on top with nothing to sort, and says the rest are waiting', () => {
    const document = household()
    document.card!.transactions = document.card!.transactions.filter(row => row.id !== 'tesco')
    render(<Harness initial={document}/>)
    expect(sectionTitles()).toEqual(['Set aside in the Amex pot£44.60 · 1 transaction sorted since the start', 'To sort', 'Waiting4 · £150.44'])
    expect(screen.getByText('Nothing left to sort')).toBeInTheDocument()
    expect(screen.getByText('The 4 waiting are below.')).toBeInTheDocument()
    expect(screen.queryByText('Everything is sorted')).not.toBeInTheDocument()
  })

  it('leaves Waiting out of the tab count', () => {
    render(<Harness initial={household()}/>)
    expect(screen.getByRole('tab', { name: /^To sort/ })).toHaveTextContent('To sort1')
    expect(within(screen.getByRole('list', { name: 'To sort' })).getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('the Waiting section', () => {
  it('groups by reason with the cardholder first, each with its count and total; phone rows carry the note', () => {
    render(<Harness initial={household()}/>)
    const groups = within(screen.getByRole('heading', { name: /^Waiting/ }).closest('section')!).getAllByRole('region')
    expect(groups.map(group => group.getAttribute('aria-label'))).toEqual(['Ask Ada', 'To discuss'])
    expect(groups[0]).toHaveTextContent(/^Ask Ada3 · £112.44Go through them/)
    expect(within(groups[0]!).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'ZARA UK LONDONThu 19 Nov · 4 days · “Keeping both? One may go back”£68.00',
      'BOOTS 1182 SIDCUPTue 17 Nov · 6 days · “Hers or the kids’?”£23.45',
      // Ben's card, asking Ada: the cardholder shows.
      'THE WORKS 0412Sat 14 Nov · Ben · 8 days£20.99',
    ])
    expect(within(groups[1]!).getAllByRole('listitem').map(item => item.textContent)).toEqual(['JOHN LEWIS 0211Fri 20 Nov · Ben · 2 days · “Joint, or half each?”£38.00'])
  })

  it('shows a table on desktop: date, merchant with its note, card, amount and days waited', () => {
    desktop()
    render(<Harness initial={household()}/>)
    const section = screen.getByRole('heading', { name: /^Waiting/ }).closest('section')!
    expect(section).toHaveTextContent('Not in any pot until they’re sorted')
    const table = within(section).getByRole('table', { name: 'Waiting, 4 transactions' })
    expect(within(table).getAllByRole('columnheader').slice(0, 6).map(cell => cell.textContent)).toEqual(['Date', 'Merchant', 'Card', 'Amount', 'Waiting', 'Open'])
    expect(within(table).getAllByRole('row').slice(1).map(row => row.textContent)).toEqual([
      'Ask Ada3 · £112.44Go through them',
      'Thu 19 NovZARA UK LONDON“Keeping both? One may go back”Ada ··41001£68.004 days',
      'Tue 17 NovBOOTS 1182 SIDCUP“Hers or the kids’?”Ada ··41001£23.456 days',
      'Sat 14 NovTHE WORKS 0412Ben ··41009£20.998 days',
      'To discuss1 · £38.00Go through them',
      'Fri 20 NovJOHN LEWIS 0211“Joint, or half each?”Ben ··41009£38.002 days',
    ])
    fireEvent.click(within(table).getByRole('button', { name: 'Open BOOTS 1182 SIDCUP' }))
    expect(screen.getByRole('dialog', { name: 'Sort BOOTS 1182 SIDCUP' })).toBeInTheDocument()
  })

})

describe('Go through them (waiting/5)', () => {
  const sheet = () => screen.getByRole('dialog', { name: 'Go through with Ada' })
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Go through them: Ask Ada' }))
  const row = (document: BudgetDocument | undefined, id: string) => document!.card!.transactions.find(item => item.id === id)!

  it('opens on the group’s first row: progress, the note first, Place focused and the next row under it', () => {
    desktop()
    render(<Harness initial={household()}/>)
    open()
    expect(sheet()).toHaveAccessibleDescription('1 of 3 · £112.44')
    expect(sheet().querySelectorAll('.sort-go-progress .is-on')).toHaveLength(1)
    expect(within(sheet()).getByRole('region', { name: 'Waiting' })).toHaveTextContent('Waiting · Ask AdaFor 4 days“Keeping both? One may go back”ChangeBack to To sort')
    expect(within(sheet()).getByText('ZARA UK LONDON')).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: /^Place in / })).toHaveFocus()
    expect(within(sheet()).getByText('Next: BOOTS 1182 SIDCUP · £23.45 · “Hers or the kids’?”')).toBeInTheDocument()
  })

  it('walks the group: Place, Skip and Back to To sort each move on, then it ends with what happened', () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    open()
    fireEvent.click(within(sheet()).getByRole('button', { name: /^Place in / }))
    expect(row(saved, 'zara').sort).toBeDefined()
    expect(sheet()).toHaveAccessibleDescription('2 of 3 · £112.44')
    expect(within(sheet()).getByText('BOOTS 1182 SIDCUP')).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: /^Place in / })).toHaveFocus()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Skip, still waiting' }))
    expect(row(saved, 'boots').waiting).toBeDefined()
    expect(sheet()).toHaveAccessibleDescription('3 of 3 · £112.44')
    expect(within(sheet()).queryByText(/^Next:/)).not.toBeInTheDocument()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Back to To sort' }))
    expect(row(saved, 'works').waiting).toBeUndefined()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Gone through 3 with Ada: 1 sorted, 1 back in To sort, 1 still waiting.')
  })

  it('a new reason or note moves on and counts as still waiting', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    open()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Change' }))
    fireEvent.click(within(within(sheet()).getByRole('group', { name: 'Waiting on' })).getByRole('button', { name: 'To discuss' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Mark waiting · To discuss' }))
    expect(row(saved, 'zara').waiting?.on).toEqual({ kind: 'discuss' })
    expect(sheet()).toHaveAccessibleDescription('2 of 3')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('status')).toHaveTextContent('Gone through 1 of 3 with Ada: 1 still waiting.')
  })

  it('on phones: Skip, and no note in the next line', () => {
    render(<Harness initial={household()}/>)
    open()
    expect(sheet()).toHaveAccessibleDescription('1 of 3')
    expect(within(sheet()).getByRole('button', { name: 'Skip, still waiting' })).toHaveTextContent(/^Skip$/)
    expect(within(sheet()).getByText('Next: BOOTS 1182 SIDCUP · £23.45')).toBeInTheDocument()
  })

  it('a row sorted elsewhere drops out; closing part way says how far it got', () => {
    const document = household()
    document.card!.transactions = document.card!.transactions.map(item => item.id === 'boots' ? { ...item, waiting: undefined, sort: { lines: [{ amountPence: 2345, destination: { kind: 'pot' as const, potId: 'groceries' } }], by: 'person' as const, at: '2026-11-20T09:00:00Z' } } : item)
    render(<Harness initial={document}/>)
    open()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Skip, still waiting' }))
    expect(sheet()).toHaveAccessibleDescription('2 of 2')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('status')).toHaveTextContent('Gone through 1 of 2 with Ada: 1 still waiting.')
  })

  it('Split hands over to the split editor: saving goes on to the next row, Cancel comes back to the same one', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    open()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Split across pots' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Split ZARA UK LONDON' })).getByRole('button', { name: 'Cancel' }))
    expect(sheet()).toHaveAccessibleDescription('1 of 3')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Split across pots' }))
    const split = screen.getByRole('dialog', { name: 'Split ZARA UK LONDON' })
    fireEvent.click(within(split).getByRole('button', { name: 'Half each' }))
    fireEvent.click(within(split).getByRole('button', { name: 'Save split' }))
    expect(row(saved, 'zara').sort?.lines).toHaveLength(2)
    expect(row(saved, 'zara').waiting).toBeUndefined()
    expect(sheet()).toHaveAccessibleDescription('2 of 3')
  })

  it('To discuss has its own title and end message', () => {
    render(<Harness initial={household()}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Go through them: To discuss' }))
    const discuss = screen.getByRole('dialog', { name: 'Go through what’s to discuss' })
    expect(discuss).toHaveAccessibleDescription('1 of 1')
    fireEvent.click(within(discuss).getByRole('button', { name: 'Skip, still waiting' }))
    expect(screen.getByRole('status')).toHaveTextContent('Gone through 1 to discuss: 1 still waiting.')
  })
})

describe('opening a waiting row', () => {
  it('shows the note first, and Back to To sort clears the mark', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    fireEvent.click(screen.getByRole('button', { name: /^ZARA UK LONDON/ }))
    const dialog = screen.getByRole('dialog', { name: 'Sort ZARA UK LONDON' })
    const block = within(dialog).getByRole('region', { name: 'Waiting' })
    expect(block).toHaveTextContent('Waiting · Ask AdaFor 4 days“Keeping both? One may go back”ChangeBack to To sort')
    // The note comes before the pots.
    expect(block.compareDocumentPosition(within(dialog).getByRole('list', { name: 'Suggested pots and accounts' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Change' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to To sort' }))
    expect(saved!.card!.transactions.find(row => row.id === 'zara')!.waiting).toBeUndefined()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('ZARA UK LONDON is back in To sort.')
    expect(screen.getByRole('tab', { name: /^To sort/ })).toHaveTextContent('To sort2')
  })

  it('Change edits the reason and note, keeping when it was marked', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    fireEvent.click(screen.getByRole('button', { name: /^BOOTS 1182 SIDCUP/ }))
    const dialog = screen.getByRole('dialog', { name: 'Sort BOOTS 1182 SIDCUP' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }))
    const reasons = within(dialog).getByRole('group', { name: 'Waiting on' })
    expect(within(reasons).getAllByRole('button').map(button => `${button.textContent}${button.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`)).toEqual(['Ask Ada ✓', 'Ask Ben', 'To discuss'])
    // Nothing changed yet.
    expect(within(dialog).getByRole('button', { name: 'Already waiting · Ask Ada' })).toBeDisabled()
    fireEvent.click(within(reasons).getByRole('button', { name: 'To discuss' }))
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: '  Kids’ or   ours? ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark waiting · To discuss' }))
    expect(saved!.card!.transactions.find(row => row.id === 'boots')!.waiting).toEqual({ on: { kind: 'discuss' }, note: 'Kids’ or ours?', at: '2026-11-17T20:00:00Z' })
    expect(decodeBudgetDocument(saved)).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('BOOTS 1182 SIDCUP is waiting: To discuss.')
  })

  it('choosing a pot while changing goes back to Place, and placing it clears the mark', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    fireEvent.click(screen.getByRole('button', { name: /^ZARA UK LONDON/ }))
    const dialog = screen.getByRole('dialog', { name: 'Sort ZARA UK LONDON' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).queryByRole('group', { name: 'Waiting on' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }))
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Suggested pots and accounts' })).getAllByRole('button')[0]!)
    expect(within(dialog).queryByRole('group', { name: 'Waiting on' })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Place in / }))
    const zara = saved!.card!.transactions.find(row => row.id === 'zara')!
    expect(zara.sort).toBeDefined()
    expect(zara.waiting).toBeUndefined()
  })
})

describe('Waiting labels', () => {
  it('counts days waited from when it was marked', () => {
    expect(waitedFor('2026-11-23T08:00:00Z', '2026-11-23')).toBe('today')
    expect(waitedFor('2026-11-22T08:00:00Z', '2026-11-23')).toBe('1 day')
    expect(waitedFor('2026-11-15T08:00:00Z', '2026-11-23')).toBe('8 days')
  })

  it('lists the cardholder first, then the other adults, then To discuss', () => {
    const document = household()
    expect(waitingReasons(document, { personId: 'ben' })).toEqual([{ kind: 'person', personId: 'ben' }, { kind: 'person', personId: 'ada' }, { kind: 'discuss' }])
  })
})

describe('marking a row waiting on desktop (waiting/4)', () => {
  // Two rows to sort: Ben's TESCO and Ada's CAFE NERO, plus a payment, which never shows in To sort.
  const toMark = () => {
    const document = household()
    document.card!.transactions.push(tx('nero', '2026-11-21', 'CAFE NERO 0291', 1710), tx('paid', '2026-11-20', 'PAYMENT RECEIVED - THANK YOU', -50000, { kind: 'payment' }))
    return document
  }
  const table = () => screen.getByRole('table', { name: 'To sort' })
  const rows = () => within(table()).getAllByRole('row').slice(1)
  const pressed = (menu: HTMLElement) => within(within(menu).getByRole('group', { name: 'Waiting on' })).getAllByRole('button').map(button => `${button.textContent}${button.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`)

  it('W opens the menu with the cardholder chosen; 1–3 choose, Enter marks, and focus moves to the next row', async () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={toMark()} onChange={next => { saved = next }}/>)
    expect(table()).toHaveAccessibleDescription('J K move · ↵ place · / choose a pot · A always · S split · W waiting')
    // Split and the clock share a column: still seven.
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(7)
    expect(within(table()).getAllByRole('button', { name: /^Not ready to sort / })).toHaveLength(2)
    expect(rows().map(row => row.getAttribute('aria-label'))).toEqual(['TESCO STORES 3180, £32.70, Sun 22 Nov', 'CAFE NERO 0291, £17.10, Sat 21 Nov'])
    rows()[0]!.focus()
    fireEvent.keyDown(rows()[0]!, { key: 'w' })
    const menu = screen.getByRole('dialog', { name: 'Not ready to sort?' })
    expect(menu).toHaveAccessibleDescription('TESCO STORES 3180 · £32.70 · leaves To sort, counts in no pot')
    // TESCO is on Ben's card, so Ask Ben comes first.
    expect(pressed(menu)).toEqual(['1Ask BenBen’s card ✓', '2Ask Ada', '3To discussBoth of you'])
    expect(within(menu).getByRole('button', { name: /Ask Ben/ })).toHaveFocus()
    expect(within(rows()[0]!).getByRole('button', { name: 'Not ready to sort TESCO STORES 3180' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(within(menu).getByRole('button', { name: /Ask Ben/ }), { key: '3' })
    expect(pressed(menu)[2]).toBe('3To discussBoth of you ✓')
    expect(within(menu).getByRole('button', { name: /To discuss/ })).toHaveFocus()
    fireEvent.change(within(menu).getByLabelText('Note (optional)'), { target: { value: 'Weekly shop, or ours?' } })
    // Digits typed in the note are the note's.
    fireEvent.keyDown(within(menu).getByLabelText('Note (optional)'), { key: '1' })
    expect(pressed(menu)[2]).toBe('3To discussBoth of you ✓')
    fireEvent.keyDown(within(menu).getByLabelText('Note (optional)'), { key: 'Enter' })
    expect(saved!.card!.transactions.find(row => row.id === 'tesco')!.waiting).toMatchObject({ on: { kind: 'discuss' }, note: 'Weekly shop, or ours?' })
    expect(decodeBudgetDocument(saved)).not.toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('TESCO STORES 3180 is waiting: To discuss. Undo')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveFocus()
    expect(screen.getByRole('tab', { name: /^To sort/ })).toHaveTextContent('To sort1')
  })

  it('W then Enter marks it for the cardholder, and Undo puts it back in To sort', () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={toMark()} onChange={next => { saved = next }}/>)
    rows()[1]!.focus()
    fireEvent.keyDown(rows()[1]!, { key: 'W' })
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('button', { name: /Ask Ada/ }), { key: 'Enter' })
    expect(saved!.card!.transactions.find(row => row.id === 'nero')!.waiting).toEqual({ on: { kind: 'person', personId: 'ada' }, at: expect.any(String) })
    expect(screen.getByRole('status')).toHaveTextContent('CAFE NERO 0291 is waiting: Ask Ada.')
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    expect(saved!.card!.transactions.find(row => row.id === 'nero')!.waiting).toBeUndefined()
    expect(screen.getByRole('status')).toHaveTextContent('CAFE NERO 0291 is back in To sort.')
    expect(rows()).toHaveLength(2)
  })

  it('2 then Enter marks the second reason', () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={toMark()} onChange={next => { saved = next }}/>)
    rows()[0]!.focus()
    fireEvent.keyDown(rows()[0]!, { key: 'w' })
    fireEvent.keyDown(document.activeElement!, { key: '2' })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(saved!.card!.transactions.find(row => row.id === 'tesco')!.waiting?.on).toEqual({ kind: 'person', personId: 'ada' })
  })

  it('Enter on another reason marks that one; Esc and Cancel change nothing and return to the row', () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={toMark()} onChange={next => { saved = next }}/>)
    rows()[1]!.focus()
    fireEvent.keyDown(rows()[1]!, { key: 'w' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rows()[1]).toHaveFocus()
    fireEvent.click(within(rows()[1]!).getByRole('button', { name: 'Not ready to sort CAFE NERO 0291' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(rows()[1]).toHaveFocus()
    expect(saved).toBeUndefined()
    fireEvent.click(within(rows()[1]!).getByRole('button', { name: 'Not ready to sort CAFE NERO 0291' }))
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('button', { name: /Ask Ben/ }), { key: 'Enter' })
    expect(saved!.card!.transactions.find(row => row.id === 'nero')!.waiting?.on).toEqual({ kind: 'person', personId: 'ben' })
  })

  it('the clock opens the menu, and Mark waiting marks with the note', () => {
    desktop()
    let saved: BudgetDocument | undefined
    render(<Harness initial={toMark()} onChange={next => { saved = next }}/>)
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: 'Not ready to sort TESCO STORES 3180' }))
    const menu = screen.getByRole('dialog', { name: 'Not ready to sort?' })
    fireEvent.click(within(menu).getByRole('button', { name: /Ask Ada/ }))
    fireEvent.change(within(menu).getByLabelText('Note (optional)'), { target: { value: '  Hers   or ours? ' } })
    fireEvent.click(within(menu).getByRole('button', { name: 'Mark waiting' }))
    expect(saved!.card!.transactions.find(row => row.id === 'tesco')!.waiting).toMatchObject({ on: { kind: 'person', personId: 'ada' }, note: 'Hers or ours?' })
  })
})

describe('Not ready to sort? in the sort sheet (waiting/4)', () => {
  it('choosing a reason shows the note and swaps the footer to Mark waiting; Enter in the note marks it, with Undo', () => {
    let saved: BudgetDocument | undefined
    render(<Harness initial={household()} onChange={next => { saved = next }}/>)
    fireEvent.click(screen.getByRole('button', { name: /^TESCO STORES 3180/ }))
    const dialog = screen.getByRole('dialog', { name: 'Sort TESCO STORES 3180' })
    const section = within(dialog).getByRole('region', { name: 'Not ready to sort?' })
    expect(section).toHaveTextContent('It leaves To sort and counts in no pot until it’s sorted.')
    expect(within(section).getAllByRole('button').map(button => button.textContent)).toEqual(['Ask Ben', 'Ask Ada', 'To discuss'])
    // Nothing chosen yet: no note box, and the footer still places.
    expect(within(dialog).queryByLabelText('Note (optional)')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^Place in / })).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Ask Ben' }))
    expect(within(dialog).queryByRole('button', { name: /^Place in / })).not.toBeInTheDocument()
    // Tapping it again unchooses it.
    fireEvent.click(within(section).getByRole('button', { name: 'Ask Ben' }))
    expect(within(dialog).getByRole('button', { name: /^Place in / })).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Ask Ada' }))
    expect(within(dialog).getByRole('button', { name: 'Mark waiting · Ask Ada' })).toBeEnabled()
    // Choosing a pot goes back to Place.
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Suggested pots and accounts' })).getAllByRole('button')[0]!)
    expect(within(dialog).getByRole('button', { name: /^Place in / })).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Ask Ada' }))
    const note = within(dialog).getByLabelText('Note (optional)')
    fireEvent.change(note, { target: { value: 'Ben’s lunch?' } })
    fireEvent.keyDown(note, { key: 'Enter' })
    expect(saved!.card!.transactions.find(row => row.id === 'tesco')!.waiting).toMatchObject({ on: { kind: 'person', personId: 'ada' }, note: 'Ben’s lunch?' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('TESCO STORES 3180 is waiting: Ask Ada. Undo')
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    expect(saved!.card!.transactions.find(row => row.id === 'tesco')!.waiting).toBeUndefined()
    expect(screen.getByRole('tab', { name: /^To sort/ })).toHaveTextContent('To sort1')
  })

  it('is only on rows in To sort: not on a sorted row (WP4) or one already waiting', () => {
    const document = household()
    render(<Harness initial={document}/>)
    fireEvent.click(screen.getByRole('button', { name: /^ZARA UK LONDON/ }))
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Not ready to sort?' })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Close/ }))
    fireEvent.click(screen.getByRole('tab', { name: 'Transactions' }))
    fireEvent.click(screen.getByRole('button', { name: /^GREEN GROCER/ }))
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Not ready to sort?' })).not.toBeInTheDocument()
  })
})
