import type { BudgetDocument } from '../domain/budgetDocument'
import { localDate, type CardTransaction } from '../domain/cardTracker'
import { formatGBP } from '../formatting/money'
import { dayDate } from './cardLabels'

export const pounds = (pence: number) => formatGBP(pence / 100)
/** "£62.40", or "−£24.99" for a refund. */
export const signedPounds = (pence: number) => pence < 0 ? `−${pounds(-pence)}` : pounds(pence)
export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`

/** "Ada ··41001": whose card, by its ending. */
export function cardLabel(document: Pick<BudgetDocument, 'household'>, transaction: Pick<CardTransaction, 'personId' | 'cardSuffix'>): string {
  const name = document.household.adults.find(person => person.id === transaction.personId)?.name
  return `${name ?? 'Card'} ··${transaction.cardSuffix}`
}

/** "Sun 8 Nov · Ada ··41001". */
export const transactionMeta = (document: Pick<BudgetDocument, 'household'>, transaction: CardTransaction) => `${dayDate(transaction.date)} · ${cardLabel(document, transaction)}`

/** "Mon 9 Nov" for an ISO time, on the device's calendar. */
export const dayOf = (iso: string) => dayDate(localDate(new Date(iso)))
