import type { MonthEditScope } from '../domain/monthlyBudget'

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatMonth(month: string): string {
  return `${monthNames[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
}

export function formatEditScope(scope: MonthEditScope): string {
  const from = formatMonth(scope.fromMonth)
  if (!scope.throughMonth) return `${from} onward`
  return scope.throughMonth === scope.fromMonth ? from : `${from}–${formatMonth(scope.throughMonth)}`
}
