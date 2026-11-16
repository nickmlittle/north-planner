import type { DestinationSpending, LookReason, MonthSpending, PlacedPace } from '../domain/cardSpending'
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

// ——— Sorting (Spending ↔ Month link F5): the picker, the impact line and the toast ———

const leftText = (pence: number) => pence < 0 ? overText(-pence) : `${pounds(pence)} left`
const freeText = (pence: number) => `${pence < 0 ? '−' : ''}${pounds(Math.abs(pence))} free`

/**
 * A pot option's suffix in the picker: "£130.00 left · £110 ahead", "£150.00 over", "£130.00 left", "nothing planned".
 * Carry-over pots show what's free once their balance is checked ("£80.00 free"), else nothing. Funded only and Saving
 * pots have no Left, so they say what they are.
 */
export function optionPaceText(row: Pick<DestinationSpending, 'destination' | 'status' | 'leftPence' | 'aheadPence' | 'carriesOver'> | undefined, freePence?: number): string {
  if (!row) return freePence === undefined ? '' : freeText(freePence)
  if (row.carriesOver) return freePence === undefined ? '' : freeText(freePence)
  if (row.destination.kind === 'account') return ''
  if (row.status === 'funded') return 'Funded only'
  if (row.status === 'saving') return 'Saving'
  if (row.status === 'one-offs') return 'nothing planned'
  if (row.status === 'over') return overText(-row.leftPence)
  return row.status === 'ahead' ? `${leftText(row.leftPence)} · ${aheadText(row.aheadPence ?? 0)}` : leftText(row.leftPence)
}

/** A pot's state on one side of the arrow: "On track", "£110 ahead", "£150.00 over", or "£130.00 left" without pace. */
const stateText = (row: Pick<DestinationSpending, 'status' | 'leftPence' | 'aheadPence'>) => row.status === 'left' ? leftText(row.leftPence) : paceHeadline(row)

/**
 * What placing a transaction would change, before it's placed: "Groceries: On track → £110 ahead · runs out ~Fri 20 Nov",
 * "Groceries: £130.00 left → £80.00 left" when the pace doesn't move, "Spending has nothing planned in November" for a
 * pot with no plan. Nothing for an account, or when it's already there.
 */
export function impactText(name: string, impact: PlacedPace): string {
  const { before, after, figures } = impact
  if (impact.same || impact.destination.kind === 'account') return ''
  if (impact.freeBefore !== undefined && impact.freeAfter !== undefined) return `${name}: ${freeText(impact.freeBefore)} → ${freeText(impact.freeAfter)}`
  if (!after || after.carriesOver || after.status === 'funded' || after.status === 'saving') return ''
  if (after.status === 'one-offs') return `${name} has nothing planned in ${monthName(figures.month)}`
  const leftBefore = before ? before.leftPence : after.plannedPence - after.takenPence
  let from = before && before.status !== 'one-offs' ? stateText(before) : leftText(leftBefore)
  let to = stateText(after)
  // The pace doesn't move ("On track → On track"): show what's left instead.
  if (from === to) { from = leftText(leftBefore); to = leftText(after.leftPence) }
  return `${name}: ${from} → ${[to, paceDetail(after, figures)].filter(Boolean).join(' · ')}`
}

/** The impact line's tone: warning once ahead, critical once over. */
export const impactTone = (impact: PlacedPace): 'warning' | 'critical' | undefined => impact.after?.status === 'over' ? 'critical' : impact.after?.status === 'ahead' ? 'warning' : undefined

/** The toast when placing tips a pot: "Groceries is now £110 ahead of pace", "Groceries is now £150.00 over". */
export function tippedText(name: string, impact: PlacedPace): string {
  const after = impact.after
  if (!impact.tipped || !after) return ''
  return after.status === 'over' ? `${name} is now ${overText(-after.leftPence)}` : `${name} is now ${aheadText(after.aheadPence ?? 0)} of pace`
}
