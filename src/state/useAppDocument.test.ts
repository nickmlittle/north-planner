// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decodePersistedDocument, type AppDocument } from '../domain/setup'
import { completeDocument } from '../test/setupFixture'
import { legacyStorageKey, storageKey, useAppDocument } from './useAppDocument'

beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

function asLegacyDocument(document: AppDocument) {
  const legacy = structuredClone(document) as unknown as Record<string, unknown>
  delete legacy.moneyBasis
  delete legacy.balanceDatesReviewed
  return legacy
}

it('migrates a dated legacy browser document once and retains records, ownership, future income and events', () => {
  const document = completeDocument()
  const person = document.snapshot.people[0]!
  document.snapshot.cash = [{ id: 'cash-1', name: 'Joint cash', balance: '12000', ownerIds: [person.id], asOfDate: '2026-02-01' }]
  document.snapshot.noCash = false
  document.incomeTimeline = [{ id: 'future-job', personId: person.id, kind: 'paye', startYear: 2032, endYear: 2038, annualSalary: 84000, dayRate: 0, billableDays: 0, workingFraction: 1, annualGrossOverride: null,
    contributions: { employeeRate: 0.06, employerRate: 0.04, treatment: 'net-pay', continueAfterFire: true } }]
  document.childEvents = [{ id: 'child-1', name: 'Future child', birthYear: 2030, enabled: true, birthCost: 5000, costs: { ages0to2: 9000, ages3to4: 7000, ages5to11: 6000, ages12to18: 8000 }, workAdjustments: [] }]
  document.spendingEvents = [{ id: 'spend-1', name: 'Reduced hours', startYear: 2031, endYear: 2035, annualChange: 1200, enabled: true }]
  document.purchaseEvents = [{ id: 'purchase-1', name: 'Car', preset: 'car', enabled: true, year: 2030, upfrontCost: 18000, recurring: { annualCost: 1000, startYear: 2030, endYear: 2038 } }]
  const original = JSON.stringify(asLegacyDocument(document))
  localStorage.setItem(legacyStorageKey, original)

  const { result } = renderHook(() => useAppDocument())

  expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ version: 2 })
  expect(localStorage.getItem(legacyStorageKey)).toBeNull()
  const restored = decodePersistedDocument(localStorage.getItem(storageKey)!)
  expect(restored).not.toHaveProperty('error')
  if ('error' in restored) throw new Error(restored.error)
  expect(restored.document.snapshot).toMatchObject({ people: [{ name: 'Alex', employee: '5', employer: '3', treatment: 'salary-sacrifice', isa: '20000', pension: '100000' }], cash: [{ id: 'cash-1', balance: '12000', ownerIds: [person.id] }], homeOwners: [person.id], borrowers: [person.id] })
  expect(restored.document.incomeTimeline).toMatchObject([{ id: 'income-' + person.id }, { id: 'future-job', annualSalary: 84000, contributions: { employeeRate: 0.06, employerRate: 0.04, treatment: 'net-pay', continueAfterFire: true } }])
  expect(restored.document.childEvents).toEqual(document.childEvents)
  expect(restored.document.spendingEvents).toEqual(document.spendingEvents)
  expect(restored.document.purchaseEvents).toEqual(document.purchaseEvents)
  expect(result.current.document.snapshot.homeValue).toBe('500000')
})

it('keeps the legacy browser original until missing balance dates are reviewed', () => {
  const document = completeDocument()
  document.snapshot.people[0]!.isaAsOfDate = ''
  const original = JSON.stringify(asLegacyDocument(document))
  localStorage.setItem(legacyStorageKey, original)
  const { result } = renderHook(() => useAppDocument())

  expect(result.current.migrationPending).toBe(true)
  expect(result.current.document.balanceDatesReviewed).toBe(false)
  expect(localStorage.getItem(legacyStorageKey)).toBe(original)
  expect(localStorage.getItem(storageKey)).toBeNull()

  act(() => result.current.setDocument(current => ({ ...current, snapshot: { ...current.snapshot, people: current.snapshot.people.map(person => ({ ...person, isaAsOfDate: '2026-02-01' })) } })))

  expect(result.current.migrationPending).toBe(false)
  expect(localStorage.getItem(legacyStorageKey)).toBeNull()
  expect(JSON.parse(localStorage.getItem(storageKey)!).version).toBe(2)
})

it('keeps a readable household in session and preserves the original when migration storage fails', () => {
  const original = JSON.stringify(asLegacyDocument(completeDocument()))
  localStorage.setItem(legacyStorageKey, original)
  const setItem = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === storageKey) throw new Error('storage full')
    return setItem.call(this, key, value)
  })
  const { result } = renderHook(() => useAppDocument())

  expect(result.current.document.snapshot.name).toBe('Alex household')
  expect(result.current.warning).toMatch(/Could not finish upgrading/)
  expect(result.current.recoveryOriginal).toBe(original)
  expect(localStorage.getItem(legacyStorageKey)).toBe(original)

  vi.restoreAllMocks()
  act(() => result.current.replaceSavedDraft())
  expect(JSON.parse(localStorage.getItem(storageKey)!).version).toBe(2)
  expect(localStorage.getItem(legacyStorageKey)).toBeNull()
})
