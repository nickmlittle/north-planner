// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../../domain/budgetDocument'
import { resolveIncomeSources } from '../../domain/monthlyBudget'
import { PayAndIncome } from './PayAndIncome'

afterEach(cleanup)

function seed() {
  const start = newBudgetDocument()
  start.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  start.budget.incomeSources = [
    { id: 'pay', personId: 'ada', name: 'Salary', type: 'employment', baseAmountPence: 400000, changes: {}, payday: { day: 28, ifNotWorkingDay: 'previous' } },
    { id: 'gift', personId: 'ada', name: 'Gift', type: 'additional', baseAmountPence: 1000, changes: {} },
  ]
  return start
}

function setup(start: BudgetDocument, initialMonth = '2026-11') {
  let saved = start
  function Harness() {
    const [document, setDocument] = useState(start)
    const [month, setMonth] = useState(initialMonth)
    const [message, setMessage] = useState('')
    return <><p role="status">{message}</p><PayAndIncome document={document} month={month} onMonthChange={setMonth} notify={setMessage} setDocument={update => setDocument(current => { saved = typeof update === 'function' ? update(current) : update; return saved })}/></>
  }
  render(<Harness/>)
  return { saved: () => saved }
}
const edit = (name: string) => { fireEvent.click(screen.getByRole('button', { name: `More actions for ${name}` })); fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' })) }
const submit = (name: string) => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))

it('lists each source for the month with its amount and payday', () => {
  setup(seed())
  const rows = within(screen.getByRole('list', { name: 'Income in November 2026' })).getAllByRole('listitem').map(item => item.querySelector('.list-row-text')?.textContent)
  expect(rows).toEqual(['Ada · Salary£4,000.00 a month · paid on the 28th (or the working day before)', 'Ada · Gift£10.00 a month · other income'])
})

it('changes a salary from a month on, saying the scope before saving', () => {
  const result = setup(seed(), '2026-12')
  edit('Ada · Salary')
  const dialog = screen.getByRole('dialog', { name: 'Ada · Salary, December 2026' })
  expect(within(dialog).getByText(/^Changes apply: December 2026 onward\./)).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Amount in December 2026')).toHaveAccessibleDescription(/Changes apply: December 2026 onward/)
  fireEvent.change(within(dialog).getByLabelText('Amount in December 2026'), { target: { value: '4,250.00' } })
  submit('Save income')
  expect(resolveIncomeSources(result.saved().budget, '2026-12')[0]!.amountPence).toBe(425000)
  expect(resolveIncomeSources(result.saved().budget, '2026-11')[0]!.amountPence).toBe(400000)
  expect(screen.getByRole('status')).toHaveTextContent('Income saved.')
})

it('sets a salary’s payday, shared by every month; other income has none', () => {
  const result = setup(seed())
  edit('Ada · Salary')
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Paid on day'), { target: { value: '25' } })
  fireEvent.change(within(dialog).getByLabelText('On a weekend or bank holiday'), { target: { value: 'next' } })
  submit('Save income')
  const saved = result.saved()
  expect(saved.budget.incomeSources[0]!.payday).toEqual({ day: 25, ifNotWorkingDay: 'next' })
  expect(saved.budget.incomeSources[0]!.changes).toEqual({})
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(decodeBudgetDocument({ ...saved, budget: { ...saved.budget, incomeSources: [{ ...saved.budget.incomeSources[0]!, payday: { day: 40, ifNotWorkingDay: 'next' } }] } })).toBeNull()
  edit('Ada · Gift')
  expect(within(screen.getByRole('dialog')).queryByLabelText('Paid on day')).not.toBeInTheDocument()
})

it('adds a recurring source from the selected month, and shows an empty state with none', () => {
  const start = seed()
  start.budget.incomeSources = []
  const result = setup(start)
  expect(screen.getByText('No income yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add income source' }))
  const form = screen.getByRole('form', { name: 'Add income source' })
  expect(within(form).getByText('New income applies: November 2026 onward.')).toBeInTheDocument()
  fireEvent.change(within(form).getByLabelText('Person'), { target: { value: 'ben' } })
  fireEvent.change(within(form).getByLabelText('Source name'), { target: { value: 'Salary' } })
  fireEvent.change(within(form).getByLabelText('Monthly amount'), { target: { value: '3,000' } })
  submit('Add income')
  expect(resolveIncomeSources(result.saved().budget, '2026-11')).toMatchObject([{ personId: 'ben', name: 'Salary', type: 'employment', amountPence: 300000 }])
  expect(screen.getByText('Ben · Salary')).toBeInTheDocument()
})

it('says each source’s own range, keeps budget dates, and drops an unsaved draft on Cancel', () => {
  const start = seed()
  start.household.adults = [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }]
  start.budget.snapshots = { '2026-11': { items: [] }, '2027-03': { items: [] } }
  start.budget.incomeSources = [
    { id: 'pay', personId: 'nick', name: 'Salary', type: 'employment', baseAmountPence: 200000, changes: { '2027-02': 300000 } },
    { id: 'gift', personId: 'immy', name: 'Gift', type: 'additional', baseAmountPence: 10000, changes: { '2027-01': 20000 } },
  ]
  const result = setup(start, '2026-12')
  edit('Nick · Salary')
  let pay = within(screen.getByRole('dialog')).getByLabelText('Amount in December 2026')
  expect(pay).toHaveAccessibleDescription('Changes apply: December 2026–January 2027. £0 stops a source.')
  expect(pay.parentElement).toHaveClass('budget-money-field')
  fireEvent.change(pay, { target: { value: '2200' } })
  submit('Cancel')
  edit('Nick · Salary')
  pay = within(screen.getByRole('dialog')).getByLabelText('Amount in December 2026')
  expect(pay).toHaveValue('2,000.00')
  fireEvent.change(pay, { target: { value: '2,300.00' } })
  submit('Save income')
  edit('Immy · Gift')
  expect(within(screen.getByRole('dialog')).getByLabelText('Amount in December 2026')).toHaveAccessibleDescription('Changes apply: December 2026. £0 stops a source.')
  expect(result.saved().budget.incomeSources[0]?.changes).toEqual({ '2026-12': 230000, '2027-02': 300000 })
  expect(result.saved().budget.incomeSources[1]?.changes).toEqual({ '2027-01': 20000 })
  // Income changes never create a budget date.
  expect(Object.keys(result.saved().budget.snapshots)).toEqual(['2026-11', '2027-03'])
})
