// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { newBudgetDocument } from '../domain/budgetDocument'

const backend = vi.hoisted(() => ({ row: null as null | { document: unknown; revision: number }, calls: [] as string[] }))
vi.mock('./supabase', () => ({ supabase: {
  from: (table: string) => {
    backend.calls.push(table)
    let operation: 'read' | 'insert' | 'update' = 'read'
    let payload: { document: unknown; revision: number } | null = null
    let expectedRevision: number | null = null
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { if (field === 'revision') expectedRevision = Number(value); return query },
      insert: (value: { document: unknown; revision: number }) => { operation = 'insert'; payload = value; return query },
      update: (value: { document: unknown; revision: number }) => { operation = 'update'; payload = value; return query },
      maybeSingle: async () => {
        if (operation === 'read') return { data: backend.row, error: null }
        if (operation === 'update' && backend.row?.revision === expectedRevision) { backend.row = payload; return { data: { revision: payload!.revision }, error: null } }
        return { data: null, error: null }
      },
      single: async () => {
        if (operation === 'insert' && !backend.row) { backend.row = payload; return { data: { revision: payload!.revision }, error: null } }
        if (operation === 'read' && backend.row) return { data: backend.row, error: null }
        return { data: null, error: { code: '23505', message: 'duplicate' } }
      },
    }
    return query
  },
} }))
import { useCloudBudget } from './useCloudBudget'

const user = { id: 'user-1' } as User
afterEach(() => { cleanup(); backend.row = null; backend.calls = []; localStorage.clear() })

it('creates a separate cloud budget after editing and reports Saved', async () => {
  const { result } = renderHook(() => useCloudBudget(user))
  await waitFor(() => expect(result.current.document).not.toBeNull())
  act(() => result.current.setDocument(current => ({ ...current, household: { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] } })))
  await waitFor(() => expect(result.current.status).toBe('Saved'), { timeout: 2000 })
  expect(backend.calls.every(table => table === 'budgets')).toBe(true)
  expect(backend.row?.document).toMatchObject({ household: { name: 'Alex household' } })
  expect(backend.row?.revision).toBe(1)
})

it('offers cloud and device choices when a pending copy differs', async () => {
  const remote = newBudgetDocument()
  remote.household.name = 'Cloud'
  const pending = newBudgetDocument()
  pending.household.name = 'Device'
  backend.row = { document: remote, revision: 2 }
  localStorage.setItem('north.budget.pending.user-1.v1', JSON.stringify(pending))
  const { result } = renderHook(() => useCloudBudget(user))
  await waitFor(() => expect(result.current.conflict).not.toBeNull())
  expect(result.current.document?.household.name).toBe('Device')
  act(() => result.current.chooseConflict('cloud'))
  expect(result.current.document?.household.name).toBe('Cloud')
  expect(localStorage.getItem('north.budget.pending.user-1.v1')).toBeNull()
})

it('retries the device version against the latest cloud revision after a conflict', async () => {
  const remote = newBudgetDocument()
  remote.household.name = 'Cloud'
  const pending = newBudgetDocument()
  pending.household.name = 'Device'
  backend.row = { document: remote, revision: 2 }
  localStorage.setItem('north.budget.pending.user-1.v1', JSON.stringify(pending))
  const { result } = renderHook(() => useCloudBudget(user))
  await waitFor(() => expect(result.current.conflict).not.toBeNull())
  act(() => result.current.chooseConflict('device'))
  await waitFor(() => expect(result.current.status).toBe('Saved'), { timeout: 2000 })
  expect(backend.row?.revision).toBe(3)
  expect(backend.row?.document).toMatchObject({ household: { name: 'Device' } })
})
