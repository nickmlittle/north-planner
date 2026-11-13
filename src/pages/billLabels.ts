import type { BillDay, RemindWeeks } from '../domain/monthlyBudget'
import { ordinal } from './cardLabels'

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A monthly bill's day: "the 3rd each month", "the last day of each month". */
export function monthlyBillDay(day: BillDay): string {
  return day === 'last' ? 'the last day of each month' : `the ${ordinal(day)} each month`
}

/** A yearly bill's date: "3 March", "the last day of February". */
export function yearlyBillDate(day: BillDay, month: number): string {
  const name = MONTH_NAMES[month - 1] ?? ''
  return day === 'last' ? `the last day of ${name}` : `${day}\u00a0${name}`
}

/** The Remind me choices, in the order shown. */
export function remindLabel(weeks: RemindWeeks): string {
  return weeks === 0 ? 'Don’t remind me' : `${weeks} weeks before`
}
