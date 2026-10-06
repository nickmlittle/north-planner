import type { IncomePeriod } from '../domain/income'
import { validateIncome } from '../domain/income'
import type { Household } from '../domain/models'
import { newIncomePeriod } from '../config/defaultIncome'
import { NumericInput } from './NumericInput'
import { grossIncome } from '../engine/income'
import { formatGBP } from '../formatting/money'

export function IncomeInputs({ household, value, onChange }: { household: Household; value: IncomePeriod[]; onChange: (value: IncomePeriod[]) => void }) {
  function update(id: string, patch: Partial<IncomePeriod>) {
    const next = value.map(p => p.id === id ? { ...p, ...patch } : p)
    const error = validateIncome(next)
    if (!error) onChange(next)
    return error
  }
  return <section className="household-card"><h2>Income timeline</h2>
    <p>Real 2026 GBP. Start year included, end year excluded. Replacement work uses sequential periods. Working fraction 0.6 represents 3 of 5 days. Inside-IR35 day rate is gross taxable worker pay before employee deductions; assignment-rate employer costs are excluded.</p>
    {value.length === 0 && <p>No earnings configured. Add a period for each adult.</p>}
    {household.people.map(person => <div key={person.id}><h3>{person.name}</h3>
      {value.filter(p => p.personId === person.id).map(p => <fieldset key={p.id}><legend>Income period</legend>
        <label>Income type <select value={p.kind} onChange={event => update(p.id, { kind: event.target.value as IncomePeriod['kind'] })}>
          <option value="paye">PAYE</option><option value="inside-ir35">Inside IR35</option>
        </select></label>
        <div className="input-grid">
          {([['startYear', 'Start year'], ['endYear', 'End year'], ...(p.kind === 'paye' ? [['annualSalary', 'Annual salary (GBP)']] : [['dayRate', 'Day rate (GBP)'], ['billableDays', 'Billable days']]), ['workingFraction', 'Working fraction']] as [keyof Pick<IncomePeriod, 'startYear' | 'endYear' | 'annualSalary' | 'dayRate' | 'billableDays' | 'workingFraction'>, string][]).map(([key, label]) => <NumericInput key={key} label={`${person.name} ${label}`} value={p[key]} onChange={number => update(p.id, { [key]: number })} />)}
          <label><input type="checkbox" checked={p.annualGrossOverride !== null} onChange={event => update(p.id, { annualGrossOverride: event.target.checked ? 0 : null })} /> Override annual gross income</label>
          {p.annualGrossOverride !== null && <NumericInput label={`${person.name} Gross override (GBP)`} value={p.annualGrossOverride} onChange={number => update(p.id, { annualGrossOverride: number })} />}
        </div>
        <button type="button" onClick={() => onChange(value.filter(period => period.id !== p.id))}>Remove period</button>
      </fieldset>)}
      <button type="button" onClick={() => {
        const lastEnd = Math.max(household.assumptions.startYear, ...value.filter(p => p.personId === person.id).map(p => p.endYear))
        onChange([...value, newIncomePeriod(person.id, lastEnd)])
      }}>Add {person.name} income period</button>
      <p>Base-year gross income: {formatGBP(grossIncome(value, person.id, household.assumptions.startYear))}</p>
    </div>)}
  </section>
}
