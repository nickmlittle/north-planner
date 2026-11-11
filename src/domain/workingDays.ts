import { addDays, daysInMonth, shiftMonth } from './cardTracker'

/**
 * Working days in England and Wales (plan §5.2): not a weekend or a bank holiday. Worked out here with no
 * network: New Year's Day, Good Friday, Easter Monday, the early May, spring and summer bank holidays,
 * Christmas Day and Boxing Day, with substitute days, plus known one-off changes.
 */

/** One-off changes: moved holidays (removed → added) and extra ones, by year. */
const ONE_OFFS: Record<number, { remove?: string[]; add?: string[] }> = {
  2020: { remove: ['2020-05-04'], add: ['2020-05-08'] },
  2022: { remove: ['2022-05-30'], add: ['2022-06-02', '2022-06-03', '2022-09-19'] },
  2023: { add: ['2023-05-08'] },
}

const pad = (value: number) => String(value).padStart(2, '0')
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const isWeekend = (date: string) => weekday(date) === 0 || weekday(date) === 6

/** Easter Sunday (Gregorian, the anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1
  return iso(year, month, day)
}

/** The first or last given weekday (1 = Monday) of a month. */
function nthWeekday(year: number, month: number, day: number, which: 'first' | 'last'): string {
  if (which === 'first') { let date = iso(year, month, 1); while (weekday(date) !== day) date = addDays(date, 1); return date }
  let date = iso(year, month, daysInMonth(`${year}-${pad(month)}`)); while (weekday(date) !== day) date = addDays(date, -1); return date
}

/** The year's bank holidays in England and Wales, sorted, with `extra` one-offs added. */
export function bankHolidays(year: number, extra: readonly string[] = []): string[] {
  const easter = easterSunday(year)
  const days = new Set<string>()
  // New Year's Day, or the Monday after when it falls at a weekend.
  let newYear = iso(year, 1, 1)
  while (isWeekend(newYear)) newYear = addDays(newYear, 1)
  days.add(newYear)
  days.add(addDays(easter, -2))
  days.add(addDays(easter, 1))
  days.add(nthWeekday(year, 5, 1, 'first'))
  days.add(nthWeekday(year, 5, 1, 'last'))
  days.add(nthWeekday(year, 8, 1, 'last'))
  // Christmas and Boxing Day: a weekend day moves to the next weekday not already a holiday.
  for (const day of [25, 26]) {
    let date = iso(year, 12, day)
    while (isWeekend(date) || days.has(date)) date = addDays(date, 1)
    days.add(date)
  }
  for (const date of ONE_OFFS[year]?.remove ?? []) days.delete(date)
  for (const date of [...ONE_OFFS[year]?.add ?? [], ...extra.filter(date => date.startsWith(`${year}-`))]) days.add(date)
  return [...days].sort()
}

export function isWorkingDay(date: string, extra: readonly string[] = []): boolean {
  return !isWeekend(date) && !bankHolidays(Number(date.slice(0, 4)), extra).includes(date)
}

export type PaydayRule = { day: number; ifNotWorkingDay: 'previous' | 'next' }

/** The date a payday rule pays in a calendar month: its day (or the month's last), moved to a working day. */
export function paydayIn(month: string, rule: PaydayRule, extra: readonly string[] = []): string {
  let date = `${month}-${pad(Math.min(rule.day, daysInMonth(month)))}`
  while (!isWorkingDay(date, extra)) date = addDays(date, rule.ifNotWorkingDay === 'previous' ? -1 : 1)
  return date
}

/**
 * When a month's money arrives (D1): pay at the end of a month is next month's money, so the money for
 * `month` is paid in the month before. With "next working day" it can land in `month` itself
 * (28 Feb 2026 is a Saturday, so it arrives Mon 2 Mar), and it is still that month's money.
 */
export const moneyArrives = (month: string, rule: PaydayRule, extra: readonly string[] = []) => paydayIn(shiftMonth(month, -1), rule, extra)
