// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { commitItemBatch } from '../domain/budgetItemDrafts'
import { resolveBudget, type BudgetItem } from '../domain/monthlyBudget'
import { BudgetItemEditor } from './BudgetItemEditor'

afterEach(cleanup)

const MONTH = '2026-11'
const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const named = (document: BudgetDocument, name: string) => resolveBudget(document.budget, MONTH).items.find(item => item.name === name)!

/** Opens the editor on an item; `saved()` is the item as the editor last saved it. */
function edit(name: string, document = seed()) {
  let saved: BudgetItem | undefined
  render(<BudgetItemEditor document={document} month={MONTH} item={named(document, name)} onClose={() => {}} onSave={batch => {
    const result = commitItemBatch(document, MONTH, batch)
    if ('error' in result) return result.error
    saved = result.items[0]
    return undefined
  }}/>)
  const dialog = screen.getByRole('dialog', { name: 'Edit item' })
  return { dialog, saved: () => saved, save: () => fireEvent.click(within(dialog).getByRole('button', { name: 'Save item' })) }
}
const note = (dialog: HTMLElement) => dialog.querySelector('.item-editor-bill-note:not(.is-warning)')?.textContent

it('starts unticked, with nothing else shown, and saves no bill', () => {
  const { dialog, save, saved } = edit('Rent')
  const box = within(dialog).getByRole('checkbox', { name: "Recurring bill" })
  expect(box).not.toBeChecked()
  expect(within(dialog).getByText('Comes out on a set date, like council tax, insurance or a subscription.')).toBeInTheDocument()
  expect(within(dialog).queryByRole('group', { name: 'Paid by' })).not.toBeInTheDocument()
  save()
  expect(saved()).not.toHaveProperty('bill')
})

it('a monthly direct debit: asks for the day, then says what North will do', () => {
  const { dialog, save, saved } = edit('Rent')
  fireEvent.click(within(dialog).getByRole('checkbox', { name: "Recurring bill" }))
  const paidBy = within(dialog).getByRole('group', { name: 'Paid by' })
  expect(within(paidBy).getByRole('button', { name: 'Direct debit' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(dialog).queryByLabelText('Card')).not.toBeInTheDocument()
  expect(note(dialog)).toBeUndefined()
  save()
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose the day it comes out.')
  expect(within(dialog).getByLabelText('Comes out on')).toHaveFocus()
  expect(saved()).toBeUndefined()
  fireEvent.change(within(dialog).getByLabelText('Comes out on'), { target: { value: '3' } })
  expect(note(dialog)).toBe('North marks £52.13 as paid from Bills on the 3rd each month.')
  fireEvent.change(within(dialog).getByLabelText('Comes out on'), { target: { value: 'last' } })
  expect(note(dialog)).toBe('North marks £52.13 as paid from Bills on the last day of each month.')
  save()
  expect(saved()?.bill).toEqual({ paidBy: 'direct-debit', day: 'last' })
})

it('a card: the tracked card first, or Another card, which North assumes like a direct debit', () => {
  const { dialog, save, saved } = edit('Rent')
  fireEvent.click(within(dialog).getByRole('checkbox', { name: "Recurring bill" }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Card' }))
  const card = within(dialog).getByLabelText('Card')
  expect(within(card).getAllByRole('option').map(option => option.textContent)).toEqual(['Amex (tracked in Spending)', 'Another card'])
  expect(card).toHaveValue('amex')
  fireEvent.change(within(dialog).getByLabelText('Comes out on'), { target: { value: '2' } })
  expect(note(dialog)).toBe('You’ll sort the charge from the Amex statement as usual. The date only shows it as Due until then.')
  save()
  expect(saved()?.bill).toEqual({ paidBy: 'card', cardId: 'amex', day: 2 })
  fireEvent.change(card, { target: { value: '' } })
  expect(note(dialog)).toBe('North marks £52.13 as paid from Bills on the 2nd each month.')
  save()
  expect(saved()?.bill).toEqual({ paidBy: 'card', day: 2 })
})

it('opens a saved bill as it was, and a card no longer in North as Another card', () => {
  let { dialog } = edit('Streamflix')
  expect(within(dialog).getByRole('checkbox', { name: "Recurring bill" })).toBeChecked()
  expect(within(dialog).getByLabelText('Card')).toHaveValue('amex')
  expect(within(dialog).getByLabelText('Comes out on')).toHaveValue('2')
  cleanup()
  const document = seed()
  document.card!.cards = document.card!.cards.map(card => ({ ...card, id: 'new-amex' }))
  ;({ dialog } = edit('Streamflix', document))
  expect(within(dialog).getByLabelText('Card')).toHaveValue('')
  expect(note(dialog)).toBe('North marks £73.52 as paid from Bills on the 2nd each month.')
})

it('a yearly bill: renewal day and month, the reminder, and its line', () => {
  const { dialog, save, saved } = edit('Car insurance')
  expect(within(dialog).getByLabelText('Renews on')).toHaveValue('3')
  expect(within(dialog).getByLabelText('Renewal month')).toHaveValue('3')
  expect(within(dialog).getByLabelText('Remind me')).toHaveValue('6')
  expect(within(within(dialog).getByLabelText('Remind me')).getAllByRole('option').map(option => option.textContent)).toEqual(['2 weeks before', '4 weeks before', '6 weeks before', '8 weeks before', 'Don’t remind me'])
  expect(note(dialog)).toBe('North marks £1,310.04 as paid from Bills on 3\u00a0March, and reminds you 6 weeks before.')
  fireEvent.change(within(dialog).getByLabelText('Remind me'), { target: { value: '0' } })
  expect(note(dialog)).toBe('North marks £1,310.04 as paid from Bills on 3\u00a0March.')
  // Bills carries over, so there's no warning.
  expect(dialog.querySelector('.item-editor-bill-note.is-warning')).toBeNull()
  save()
  expect(saved()?.bill).toEqual({ paidBy: 'direct-debit', day: 3, month: 3, remindWeeks: 0 })
})

it('a yearly bill on a tracked card is for Due and the reminder only', () => {
  const { dialog } = edit('Breakdown cover')
  expect(note(dialog)).toBe('You’ll sort the charge from the Amex statement as usual. The date is for the Due list and your reminder.')
  fireEvent.change(within(dialog).getByLabelText('Remind me'), { target: { value: '0' } })
  expect(note(dialog)).toBe('You’ll sort the charge from the Amex statement as usual. The date is for the Due list.')
})

it('switching frequency: yearly to monthly keeps the day, monthly to yearly asks for the month', () => {
  const { dialog, save, saved } = edit('Water')
  fireEvent.change(within(dialog).getByLabelText('Every'), { target: { value: 'annually' } })
  expect(within(dialog).getByLabelText('Renews on')).toHaveValue('5')
  expect(within(dialog).getByLabelText('Renewal month')).toHaveValue('')
  expect(within(dialog).getByLabelText('Remind me')).toHaveValue('4')
  expect(note(dialog)).toBeUndefined()
  save()
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose the month it renews.')
  expect(within(dialog).getByLabelText('Renewal month')).toHaveFocus()
  fireEvent.change(within(dialog).getByLabelText('Renewal month'), { target: { value: '9' } })
  fireEvent.change(within(dialog).getByLabelText('Every'), { target: { value: 'monthly' } })
  expect(within(dialog).queryByLabelText('Renewal month')).not.toBeInTheDocument()
  save()
  expect(saved()?.bill).toEqual({ paidBy: 'direct-debit', day: 5 })
})

it('warns when a yearly bill’s pot doesn’t carry over, and still saves', () => {
  const { dialog, save, saved } = edit('Groceries')
  fireEvent.change(within(dialog).getByLabelText('Every'), { target: { value: 'annually' } })
  fireEvent.click(within(dialog).getByRole('checkbox', { name: "Recurring bill" }))
  expect(within(dialog).getByText(/^Bills that renew yearly need a pot that carries over\./)).toHaveTextContent('Turn on Carries over for Groceries in Settings › Accounts & pots.')
  fireEvent.change(within(dialog).getByLabelText('Renews on'), { target: { value: '1' } })
  fireEvent.change(within(dialog).getByLabelText('Renewal month'), { target: { value: '2' } })
  save()
  expect(saved()).toMatchObject({ frequency: 'annually', bill: { day: 1, month: 2, remindWeeks: 4 } })
})

it('a bill straight from an account is listed, not marked paid from a pot', () => {
  const { dialog } = edit('Streaming')
  fireEvent.click(within(dialog).getByRole('checkbox', { name: "Recurring bill" }))
  fireEvent.change(within(dialog).getByLabelText('Comes out on'), { target: { value: '15' } })
  expect(note(dialog)).toBe('North lists £144.82 from Monzo Joint on the 15th each month.')
})
