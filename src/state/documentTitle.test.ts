import { expect, it } from 'vitest'
import { newBudgetDocument } from '../domain/budgetDocument'
import { documentTitle } from './documentTitle'
import { parseNavigation } from './navigation'

const document = newBudgetDocument()
document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' } as never]
const title = (search: string) => documentTitle(parseNavigation(search), document)

it('names the screen, and the month where the screen follows it', () => {
  expect(title('?view=home&month=2026-11')).toBe('Home · North')
  expect(title('?view=month&month=2026-11')).toBe('Month · November 2026 · North')
  expect(title('?view=plan&month=2026-11')).toBe('Plan · November 2026 · North')
  expect(title('?view=spending')).toBe('Spending · North')
  expect(title('?view=settings&section=cards')).toBe('Settings · North')
})

it('names a pot, a statement and Close <Month> by themselves', () => {
  expect(title('?view=month&month=2026-11&pot=groceries')).toBe('Groceries · November 2026 · North')
  expect(title('?view=month&month=2026-10&close=1')).toBe('Close October · October 2026 · North')
  expect(title('?view=spending&section=statements&statement=amex%3A2026-10-24')).toBe('October statement · North')
  expect(documentTitle(parseNavigation('?view=plan'), document, false)).toBe('Set up · North')
})
