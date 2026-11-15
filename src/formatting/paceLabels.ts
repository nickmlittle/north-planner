import type { DestinationSpending, LookReason, MonthSpending } from '../domain/cardSpending'
import { dayDate } from './date'
import { formatGBP, formatGBPWhole } from './money'
import { formatMonth } from './month'

/**
 * Pace in words, one way everywhere (Spending ↔ Month link, design rule 4): Month's pots, Needs a look, Home's
 * heads-up and Spending's "so far" chips all say "£102 ahead", "runs out ~Sat 21 Nov", "£203.82 over" and
 * "covered when November closes" from here.
 */

const pounds = (pence: number) => formatGBP(pence / 100)
const monthName = (month: string) => formatMonth(month).split(' ')[0]!

/** "£102 ahead": whole pounds, because a pace gap is an estimate. */
export const aheadText = (pence: number) => `${formatGBPWhole(Math.round(pence / 100))} ahead`
/** "£203.82 over": to the penny, because it's money already spent. */
export const overText = (pence: number) => `${pounds(pence)} over`
/** "runs out ~Sat 21 Nov". */
export const runsOutText = (date: string) => `runs out ~${dayDate(date)}`
/** "covered when November closes": a current month's overspend is covered at Close (§6.10). */
export const coveredText = (month: string) => `covered when ${monthName(month)} closes`

/** The headline for a pot over or ahead of pace: "£203.82 over", "£102 ahead"; else "On track". */
export function paceHeadline(row: Pick<DestinationSpending, 'status' | 'leftPence' | 'aheadPence'>): string {
  if (row.status === 'over') return overText(-row.leftPence)
  if (row.status === 'ahead') return aheadText(row.aheadPence ?? 0)
  return 'On track'
}

/** What follows the headline: "runs out ~Sat 21 Nov", or "covered when November closes" this month. */
export function paceDetail(row: Pick<DestinationSpending, 'status' | 'runsOut'>, figures: Pick<MonthSpending, 'month' | 'when'>): string {
  if (row.status === 'over') return figures.when === 'current' ? coveredText(figures.month) : ''
  if (row.status === 'ahead' && row.runsOut) return runsOutText(row.runsOut)
  return ''
}

/** "£102 ahead · runs out ~Sat 21 Nov", "£203.82 over · covered when November closes", "On track". */
export const paceStatus = (row: Pick<DestinationSpending, 'status' | 'leftPence' | 'aheadPence' | 'runsOut'>, figures: Pick<MonthSpending, 'month' | 'when'>) =>
  [paceHeadline(row), paceDetail(row, figures)].filter(Boolean).join(' · ')

/** Why a pot needs a look: "Mostly Tesco £303.38", or "Biggest: AIRBNB £380.00". */
export const reasonText = (reason: LookReason) => reason.kind === 'mostly' ? `Mostly ${reason.name} ${pounds(reason.pence)}` : `Biggest: ${reason.name} ${pounds(reason.pence)}`

/** Sentence case for the start of a line: "Runs out ~Sat 21 Nov". */
export const capitalise = (text: string) => text ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text
