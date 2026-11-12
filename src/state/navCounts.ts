import { useMemo } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { transactionsToSort } from '../domain/cardSorting'
import { cardTracker } from '../domain/cardTracker'

/** The numbers beside the nav's destinations. Spending: transactions to sort. Home's open tasks join in audit 3 PR 10. */
export type NavCounts = { home?: number; spending?: number }

export function navCounts(document: BudgetDocument): NavCounts {
  const toSort = transactionsToSort(cardTracker(document)).length
  return toSort ? { spending: toSort } : {}
}

export function useNavCounts(document: BudgetDocument): NavCounts {
  return useMemo(() => navCounts(document), [document])
}
