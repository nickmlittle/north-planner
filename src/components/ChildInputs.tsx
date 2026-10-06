import { useState } from 'react'
import type { ChildEvent } from '../domain/children'
import { validateChildren } from '../domain/children'
import type { Person } from '../domain/models'
import { newChildEvent } from '../config/defaultChildren'
import { childEffects } from '../engine/children'
import { formatGBP } from '../formatting/money'
import { NumericInput } from './NumericInput'

export function ChildInputs({ value, onChange, year, people }: { value: ChildEvent[]; onChange: (value: ChildEvent[]) => void; year: number; people: Person[] }) {
  const [error, setError] = useState<string>()
  function apply(next: ChildEvent[]) {
    const error = validateChildren(next)
    setError(error)
    if (!error) onChange(next)
    return error
  }
  function update(id: string, patch: Partial<ChildEvent>) { return apply(value.map(c => c.id === id ? { ...c, ...patch } : c)) }
  return <section className="household-card"><h2>Child events</h2><p>Annual real 2026 GBP costs per child. Zero costs are unconfigured. Birth costs apply once; ages 0–18 include full years. Disabling a child also removes linked parental work changes.</p>
    {value.map((child, i) => <fieldset key={child.id}><legend>Child {i + 1}</legend>
      <label><input type="checkbox" checked={child.enabled} onChange={e => update(child.id, { enabled: e.target.checked })} /> Include child {i + 1}</label>
      <div className="input-grid">
        <NumericInput label="Birth year" value={child.birthYear} onChange={n => update(child.id, { birthYear: n })} />
        <NumericInput label="One-off baby cost (GBP)" value={child.birthCost} onChange={n => update(child.id, { birthCost: n })} />
        {([['ages0to2', 'Ages 0–2'], ['ages3to4', 'Ages 3–4'], ['ages5to11', 'Ages 5–11'], ['ages12to18', 'Ages 12–18']] as const).map(([key, label]) => <NumericInput key={key} label={`${label} annual cost (GBP)`} value={child.costs[key]} onChange={n => update(child.id, { costs: { ...child.costs, [key]: n } })} />)}
      </div>
      {child.workAdjustments.map(a => <fieldset key={a.id}><legend>Parental work change: {people.find(p => p.id === a.personId)?.name}</legend>
        <div className="input-grid">{([['startYear', 'Start year'], ['endYear', 'End year'], ['workingFraction', 'Working fraction (0 = leave, 0.6 = 3 days)']] as const).map(([key, label]) => <NumericInput key={key} label={label} value={a[key]} onChange={n => update(child.id, { workAdjustments: child.workAdjustments.map(item => item.id === a.id ? { ...item, [key]: n } : item) })} />)}</div>
        <button type="button" onClick={() => update(child.id, { workAdjustments: child.workAdjustments.filter(item => item.id !== a.id) })}>Remove work change</button>
      </fieldset>)}
      {people.map(p => <button type="button" key={p.id} onClick={() => update(child.id, { workAdjustments: [...child.workAdjustments, { id: crypto.randomUUID(), personId: p.id, startYear: child.birthYear, endYear: child.birthYear + 1, workingFraction: 1, annualGrossOverride: null }] })}>Add {p.name} parental work change</button>)}
      <button type="button" onClick={() => apply(value.filter(c => c.id !== child.id))}>Remove child</button>
    </fieldset>)}
    <button type="button" onClick={() => apply([...value, newChildEvent(year)])}>Add child</button>
    {error && <p role="alert">{error}</p>}
    <p>Base-year child costs: {formatGBP(childEffects(value, year).totalCost)}.</p>
  </section>
}
