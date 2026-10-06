import type { Household } from '../domain/models'
import type { IncomePeriod } from '../domain/income'
import type { TaxRules } from '../domain/tax'
import { employmentCashFlow } from '../engine/employment'
import type { ReturnAssumptions } from '../domain/planning'
import { formatGBP } from '../formatting/money'

export function IncomeSummary({ household, income, tax, planning }: { household: Household; income: IncomePeriod[]; tax: TaxRules; planning: ReturnAssumptions }) {
  return <section className="household-card"><h2>Base-year income estimates</h2><p>Pension rates apply to gross pay. Relief-at-source assumes 20% provider relief and full additional relief claimed in-year. Pension annual/tapered allowances and minimum-wage limits are not enforced.</p>
    {household.people.map(person => {
      const estimate = employmentCashFlow(income, person.id, household.assumptions.startYear, household.assumptions.startYear - (person.birthYear ?? household.assumptions.startYear), person.targetFireAge ?? planning.fireAge, tax)
      return <p key={person.id}>{person.name}: gross {formatGBP(estimate.gross)}, income tax {formatGBP(estimate.tax)}, employee NI {formatGBP(estimate.ni)}, take-home estimate {formatGBP(estimate.disposable)}, annual pension contributions {formatGBP(estimate.totalPension)} (employee {formatGBP(estimate.employee)}, employer {formatGBP(estimate.employer)}).</p>
    })}
  </section>
}
