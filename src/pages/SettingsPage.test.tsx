// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { emptyCardTracker } from '../domain/cardTracker'
import type { SettingsSection } from '../state/navigation'
import { SettingsPage } from './SettingsPage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** Desktop: jsdom has no matchMedia, so stub one that says "not a phone". */
const desktop = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }] }],
    transactions: [{ id: 'grocer', cardId: 'amex', date: '2026-11-07', description: 'GREEN GROCER LONDON', merchant: 'GREEN GROCER', amountPence: 4460, kind: 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: '2026-11-09T10:00:00Z', sort: { lines: [{ amountPence: 4460, destination: { kind: 'pot', potId: 'groceries' } }], by: 'rule', ruleId: 'r-grocer', at: 'x' } }],
    rules: [
      { id: 'r-grocer', contains: 'GREEN GROCER', destination: { kind: 'pot', potId: 'groceries' }, createdAt: 'x' },
      { id: 'r-cafe', contains: 'CORNER CAFE', cardSuffix: '41009', destination: { kind: 'pot', potId: 'eating' }, createdAt: 'x' },
    ],
  }
  return document
}

function Harness({ initial, start = null, onChange = () => {}, onSignOut }: { initial: BudgetDocument; start?: SettingsSection | null; onChange?: (document: BudgetDocument) => void; onSignOut?: () => void }) {
  const [document, setDocument] = useState(initial)
  const [section, setSection] = useState<SettingsSection | null>(start)
  return <SettingsPage document={document} month="2026-11" section={section} onSelectSection={setSection} setupComplete status="Saved" warning="" onSignOut={onSignOut} email={onSignOut ? 'ada@example.com' : undefined}
    setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

it('shows a section nav with counts on desktop, one section at a time, Household first', () => {
  desktop()
  const onSelect = vi.fn()
  render(<SettingsPage document={household()} setDocument={() => {}} month="2026-11" section={null} onSelectSection={onSelect} setupComplete status="Saved" warning=""/>)
  const nav = screen.getByRole('navigation', { name: 'Settings sections' })
  expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Household', 'Pay & income', 'Accounts & pots1 · 2', 'Categories', 'Cards1', 'Sorting rules2', 'Account & sync'])
  expect(within(nav).getByRole('link', { name: 'Household' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('heading', { level: 2, name: 'Household' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 2, name: 'Cards' })).not.toBeInTheDocument()
  expect(within(nav).getByRole('link', { name: 'Cards1' })).toHaveAttribute('href', '?view=settings&section=cards')
  fireEvent.click(within(nav).getByRole('link', { name: 'Cards1' }))
  expect(onSelect).toHaveBeenCalledWith('cards')
})

it('lists the sections on phones; a section has a breadcrumb back to the list', () => {
  render(<Harness initial={household()}/>)
  const list = screen.getByRole('list', { name: 'Settings sections' })
  expect(within(list).getAllByRole('button').map(row => row.textContent)).toEqual([
    'HouseholdAda, Ben', 'Pay & incomeNone yet', 'Accounts & pots1 account · 2 pots', 'Categories0 categories', 'Cards1 card', 'Sorting rules2 rules', 'Account & syncSaved on this device',
  ])
  fireEvent.click(within(list).getByRole('button', { name: /^Cards/ }))
  expect(screen.getByRole('heading', { level: 2, name: 'Cards' })).toBeInTheDocument()
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
  expect(within(crumbs).getByText('Cards')).toHaveAttribute('aria-current', 'page')
  fireEvent.click(within(crumbs).getByRole('button', { name: 'Settings' }))
  expect(screen.getByRole('list', { name: 'Settings sections' })).toBeInTheDocument()
})

it('saves the household name on blur and Enter, with a Saved toast, and confirms removing an adult', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} start="household" onChange={next => { saved = next }}/>)
  const name = screen.getByLabelText('Household name')
  fireEvent.change(name, { target: { value: 'Ada + Ben' } })
  expect(saved).toBeUndefined()
  fireEvent.blur(name)
  expect(saved!.household.name).toBe('Ada + Ben')
  expect(screen.getByRole('status')).toHaveTextContent('Saved')
  fireEvent.change(name, { target: { value: 'Our house' } })
  fireEvent.submit(name.closest('form')!)
  expect(saved!.household.name).toBe('Our house')
  expect(screen.queryByRole('button', { name: 'Continue to Plan' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Ben' }))
  const dialog = screen.getByRole('dialog', { name: 'Remove Ben?' })
  expect(dialog).toHaveTextContent('can’t be removed until that is reassigned')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep adult' }))
  expect(saved!.household.adults).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Remove Ben' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove Ben?' })).getByRole('button', { name: 'Remove adult' }))
  // Ben has a card ending, so the rule keeps him.
  expect(saved!.household.adults.map(person => person.name)).toEqual(['Ada', 'Ben'])
})

it('edits, reorders (from the menu and with ⌥↑) and deletes rules', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} start="rules" onChange={next => { saved = next }}/>)
  expect(screen.getByRole('heading', { name: 'Sorting rules' })).toBeInTheDocument()
  expect(screen.getByText('The first rule that matches sorts a transaction.')).toBeInTheDocument()
  const rows = () => within(screen.getByRole('list', { name: 'Sorting rules' })).getAllByRole('listitem').map(item => item.querySelector('.list-row-text')?.textContent)
  expect(rows()).toEqual(['“GREEN GROCER” → Groceries · JointSorted 1 transaction', '“CORNER CAFE” → Eating out · JointOnly Ben ··41009 · Sorted 0 transactions'])

  fireEvent.click(screen.getByRole('button', { name: 'More actions for the rule for CORNER CAFE' }))
  expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeDisabled()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }))
  expect(saved!.card!.rules.map(rule => rule.id)).toEqual(['r-cafe', 'r-grocer'])
  expect(screen.getByRole('status')).toHaveTextContent('Moved “CORNER CAFE” up.')

  const cafeMenu = screen.getByRole('button', { name: 'More actions for the rule for CORNER CAFE' })
  fireEvent.keyDown(cafeMenu, { key: 'ArrowDown', altKey: true })
  expect(saved!.card!.rules.map(rule => rule.id)).toEqual(['r-grocer', 'r-cafe'])
  expect(screen.getByRole('button', { name: 'More actions for the rule for CORNER CAFE' })).toHaveFocus()

  fireEvent.click(screen.getByRole('button', { name: 'More actions for the rule for GREEN GROCER' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
  const form = screen.getByRole('form', { name: 'Edit the rule for GREEN GROCER' })
  fireEvent.change(within(form).getByLabelText('Matching text'), { target: { value: 'grocer' } })
  fireEvent.change(within(form).getByLabelText('Card'), { target: { value: '41001' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save rule' }))
  expect(saved!.card!.rules[0]).toMatchObject({ id: 'r-grocer', contains: 'GROCER', cardSuffix: '41001' })

  fireEvent.click(screen.getByRole('button', { name: 'More actions for the rule for CORNER CAFE' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete rule' }))
  expect(saved!.card!.rules.map(rule => rule.id)).toEqual(['r-grocer'])
})

it('shows empty states for no rules and no cards', () => {
  const document = household()
  document.card = emptyCardTracker()
  render(<Harness initial={document} start="rules"/>)
  expect(screen.getByText('No sorting rules yet')).toBeInTheDocument()
  expect(screen.getByText('Tick “Always put … in this pot” when you sort a transaction to make one.')).toBeInTheDocument()
  cleanup()
  render(<Harness initial={document} start="cards"/>)
  expect(screen.getByText('No cards yet')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add a card' })).toBeInTheDocument()
})

it('shows the save status: Saved on this device, or the account with Sign out', () => {
  render(<Harness initial={household()} start="account"/>)
  expect(screen.getByText('Saved on this device')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  cleanup()
  const onSignOut = vi.fn()
  render(<Harness initial={household()} start="account" onSignOut={onSignOut}/>)
  expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(onSignOut).toHaveBeenCalled()
})
