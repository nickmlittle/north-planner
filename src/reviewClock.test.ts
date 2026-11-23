// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isReviewDay, readReviewDay, REVIEW_TODAY_KEY, reviewDayLabel, reviewOffset, shiftedDate, startReviewClock } from './reviewClock'

const RealDate = Date
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '/') })
afterEach(() => { globalThis.Date = RealDate; document.querySelector('.review-clock')?.remove(); vi.unstubAllEnvs(); vi.resetModules() })

describe('review clock', () => {
  it('accepts only real calendar days', () => {
    expect(isReviewDay('2026-12-04')).toBe(true)
    expect(isReviewDay('2028-02-29')).toBe(true)
    for (const bad of ['2026-02-29', '2026-13-01', '2026-12-4', '4 Dec', '']) expect(isReviewDay(bad)).toBe(false)
  })

  it('stores ?today=, clears it with an empty value, and ignores a bad one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readReviewDay('?view=home&today=2026-12-04', localStorage)).toBe('2026-12-04')
    expect(localStorage.getItem(REVIEW_TODAY_KEY)).toBe('2026-12-04')
    expect(readReviewDay('?view=spending', localStorage)).toBe('2026-12-04')
    expect(readReviewDay('?today=soon', localStorage)).toBe('2026-12-04')
    expect(warn).toHaveBeenCalledOnce()
    expect(readReviewDay('?today=', localStorage)).toBeNull()
    expect(localStorage.getItem(REVIEW_TODAY_KEY)).toBeNull()
  })

  it('shifts new Date() and Date.now() to the day at the current time of day, and leaves dated Dates alone', () => {
    const now = new RealDate(2026, 10, 23, 14, 30, 5)
    const ReviewDate = shiftedDate(RealDate, reviewOffset('2026-12-04', now))
    vi.spyOn(RealDate, 'now').mockReturnValue(now.getTime())
    const today = new ReviewDate()
    expect([today.getFullYear(), today.getMonth(), today.getDate(), today.getHours(), today.getMinutes()]).toEqual([2026, 11, 4, 14, 30])
    expect(today).toBeInstanceOf(RealDate)
    expect(ReviewDate.now()).toBe(today.getTime())
    expect(new ReviewDate('2026-11-01T00:00:00Z').toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(new ReviewDate(2026, 0, 2).getDate()).toBe(2)
    expect(ReviewDate.UTC(2026, 0, 1)).toBe(RealDate.UTC(2026, 0, 1))
  })

  it('labels the day, with the year only when it differs', () => {
    expect(reviewDayLabel('2026-12-04', 2026)).toBe('Fri 4 Dec')
    expect(reviewDayLabel('2027-01-04', 2026)).toBe('Mon 4 Jan 2027')
  })

  it('starts: takes ?today= out of the address, shifts Date and shows the chip', () => {
    window.history.replaceState(null, '', '/?view=home&today=2026-12-04')
    startReviewClock(window)
    expect(window.location.search).toBe('?view=home')
    expect(isoDay(new Date())).toBe('2026-12-04')
    expect(document.querySelector('.review-clock')).toHaveTextContent('Review date: Fri 4 Dec · Clear')
  })

  it('stays off with nothing stored', () => {
    startReviewClock(window)
    expect(globalThis.Date).toBe(RealDate)
    expect(document.querySelector('.review-clock')).toBeNull()
  })

  it('is off without --mode localonly, even with a day stored', async () => {
    localStorage.setItem(REVIEW_TODAY_KEY, '2026-12-04')
    await import('./reviewClock')
    expect(globalThis.Date).toBe(RealDate)
    expect(document.querySelector('.review-clock')).toBeNull()
  })

  it('is on in --mode localonly', async () => {
    localStorage.setItem(REVIEW_TODAY_KEY, '2026-12-04')
    vi.stubEnv('MODE', 'localonly')
    await import('./reviewClock')
    expect(isoDay(new Date())).toBe('2026-12-04')
    expect(document.querySelector('.review-clock')).not.toBeNull()
  })
})
