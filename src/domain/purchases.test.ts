import { expect, it } from 'vitest'
import { purchaseSpending, validatePurchases } from './purchases'
import type { PurchaseEvent } from './purchases'
import { decodeDocument, toForecastInput } from './setup'
import { completeDocument } from '../test/setupFixture'
import { forecastResult } from '../engine/forecast'
import { eventKey, planEvents, putPlanEvent, removePlanEvent, validatePlanEvents } from './events'

const car: PurchaseEvent = { id: 'car', name: 'Family car', preset: 'car', enabled: true, year: 2027, upfrontCost: 10000,
  recurring: { annualCost: 1000, startYear: 2027, endYear: 2029 } }

it('applies purchase costs once and recurring costs only within their period', () => {
  const doc = completeDocument(); doc.planning.equityReturn = 0
  const before = forecastResult(toForecastInput(doc)).rows
  doc.purchaseEvents = [car]
  const after = forecastResult(toForecastInput(doc)).rows
  for (const [year, cumulative] of [[2026, 0], [2027, 11000], [2028, 12000], [2029, 12000]]) {
    expect(before.find(r => r.year === year)!.netWorth - after.find(r => r.year === year)!.netWorth).toBeCloseTo(cumulative!, 6)
  }
  expect(doc.spendingEvents).toEqual([])
  expect(toForecastInput(doc).spending.events).toHaveLength(2)
  expect(toForecastInput(doc).spending.events).toHaveLength(2)
  doc.purchaseEvents[0] = { ...car, enabled: false }
  expect(forecastResult(toForecastInput(doc)).rows).toEqual(before)
})

it('restores old version-1 documents and validates new purchase data without discarding bad storage', () => {
  const doc = completeDocument()
  const legacy = JSON.parse(JSON.stringify(doc)); delete legacy.purchaseEvents
  expect(decodeDocument(JSON.stringify(legacy))).toEqual(doc)
  doc.purchaseEvents = [car]
  expect(decodeDocument(JSON.stringify(doc))).toEqual(doc)
  for (const invalid of [null, {}, [{ ...car, recurring: {} }], [{ ...car, upfrontCost: -1 }]]) {
    expect(decodeDocument(JSON.stringify({ ...doc, purchaseEvents: invalid }))).toBeNull()
  }
  expect(validatePurchases([{ ...car, recurring: { annualCost: 0, startYear: 2026, endYear: 2029 } }])).toBeTruthy()
  expect(purchaseSpending([{ ...car, recurring: null }])).toHaveLength(1)
})

it('replaces, toggles and removes grouped events without duplicating costs', () => {
  let doc = completeDocument()
  doc = putPlanEvent(doc, { kind: 'purchase', value: car })
  doc = putPlanEvent(doc, { kind: 'purchase', value: { ...car, upfrontCost: 5000 } })
  expect(doc.purchaseEvents).toHaveLength(1)
  expect(toForecastInput(doc).spending.events[0]!.annualChange).toBe(5000)
  expect(eventKey(planEvents(doc)[0]!)).toBe('purchase:car')
  expect(removePlanEvent(doc, planEvents(doc)[0]!).purchaseEvents).toEqual([])
  expect(validatePlanEvents(doc)).toBeUndefined()
})

it('rejects move/refinance and overlapping parental work conflicts', () => {
  const doc = completeDocument(), personId = doc.snapshot.people[0]!.id
  doc.moves = [{ id: 'move', name: 'Next home', enabled: true, year: 2028, saleValue: null, purchasePrice: 500000,
    stampDuty: 0, agentFees: 0, legalFees: 0, movingCosts: 0, renovation: 0, annualRate: .04, termYears: 25 }]
  doc.mortgageExtras.refinances = [{ id: 'refi', enabled: true, year: 2028, annualRate: .03, termYears: 25 }]
  expect(validatePlanEvents(doc)).toContain('move or a remortgage')
  doc.moves = []
  doc.childEvents = ['first', 'second'].map(id => ({ id, birthYear: 2028, enabled: true, birthCost: 0,
    costs: { ages0to2: 0, ages3to4: 0, ages5to11: 0, ages12to18: 0 },
    workAdjustments: [{ id: `${id}-leave`, personId, startYear: 2028, endYear: 2029, workingFraction: .5, annualGrossOverride: null }] }))
  expect(validatePlanEvents(doc)).toBeTruthy()
  doc.childEvents[1]!.enabled = false
  expect(validatePlanEvents(doc)).toBeUndefined()
})
