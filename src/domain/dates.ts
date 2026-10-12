export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Fraction of a calendar year from an inclusive start-of-day date. */
export function remainingYearFraction(date: string): number {
  if (!isISODate(date)) throw new Error('Enter a valid calendar date.')
  const year = Number(date.slice(0, 4))
  const start = Date.UTC(year, 0, 1)
  const startDay = Date.UTC(year, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  const daysInYear = (Date.UTC(year + 1, 0, 1) - start) / 86400000
  return (daysInYear - (startDay - start) / 86400000) / daysInYear
}

/** The first day an observation can affect a projection is the day after its as-of cutoff. */
export function remainingAfterObservationFraction(planningDate: string, asOfDate: string | null): number {
  if (!isISODate(planningDate) || (asOfDate !== null && !isISODate(asOfDate))) throw new Error('Enter valid planning and balance dates.')
  const first = asOfDate && asOfDate >= planningDate ? new Date(`${asOfDate}T00:00:00Z`).getTime() + 86400000 : new Date(`${planningDate}T00:00:00Z`).getTime()
  const year = Number(planningDate.slice(0, 4)); const yearEnd = Date.UTC(year + 1, 0, 1)
  if (first >= yearEnd) return 0
  const daysInYear = (yearEnd - Date.UTC(year, 0, 1)) / 86400000
  return (yearEnd - first) / 86400000 / daysInYear
}
