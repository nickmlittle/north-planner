import type { BudgetDocument } from './budgetDocument'
import type { budgetTransfers } from './budgetTransfers'
import { dayDate } from '../formatting/date'
import { formatGBP } from '../formatting/money'
import { moneyArrives } from './workingDays'
import type { TransferAccount } from './personTransfers'

type Transfers = Pick<ReturnType<typeof budgetTransfers>, 'availablePence' | 'plannedPence' | 'people'>

/** One person's pay for a month: what it is, when it arrives, and whether it already has. */
export type Arrival = { personId: string; pence: number; date: string; landed: boolean }

/**
 * What has landed for a month (D10, P6): each person's pay and the day it arrives, the working day before their
 * payday in the month before. Someone with several salaries has landed once the last one has; someone with no salary
 * date (or no pay) has no row. Ordered by date, then household order.
 */
export function paydayArrivals(document: Pick<BudgetDocument, 'budget' | 'household'>, transfers: Pick<Transfers, 'people'>, month: string, today: string): Arrival[] {
  const adults = document.household.adults.map(person => person.id)
  return transfers.people.flatMap(person => {
    const dates = document.budget.incomeSources.filter(source => source.type === 'employment' && source.payday && source.personId === person.personId).map(source => moneyArrives(month, source.payday!))
    const date = dates.sort().at(-1)
    return date && person.availablePence > 0 ? [{ personId: person.personId, pence: person.availablePence, date, landed: date <= today }] : []
  }).sort((a, b) => a.date.localeCompare(b.date) || adults.indexOf(a.personId) - adults.indexOf(b.personId))
}

/** Where a month's money went: each account that gets any, with its pots (a pot's amount is what it starts the month with). */
export type WentRow = { accountId: string; amountPence: number; parts: Array<{ potId?: string; amountPence: number }> }
export type PaydayWent = { totalPence: number; rows: WentRow[]; unassignedPence: number }

/** The Done view's figures (D8): the household total, where it went by account and pot, and what's left unassigned. */
export function paydayWent(accounts: readonly TransferAccount[], transfers: Pick<Transfers, 'availablePence' | 'plannedPence'>): PaydayWent {
  const rows = accounts.filter(account => account.amountPence > 0).map(account => ({
    accountId: account.accountId, amountPence: account.amountPence,
    parts: [...account.pots.filter(pot => pot.amountPence > 0).map(pot => ({ potId: pot.potId, amountPence: pot.amountPence })), ...account.directAmountPence > 0 ? [{ amountPence: account.directAmountPence }] : []],
  }))
  return { totalPence: transfers.availablePence, rows, unassignedPence: Math.max(transfers.availablePence - transfers.plannedPence, 0) }
}

/**
 * "£7,700.00 in all · Ada’s £4,200.00 landed Fri 27 Nov · Ben’s £3,500.00 lands Mon 30 Nov": what has landed and what
 * hasn't, for Home's fund row and payday card. One person's pay reads without their name.
 */
export function landedText(arrivals: readonly Arrival[], totalPence: number, nameOf: (personId: string) => string): string {
  if (!arrivals.length) return ''
  const pounds = (pence: number) => formatGBP(pence / 100)
  const each = arrivals.map(row => `${arrivals.length > 1 ? `${nameOf(row.personId)}’s ` : ''}${pounds(row.pence)} ${row.landed ? 'landed' : 'lands'} ${dayDate(row.date)}`)
  return [...arrivals.length > 1 ? [`${pounds(totalPence)} in all`] : [], ...each].join(' · ')
}
