import type { Household } from '../domain/models'
import type { IncomePeriod } from '../domain/income'
import type { TaxRules } from '../domain/tax'
import { grossIncome } from '../engine/income'
import { estimateTax } from '../engine/tax'
import { formatGBP } from '../formatting/money'

export function IncomeSummary({ household, income, tax }: { household: Household; income: IncomePeriod[]; tax: TaxRules }) {
  return <section className="household-card"><h2>Base-year income estimates</h2>
    {household.people.map(person => {
      const gross = grossIncome(income, person.id, household.assumptions.startYear)
      const estimate = estimateTax(gross, tax)
      return <p key={person.id}>{person.name}: gross {formatGBP(gross)}, income tax {formatGBP(estimate.tax)}, employee NI {formatGBP(estimate.ni)}, take-home estimate {formatGBP(estimate.takeHome)}.</p>
    })}
  </section>
}
