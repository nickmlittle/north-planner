// The review clock: lets a local review stage any day (waiting build plan §4.1, WP1).
// In `--mode localonly` only, `?today=2026-12-04` stores that day and `Date` reads it at the
// current time of day, so Chrome and Device Hub can open Close on 4 Dec or settle up on 18 Dec.
// `?today=` with no date clears it. A pine chip shows while it's set.
// The install at the bottom sits behind a static mode check, so a production build drops this
// whole module; `scripts/check-review-clock.mjs` fails the build if any of it survives.
import { dayDate } from './formatting/date'

export const REVIEW_TODAY_KEY = 'north.review.today'

/** True for a real calendar day written YYYY-MM-DD. */
export function isReviewDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Applies `?today=` to storage (a day sets it, an empty value clears it) and returns the review day, if any. */
export function readReviewDay(search: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): string | null {
  const param = new URLSearchParams(search).get('today')
  try {
    if (param === '') storage.removeItem(REVIEW_TODAY_KEY)
    else if (param !== null && isReviewDay(param)) storage.setItem(REVIEW_TODAY_KEY, param)
    else if (param !== null) console.warn(`Review clock: "${param}" isn't a day. Use ?today=YYYY-MM-DD, or ?today= to clear it.`)
    const stored = storage.getItem(REVIEW_TODAY_KEY)
    return stored && isReviewDay(stored) ? stored : null
  } catch {
    return null
  }
}

/** Milliseconds from `now` to the same time of day on `day`, in local time. */
export function reviewOffset(day: string, now: Date): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const target = new Date(year, month - 1, date, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  return target.getTime() - now.getTime()
}

/** A Date whose `new Date()` and `Date.now()` run `offset` ms from the real clock. Dates built from arguments are unchanged. */
export function shiftedDate(RealDate: DateConstructor, offset: number): DateConstructor {
  class ReviewDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset)
      else super(...(args as unknown as ConstructorParameters<DateConstructor>))
    }
    static override now() { return RealDate.now() + offset }
  }
  return ReviewDate as DateConstructor
}

/** "Fri 4 Dec", with the year when it isn't this (real) year. */
export function reviewDayLabel(day: string, realYear: number): string {
  return Number(day.slice(0, 4)) === realYear ? dayDate(day) : `${dayDate(day)} ${day.slice(0, 4)}`
}

// Bottom left past the sidebar on desktop; above the bottom nav on phone, clear of the header's
// buttons and the home indicator. Over the nav (80) and under sheets (1400), so it never covers a sheet's footer.
const chipStyles = `
.review-clock{position:fixed;z-index:85;bottom:var(--space-4);left:calc(68px + var(--space-4));display:flex;align-items:center;gap:var(--space-1);max-width:calc(100vw - 32px);box-sizing:border-box;padding:0 var(--space-1) 0 var(--space-3);border:1px solid var(--on-pine-strong);border-radius:var(--radius-pill);background:var(--pine);color:var(--cream);box-shadow:var(--shadow-pop);font-size:var(--text-sm);font-weight:var(--weight-medium);line-height:1.2;white-space:nowrap}
.review-clock button{--ring:var(--focus-on-pine);min-height:32px;margin:0;padding:0 var(--space-2);border:0;border-radius:var(--radius-pill);background:transparent;color:var(--cream);font:inherit;font-weight:var(--weight-bold);text-decoration:underline;cursor:pointer}
.review-clock button:hover{background:var(--on-pine-hover)}
@media (max-width:767px){.review-clock{bottom:calc(60px + env(safe-area-inset-bottom,0px) + var(--space-2));left:50%;transform:translateX(-50%)}}
@media print{.review-clock{display:none}}`

/** Reads `?today=`, takes it out of the address, shifts `Date`, and shows the chip. */
export function startReviewClock(win: Window & typeof globalThis): void {
  const day = readReviewDay(win.location.search, win.localStorage)
  const url = new URL(win.location.href)
  if (url.searchParams.has('today')) {
    url.searchParams.delete('today')
    win.history.replaceState(win.history.state, '', url)
  }
  if (!day) return
  const RealDate = win.Date
  win.Date = shiftedDate(RealDate, reviewOffset(day, new RealDate()))

  const doc = win.document
  const style = doc.createElement('style')
  style.textContent = chipStyles
  doc.head.append(style)
  const chip = doc.createElement('div')
  chip.className = 'review-clock'
  chip.append(`Review date: ${reviewDayLabel(day, new RealDate().getFullYear())} · `)
  const clear = doc.createElement('button')
  clear.type = 'button'
  clear.textContent = 'Clear'
  clear.setAttribute('aria-label', 'Clear the review date')
  clear.addEventListener('click', () => {
    try { win.localStorage.removeItem(REVIEW_TODAY_KEY) } catch { /* storage blocked: nothing was stored */ }
    win.location.reload()
  })
  chip.append(clear)
  doc.body.append(chip)
}

if (import.meta.env.MODE === 'localonly') startReviewClock(window)
