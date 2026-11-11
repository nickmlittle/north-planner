// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { IncomeDialog } from './IncomeDialog'

afterEach(cleanup)

it('sets an employment source’s payday, shared by every month', () => {
  const start = newBudgetDocument()
  start.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }] }
  start.budget.incomeSources = [{ id: 'pay', personId: 'ada', name: 'Salary', type: 'employment', baseAmountPence: 300000, changes: {} }, { id: 'gift', personId: 'ada', name: 'Gift', type: 'additional', baseAmountPence: 1000, changes: {} }]
  let saved: BudgetDocument = start
  function Harness() {
    const [document, setDocument] = useState(start)
    return <IncomeDialog document={document} month="2026-11" onClose={() => {}} setDocument={update => setDocument(current => { saved = typeof update === 'function' ? update(current) : update; return saved })}/>
  }
  render(<Harness/>)
  expect(screen.getAllByLabelText('Paid on day')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Paid on day'), { target: { value: '28' } })
  fireEvent.change(screen.getByLabelText('On a weekend or bank holiday'), { target: { value: 'next' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save income' }))
  expect(saved.budget.incomeSources[0]!.payday).toEqual({ day: 28, ifNotWorkingDay: 'next' })
  expect(saved.budget.incomeSources[1]!.payday).toBeUndefined()
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(decodeBudgetDocument({ ...saved, budget: { ...saved.budget, incomeSources: [{ ...saved.budget.incomeSources[0]!, payday: { day: 40, ifNotWorkingDay: 'next' } }] } })).toBeNull()
})
