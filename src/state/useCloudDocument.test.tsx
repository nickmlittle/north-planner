// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decodePersistedDocument, type AppDocument } from '../domain/setup'
import { completeDocument } from '../test/setupFixture'

const database = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: database.from } }))
import { useCloudDocument } from './useCloudDocument'

beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

function asLegacyDocument(document: AppDocument) {
  const legacy = structuredClone(document) as unknown as Record<string, unknown>
  delete legacy.moneyBasis
  delete legacy.balanceDatesReviewed
  return legacy
}

it('waits for balance-date review before migrating a cloud document, then saves the full v2 record', async () => {
  const document = completeDocument()
  const person = document.snapshot.people[0]!
  document.snapshot.people[0]!.isaAsOfDate = ''
  document.snapshot.cash = [{ id: 'cloud-cash', name: 'Joint cash', balance: '12000', ownerIds: [person.id], asOfDate: '2026-02-01' }]
  document.snapshot.noCash = false
  document.incomeTimeline = [{ id: 'future-job', personId: person.id, kind: 'paye', startYear: 2032, endYear: 2038, annualSalary: 84000, dayRate: 0, billableDays: 0, workingFraction: 1, annualGrossOverride: null,
    contributions: { employeeRate: 0.06, employerRate: 0.04, treatment: 'net-pay', continueAfterFire: true } }]
  document.spendingEvents = [{ id: 'spend-1', name: 'Reduced hours', startYear: 2031, endYear: 2035, annualChange: 1200, enabled: true }]
  document.purchaseEvents = [{ id: 'purchase-1', name: 'Car', preset: 'car', enabled: true, year: 2030, upfrontCost: 18000, recurring: null }]
  const original = asLegacyDocument(document)
  const query = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.update.mockReturnValue(query)
  query.insert.mockReturnValue(query)
  query.single.mockReturnValue(query)
  query.maybeSingle.mockResolvedValueOnce({ data: { document: original, revision: 7 }, error: null })
    .mockResolvedValueOnce({ data: { revision: 8 }, error: null })
  database.from.mockReturnValue(query)

  const { result } = renderHook(() => useCloudDocument({ id: 'user-1' } as User))
  await waitFor(() => expect(result.current.migrationPending).toBe(true))
  expect(result.current.document?.snapshot.people[0]?.pension).toBe('100000')
  expect(result.current.recoveryOriginal).toBe(JSON.stringify(original))
  expect(query.update).not.toHaveBeenCalled()

  act(() => result.current.setDocument(current => ({ ...current, snapshot: { ...current.snapshot, people: current.snapshot.people.map(p => ({ ...p, isaAsOfDate: '2026-02-01' })) } })))

  await waitFor(() => expect(result.current.status).toBe('Saved'))
  expect(query.update).toHaveBeenCalledOnce()
  const payload = query.update.mock.calls[0]![0] as { document: { version: number } }
  expect(payload.document.version).toBe(2)
  const restored = decodePersistedDocument(JSON.stringify(payload.document))
  expect(restored).not.toHaveProperty('error')
  if ('error' in restored) throw new Error(restored.error)
  expect(restored.document.snapshot).toMatchObject({ people: [{ isa: '20000', pension: '100000', employee: '5', employer: '3' }], cash: [{ id: 'cloud-cash', balance: '12000', ownerIds: [person.id] }], homeOwners: [person.id], borrowers: [person.id] })
  expect(restored.document.incomeTimeline).toMatchObject([{ id: 'income-' + person.id }, { id: 'future-job', annualSalary: 84000, contributions: { employeeRate: 0.06, employerRate: 0.04, treatment: 'net-pay', continueAfterFire: true } }])
  expect(restored.document.spendingEvents).toEqual(document.spendingEvents)
  expect(restored.document.purchaseEvents).toEqual(document.purchaseEvents)
})
