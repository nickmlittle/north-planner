import type { BudgetImpact } from '../domain/budgetImpact'
import type { BudgetDocument } from '../domain/budgetDocument'
import { formatGBP } from '../formatting/money'
import { formatEditScope } from '../formatting/month'

const money = (pence: number) => `${pence < 0 ? '−' : ''}${formatGBP(Math.abs(pence) / 100)}`
export function BudgetImpactSummary({ impact, document, compact = false }: { impact: BudgetImpact; document: BudgetDocument; compact?: boolean }) {
  const people = impact.people.filter(person => person.beforePence !== person.afterPence)
  return <section className={`budget-impact${compact ? ' budget-impact-compact' : ''}`} aria-label="Impact preview">
    <strong>Before saving</strong>
    <p>Applies: {formatEditScope(impact.scope)}.</p>
    <p>Budget balance: {money(impact.beforeBalancePence)} → <strong>{money(impact.afterBalancePence)}</strong>{impact.beforeBalancePence >= 0 && impact.afterBalancePence < 0 ? ' · Creates a shortfall' : impact.beforeBalancePence < 0 && impact.afterBalancePence >= 0 ? ' · Resolves the shortfall' : ''}</p>
    {impact.incomplete && <p>Some contributions cannot be allocated yet. Add employment income or complete funding details to see them in Transfers.</p>}
    {(people.length > 0 || impact.accounts.length > 0) && <details><summary>Contribution and destination changes</summary>
      {people.map(person => <p key={person.personId}>{document.household.adults.find(row => row.id === person.personId)?.name ?? 'Person'}: {money(person.beforePence)} → {money(person.afterPence)}</p>)}
      {impact.accounts.map(account => <p key={account.accountId}>{document.budget.accounts.find(row => row.id === account.accountId)?.name ?? 'Account'}: {money(account.beforePence)} → {money(account.afterPence)}</p>)}
    </details>}
  </section>
}
