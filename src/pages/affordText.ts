import type { BudgetDocument } from '../domain/budgetDocument'
import { type AffordAnswer } from '../domain/afford'
import { cardTracker, monthOf } from '../domain/cardTracker'
import { monthSpending } from '../domain/cardSpending'
import { potKind } from '../domain/potKinds'
import { formatGBPWhole } from '../formatting/money'
import { formatMonth } from '../formatting/month'
import { dayDate } from '../formatting/date'
import { destinationNamer } from './cardLabels'
import { dayOf, plural, pounds } from './spendingFormat'

const whole = (pence: number) => formatGBPWhole(Math.round(pence / 100))
const monthName = (month: string) => formatMonth(month).split(' ')[0]!

/** "Monzo", from the pot's account; "the bank" when it has no provider. */
export function bankOf(document: BudgetDocument, potId: string) {
  const pot = document.budget.pots.find(row => row.id === potId)
  return document.budget.accounts.find(account => account.id === pot?.accountId)?.provider?.trim() || 'the bank'
}

/** What the answer says, as sentences: nothing is recorded. */
export function affordLines(document: BudgetDocument, answer: AffordAnswer, bank: string, month: string): { tone: 'yes' | 'over' | 'check'; lines: string[] } | null {
  if (answer.kind === 'not-offered') return null
  const overlap = answer.overlap && `This counts in ${monthName(answer.overlap.month)}. ${monthName(answer.overlap.nextMonth)}’s ${answer.overlap.potName} (${pounds(answer.overlap.nextPlannedPence)}) starts on ${dayDate(answer.overlap.startsOn)}.`
  if (answer.kind === 'funded-only') return { tone: 'check', lines: [`Check ${bank}: North only sees what goes on the Amex.`, ...answer.goesOnAmex ? ['If it goes on the Amex, it moves to the Amex pot at your next move.'] : [], ...overlap ? [overlap] : []] }
  const sorted = answer.toSort && `${answer.toSort.leftIfSortedPence < 0 ? `${pounds(-answer.toSort.leftIfSortedPence)} over` : `${pounds(answer.toSort.leftIfSortedPence)} left`} if the ${plural(answer.toSort.count, 'row')} to sort (${pounds(answer.toSort.pence)}) went here too.`
  if (answer.kind === 'over') return { tone: 'over', lines: [`${pounds(answer.overPence)} over.`, bufferLine(document, answer, month), ...sorted ? [sorted] : [], ...overlap ? [overlap] : []] }
  return { tone: 'yes', lines: [
    `Yes. ${pounds(answer.leftAfterPence)} left${answer.daysLeft > 0 ? ` for the last ${plural(answer.daysLeft, 'day')}` : ''}.`,
    ...answer.pace === 'ahead' ? [`About ${whole(answer.aheadPence!)} ahead of pace.`] : answer.pace === 'on-pace' ? ['Still on pace.'] : [],
    ...sorted ? [sorted] : [],
    ...overlap ? [overlap] : [],
  ] }
}

/** P9: the card's buffer covers an over pot when the month closes, if it has what's needed (checked, and less the other pots' overspends). */
function bufferLine(document: BudgetDocument, answer: Extract<AffordAnswer, { kind: 'over' }>, month: string): string {
  const buffer = answer.buffer
  if (!buffer) return `Covered when ${monthName(month)} closes.`
  const name = destinationNamer(document)(buffer.destination)
  if (buffer.balancePence === undefined) return `${name}, the buffer, isn’t checked yet, so North can’t say if it covers this. Check balances adds it.`
  const held = `${pounds(buffer.balancePence)}, checked ${dayOf(buffer.checkedAt!)}`
  const others = buffer.otherOverPence > 0 ? `, less ${pounds(buffer.otherOverPence)} for other pots that are over` : ''
  if (buffer.covers) return `${name}, the buffer, covers it when ${monthName(month)} closes (${held}${others}).`
  return `${name}, the buffer, is ${pounds(buffer.shortPence!)} short of covering it (${held}${others}). The rest can come from another pot or next month when ${monthName(month)} closes.`
}

/** The pots you can ask about: Tracked pots with a row this month, and Funded only pots. */
export function askable(document: BudgetDocument, today: string) {
  const figures = monthSpending(document, monthOf(today), today)
  return figures.rows.filter(row => row.destination.kind === 'pot' && (row.kind === 'tracked' || potKind(document, (row.destination as { potId: string }).potId) === 'funded-only'))
    .map(row => ({ potId: (row.destination as { potId: string }).potId, name: document.budget.pots.find(pot => pot.id === (row.destination as { potId: string }).potId)?.name ?? 'Pot', kind: row.kind }))
    .sort((a, b) => (a.kind === 'tracked' ? 0 : 1) - (b.kind === 'tracked' ? 0 : 1) || a.name.localeCompare(b.name, 'en-GB'))
}

/** Whether Home should offer "Can we afford…": there's something to ask about, and the card is set up for a month. */
export const canAskAfford = (document: BudgetDocument, today: string) => cardTracker(document).cards.length > 0 && askable(document, today).length > 0
