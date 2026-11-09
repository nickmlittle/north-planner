import type { ImpactResult } from '../domain/budgetImpact'
import type { BudgetDocument } from '../domain/budgetDocument'
import { balanceLabel, formatGBP } from '../formatting/money'

const money = (pence: number) => `${pence < 0 ? '−' : ''}${formatGBP(Math.abs(pence) / 100)}`

/**
 * The consequence of a change, always placed directly above the button that commits it.
 * Without a result it is just the scope sentence; with one it adds the balance change and
 * per-person and per-account funding; on error it offers a retry.
 */
export function ImpactPreview({ scopeText, scopeId, result, document, label = 'Before saving', compact = false, onRetry }: {
  scopeText: string
  scopeId?: string
  result?: ImpactResult
  document: BudgetDocument
  label?: string
  compact?: boolean
  onRetry?: () => void
}) {
  const scope = <p id={scopeId} className="budget-impact-scope">{scopeText}</p>
  if (!result) return <div className={`budget-impact-plain${compact ? ' budget-impact-compact' : ''}`}>{scope}</div>
  if ('error' in result) return <div className={`budget-impact-plain${compact ? ' budget-impact-compact' : ''}`}>{scope}<p role="alert" className="budget-impact-error">{result.error}{onRetry && <> <button type="button" className="text-button" onClick={onRetry}>Retry</button></>}</p></div>
  const { impact } = result
  const people = impact.people.filter(person => person.beforePence !== person.afterPence)
  return <section className={`budget-impact${compact ? ' budget-impact-compact' : ''}`} aria-label="Impact preview">
    {!compact && <strong>{label}</strong>}
    {scope}
    <p>{balanceLabel(impact.beforeBalancePence)} → <strong>{balanceLabel(impact.afterBalancePence)}</strong></p>
    {impact.incomplete && <p>Some items can’t be funded yet.</p>}
    {(people.length > 0 || impact.accounts.length > 0) && <details><summary>Funding changes</summary>
      <div className="budget-impact-changes">
        {people.map(person => <p key={person.personId}>{document.household.adults.find(row => row.id === person.personId)?.name ?? 'Person'}: {money(person.beforePence)} → {money(person.afterPence)}</p>)}
        {impact.accounts.map(account => <p key={account.accountId}>{document.budget.accounts.find(row => row.id === account.accountId)?.name ?? 'Account'}: {money(account.beforePence)} → {money(account.afterPence)}</p>)}
      </div>
    </details>}
  </section>
}
