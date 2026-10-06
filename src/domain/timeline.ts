export interface YearPeriod { startYear: number; endYear: number }
/** Annual periods are start-inclusive and end-exclusive. */
export function activeInYear(period: YearPeriod, year: number): boolean {
  return year >= period.startYear && year < period.endYear
}
export function validPeriod(period: YearPeriod): boolean {
  return Number.isInteger(period.startYear) && Number.isInteger(period.endYear)
    && period.startYear >= 1900 && period.endYear <= 9999 && period.endYear > period.startYear
}
export function nonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 100
}
export function fraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}
