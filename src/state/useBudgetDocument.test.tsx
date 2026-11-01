// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { budgetStorageKey, useBudgetDocument } from './useBudgetDocument'

afterEach(() => { cleanup(); localStorage.clear() })

it('saves edits under the budget key without touching old household data', () => {
  localStorage.setItem('north.household.v2', 'old household')
  const { result } = renderHook(() => useBudgetDocument())
  act(() => result.current.setDocument(current => ({ ...current, household: { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] } })))
  expect(result.current.status).toBe('Saved')
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!)).toMatchObject({ household: { name: 'Alex household' } })
  expect(localStorage.getItem('north.household.v2')).toBe('old household')
})

it('backs up an unreadable budget before replacing it with the next edit', () => {
  localStorage.setItem(budgetStorageKey, '{bad json')
  const { result } = renderHook(() => useBudgetDocument())
  expect(result.current.status).toBe('Not saved')
  expect(localStorage.getItem(budgetStorageKey)).toBe('{bad json')
  act(() => result.current.setDocument(current => ({ ...current, household: { ...current.household, name: 'New budget' } })))
  expect(localStorage.getItem('north.budget.recovery.v1')).toBe('{bad json')
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!).household.name).toBe('New budget')
})
