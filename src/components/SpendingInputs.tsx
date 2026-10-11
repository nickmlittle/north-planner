import { useState } from 'react'
import type { SpendingPlan } from '../domain/spending'
import { validateSpending } from '../domain/spending'
import { lifestyleSpending, lifestyleSurplus } from '../engine/spending'
import { NumericInput } from './NumericInput'
import { formatGBP } from '../formatting/money'

export function SpendingInputs({ value, onChange, year, disposable }: { value: SpendingPlan; onChange: (value: SpendingPlan) => void; year: number; disposable: number }) {
  const [error, setError] = useState<string>()
  function apply(next: SpendingPlan) {
    const error = validateSpending(next)
    setError(error)
    if (!error) onChange(next)
    return error
  }
  return <section className="household-card"><h2>Lifestyle spending</h2>
    <p>Real 2026 GBP, excluding mortgage, tax and child costs. An explicit zero baseline is included as entered.</p>
    <NumericInput label="Annual baseline lifestyle spending (GBP)" value={value.baseline} onChange={n => apply({ ...value, baseline: n })} />
    {value.events.map(event => <fieldset key={event.id}><legend>{event.name}</legend>
      <div className="input-grid">{([['startYear', 'Start year'], ['endYear', 'End year'], ['annualChange', 'Annual spending change (GBP)']] as const).map(([key, label]) => <NumericInput key={key} label={label} value={event[key]} onChange={n => apply({ ...value, events: value.events.map(e => e.id === event.id ? { ...e, [key]: n } : e) })} />)}</div>
      <label><input type="checkbox" checked={event.enabled} onChange={e => apply({ ...value, events: value.events.map(item => item.id === event.id ? { ...item, enabled: e.target.checked } : item) })} /> Include spending event</label>
      <button type="button" onClick={() => apply({ ...value, events: value.events.filter(e => e.id !== event.id) })}>Remove spending event</button>
    </fieldset>)}
    <button type="button" onClick={() => apply({ ...value, events: [...value.events, { id: crypto.randomUUID(), name: `Spending event ${value.events.length + 1}`, startYear: year, endYear: year + 1, annualChange: 0, enabled: true }] })}>Add spending event</button>
    {error && <p role="alert">{error}</p>}
    <p>Base-year lifestyle: {formatGBP(lifestyleSpending(value, year))}; surplus before mortgage and child costs: {formatGBP(lifestyleSurplus(disposable, value, year))}.</p>
  </section>
}
