import { useMemo } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { transactionsToSort } from '../domain/cardSorting'
import { cardTracker, monthOf, localDate } from '../domain/cardTracker'
import { homeCount, homeInbox } from '../domain/homeInbox'

/** The numbers beside the nav's destinations. Home: its To do rows (heads-ups included). Spending: transactions to sort. */
export type NavCounts = { home?: number; spending?: number }

export function navCounts(document: BudgetDocument, today = localDate()): NavCounts {
  const toSort = transactionsToSort(cardTracker(document)).length
  const home = document.workflow.setupComplete ? homeCount(homeInbox(document, { month: monthOf(today), today })) : 0
  return { ...home ? { home } : {}, ...toSort ? { spending: toSort } : {} }
}

export function useNavCounts(document: BudgetDocument): NavCounts {
  return useMemo(() => navCounts(document), [document])
}
