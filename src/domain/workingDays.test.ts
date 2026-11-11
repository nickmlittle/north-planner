import { describe, expect, it } from 'vitest'
import { bankHolidays, easterSunday, isWorkingDay, moneyArrives, paydayIn } from './workingDays'

const immy = { day: 28, ifNotWorkingDay: 'previous' as const }
const nick = { day: 28, ifNotWorkingDay: 'next' as const }

describe('bank holidays in England and Wales', () => {
  it('works out Easter', () => {
    expect([2024, 2025, 2026, 2027].map(easterSunday)).toEqual(['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28'])
  })

  it('lists 2026, with the Boxing Day substitute on Monday 28 December', () => {
    expect(bankHolidays(2026)).toEqual(['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28'])
  })

  it('substitutes Christmas and New Year at a weekend', () => {
    // 2027: Christmas Saturday → Monday 27, Boxing Day Sunday → Tuesday 28.
    expect(bankHolidays(2027).filter(date => date.startsWith('2027-12'))).toEqual(['2027-12-27', '2027-12-28'])
    // 2022: Christmas Sunday → Tuesday 27, Boxing Day Monday 26.
    expect(bankHolidays(2022).filter(date => date.startsWith('2022-12'))).toEqual(['2022-12-26', '2022-12-27'])
    // 2028: New Year's Day Saturday → Monday 3 January.
    expect(bankHolidays(2028)[0]).toBe('2028-01-03')
  })

  it('knows one-off changes and takes extra ones', () => {
    expect(bankHolidays(2022)).toEqual(expect.arrayContaining(['2022-06-02', '2022-06-03', '2022-09-19']))
    expect(bankHolidays(2022)).not.toContain('2022-05-30')
    expect(bankHolidays(2023)).toContain('2023-05-08')
    expect(bankHolidays(2020)).toContain('2020-05-08')
    expect(bankHolidays(2020)).not.toContain('2020-05-04')
    expect(isWorkingDay('2026-06-15')).toBe(true)
    expect(isWorkingDay('2026-06-15', ['2026-06-15'])).toBe(false)
  })

  it('treats weekends and bank holidays as not working days', () => {
    expect(isWorkingDay('2026-11-28')).toBe(false)
    expect(isWorkingDay('2026-12-28')).toBe(false)
    expect(isWorkingDay('2026-12-24')).toBe(true)
  })
})

describe('paydays', () => {
  it('moves the 28th to the working day before, or after', () => {
    // 28 Nov 2026 is a Saturday.
    expect(paydayIn('2026-11', immy)).toBe('2026-11-27')
    expect(paydayIn('2026-11', nick)).toBe('2026-11-30')
    // 28 Dec 2026 is the Boxing Day substitute.
    expect(paydayIn('2026-12', immy)).toBe('2026-12-24')
    expect(paydayIn('2026-12', nick)).toBe('2026-12-29')
  })

  it('pays a month’s money in the month before, even when it lands in the month itself', () => {
    expect(moneyArrives('2026-12', immy)).toBe('2026-11-27')
    expect(moneyArrives('2027-01', nick)).toBe('2026-12-29')
    // 28 Feb 2026 is a Saturday: Nick's March money arrives Monday 2 March.
    expect(moneyArrives('2026-03', nick)).toBe('2026-03-02')
  })

  it('uses the last day for a day the month doesn’t have', () => {
    expect(paydayIn('2026-02', { day: 31, ifNotWorkingDay: 'previous' })).toBe('2026-02-27')
  })
})
