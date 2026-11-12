import type { BudgetDocument } from '../domain/budgetDocument'
import { parseStatementKey } from '../domain/cardTracker'
import { formatMonth } from '../formatting/month'
import type { NavigationState } from './navigation'

/**
 * The browser tab's title (plan §2.1): "<Screen> · <Month> · North" where the screen follows the selected month,
 * "<Screen> · North" where it doesn't. A pot or statement page names itself: "Groceries · November 2026 · North".
 */
export function documentTitle(navigation: NavigationState, document: Pick<BudgetDocument, 'budget'>, setupComplete = true): string {
  if (!setupComplete) return 'Set up · North'
  const month = formatMonth(navigation.month)
  if (navigation.view === 'month') {
    const pot = navigation.pot ? document.budget.pots.find(row => row.id === navigation.pot)?.name : undefined
    return `${pot ?? (navigation.close ? `Close ${month.split(' ')[0]}` : 'Month')} · ${month} · North`
  }
  if (navigation.view === 'plan') return `Plan · ${month} · North`
  if (navigation.view === 'spending') {
    const closeDate = navigation.statement ? parseStatementKey(navigation.statement)?.closeDate : undefined
    return closeDate ? `${formatMonth(closeDate.slice(0, 7)).split(' ')[0]} statement · North` : 'Spending · North'
  }
  return navigation.view === 'settings' ? 'Settings · North' : 'Home · North'
}
