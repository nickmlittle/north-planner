import { describe, expect, it } from 'vitest'
import { ageOn, amount, decodeDocument, emptyPerson, householdErrors, missingDetails, newDocument, snapshotTotals, toForecastInput, validDOB, withSnapshot } from './setup'
import { forecastResult } from '../engine/forecast'

import { completeDocument } from '../test/setupFixture'
import { newPropertyMove } from '../config/defaultMoves'

describe('household setup', () => {
  it('starts empty and distinguishes zero, unknown and invalid amounts', () => {
    expect(newDocument().snapshot.people).toEqual([])
    expect(snapshotTotals(newDocument().snapshot).netWorth).toBeNull()
    expect(amount('0')).toBe(0)
    for (const s of ['', '-1', '1e3', 'NaN', '12.345', '1,000']) expect(amount(s)).toBeNull()
  })
  it('validates real dates and derives exact display ages', () => {
    const today = new Date('2026-10-11T12:00:00Z')
    expect(validDOB('2020-02-29', today)).toBe(true)
    for (const dob of ['2020-02-31', '2026-10-12', '1990-13-01', '']) expect(validDOB(dob, today)).toBe(false)
    expect(ageOn('1990-11-01', today)).toBe(35)
    expect(ageOn('1990-06-14', today)).toBe(36)
    const d = completeDocument(); d.snapshot.people[0]!.dob = '2020-01-01'
    expect(householdErrors(d.snapshot)).toContain('Adults must be at least 18. Add younger people as children.')
  })
  it('reconciles totals without counting equity twice and suppresses incomplete net worth', () => {
    const d = completeDocument()
    expect(snapshotTotals(d.snapshot)).toMatchObject({ assets: 620000, mortgage: 250000, netWorth: 370000 })
    d.snapshot.people[0]!.pension = ''
    expect(snapshotTotals(d.snapshot)).toMatchObject({ knownAssets: 520000, assets: null, netWorth: null })
    expect(() => toForecastInput(d)).toThrow('pension balance')
  })
  it('adapts monthly pay and pension rates to a multi-year forecast', () => {
    const d = completeDocument(); const input = toForecastInput(d)
    expect(input.income[0]).toMatchObject({ annualSalary: 60000, startYear: 2026, contributions: { employeeRate: 0.05, employerRate: 0.03 } })
    expect(input.income[0]!.endYear).toBeGreaterThan(2027)
    expect(input.allowances[d.snapshot.people[0]!.id]).toBe(20000)
    const result = forecastResult(input)
    expect(result.error).toBeUndefined()
    expect(result.rows[1]!.gross).toBe(60000)
  })
  it('supports renters with explicit no earnings, no assets and zero spending', () => {
    const d = completeDocument(); const p = d.snapshot.people[0]!
    Object.assign(p, { incomeKind: 'none', pensionStatus: 'none', isaType: 'none' })
    Object.assign(d.snapshot, { housing: 'rent', spending: '0' })
    expect(missingDetails(d.snapshot)).toEqual([])
    expect(snapshotTotals(d.snapshot).netWorth).toBe(0)
    expect(forecastResult(toForecastInput(d)).error).toBeUndefined()
  })
  it('keeps children out of adult forecasts and requires unknown future child costs', () => {
    const d = completeDocument(); const child = emptyPerson('child')
    Object.assign(child, { name: 'Jamie', dob: '2020-02-22', childCost: '400' }); d.snapshot.people.push(child)
    expect(missingDetails(d.snapshot)).toEqual([])
    expect(() => toForecastInput(d)).toThrow('future annual costs')
    child.futureCosts.ages12to18 = '3000'
    const input = toForecastInput(d)
    expect(input.household.people).toHaveLength(1)
    expect(input.children[0]!.costs).toMatchObject({ ages5to11: 4800, ages12to18: 3000 })
  })
  it('preserves future jobs and valid timelines during current draft edits', () => {
    const d = completeDocument()
    const first = toForecastInput(d).income[0]!
    d.incomeTimeline = [{ ...first, endYear: 2030 }, { ...first, id: 'later-job', startYear: 2030, annualSalary: 80000 }]
    const nameEdit = withSnapshot(d, { ...d.snapshot, people: d.snapshot.people.map(p => ({ ...p, name: 'Alexandra' })) })
    expect(nameEdit.incomeTimeline).toEqual(d.incomeTimeline)
    const payEdit = withSnapshot(d, { ...d.snapshot, people: d.snapshot.people.map(p => ({ ...p, pay: '6000' })) })
    expect(payEdit.incomeTimeline!.find(i => i.id === first.id)).toMatchObject({ annualSalary: 72000, endYear: 2030 })
    expect(payEdit.incomeTimeline!.find(i => i.id === 'later-job')).toMatchObject({ annualSalary: 80000 })
    const invalid = withSnapshot(payEdit, { ...payEdit.snapshot, people: payEdit.snapshot.people.map(p => ({ ...p, employee: 'abc' })) })
    expect(decodeDocument(JSON.stringify(invalid))).toEqual(invalid)
    expect(() => toForecastInput(invalid)).toThrow('contributions')
  })
  it('rejects corrupted saved documents and preserves legitimate drafts', () => {
    const d = completeDocument()
    expect(decodeDocument(JSON.stringify(d))).toEqual(d)
    for (const bad of ['{}', '{', JSON.stringify({ ...d, version: 2 }), JSON.stringify({ ...d, snapshot: { ...d.snapshot, people: [null] } })]) expect(decodeDocument(bad)).toBeNull()
  })
  it('migrates legacy move amounts to purchase-price rates when decoding', () => {
    const doc = completeDocument()
    const move = { ...newPropertyMove(2030), enabled: true, purchasePrice: 400000, stampDuty: 1, agentFees: 6000, legalFees: 2000, renovation: 10000 }
    doc.moves = [move]
    const legacy = JSON.parse(JSON.stringify(doc)) as typeof doc
    delete (legacy.moves[0] as Partial<typeof move>).agentFeeRate
    delete (legacy.moves[0] as Partial<typeof move>).legalFeeRate
    delete (legacy.moves[0] as Partial<typeof move>).renovationRate
    const decoded = decodeDocument(JSON.stringify(legacy))!
    expect(decoded.moves[0]).toMatchObject({ agentFeeRate: 0.015, legalFeeRate: 0.005, renovationRate: 0.025 })
    expect(toForecastInput(decoded).moves[0]).toMatchObject({ stampDuty: 10000, agentFees: 6000, legalFees: 2000, renovation: 10000 })
  })
})
