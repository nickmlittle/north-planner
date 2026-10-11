import { describe, expect, it } from 'vitest'
import { ageOn, amount, decodeDocument, emptyPerson, householdErrors, missingDetails, newDocument, snapshotTotals, toForecastInput, validDOB } from './setup'
import { forecastResult } from '../engine/forecast'

export function completeDocument() {
  const d = newDocument(); const p = emptyPerson('you')
  Object.assign(p, { name: 'Alex', dob: '1990-06-14', incomeKind: 'paye', pay: '5000', frequency: 'month', pensionStatus: 'yes', pension: '100000', employee: '5', employer: '3', treatment: 'salary-sacrifice', isaType: 'stocks-and-shares', isa: '20000' })
  Object.assign(d.snapshot, { name: 'Alex household', people: [p], housing: 'own', homeValue: '500000', homeOwners: [p.id], mortgageStatus: 'yes', mortgageBalance: '250000', rate: '4.5', term: '25', borrowers: [p.id], spending: '2000', noCash: true })
  return d
}
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
  it('rejects corrupted saved documents and preserves legitimate drafts', () => {
    const d = completeDocument()
    expect(decodeDocument(JSON.stringify(d))).toEqual(d)
    for (const bad of ['{}', '{', JSON.stringify({ ...d, version: 2 }), JSON.stringify({ ...d, snapshot: { ...d.snapshot, people: [null] } })]) expect(decodeDocument(bad)).toBeNull()
  })
})
