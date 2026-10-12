import { useState } from 'react'
import type { MortgagePlan } from '../domain/mortgage'
import { validateMortgagePlan } from '../domain/mortgage'
import { mortgagePreview } from '../engine/mortgage'
import { formatGBP } from '../formatting/money'
import { NumericInput } from './NumericInput'

export function MortgageInputs({ value, onChange, balance, year, priceYear }: { value: MortgagePlan; onChange: (value: MortgagePlan) => void; balance: number; year: number; priceYear: number }) {
  const [error, setError] = useState<string>()
  function apply(next: MortgagePlan) { const error = validateMortgagePlan(next); setError(error); if (!error) onChange(next); return error }
  const preview = mortgagePreview(balance, year, value, priceYear)
  return <section className="household-card"><h2>Mortgage</h2>
    <p>Contractual rate is nominal; inflation converts debt and payments into real {priceYear} GBP. Inflation starts at 0% (nominal equals real) and is editable. Rate and term are required for an outstanding mortgage. Monthly overpayment is in real {priceYear} GBP.</p>
    <div className="input-grid">
      <NumericInput label="Mortgage interest rate (%)" value={value.annualRate === null ? null : value.annualRate * 100} onChange={n => apply({ ...value, annualRate: n / 100 })} />
      <NumericInput label="Remaining mortgage term (years)" value={value.termYears} onChange={n => apply({ ...value, termYears: n })} />
      <NumericInput label="Monthly overpayment (GBP)" value={value.monthlyOverpayment} onChange={n => apply({ ...value, monthlyOverpayment: n })} />
      <NumericInput label="Inflation for nominal mortgage conversion (%)" value={value.inflation * 100} onChange={n => apply({ ...value, inflation: n / 100 })} />
    </div>
    {value.refinances.map(r => <fieldset key={r.id}><legend>Remortgage</legend><div className="input-grid">
      {([['year', 'Remortgage year'], ['annualRate', 'New mortgage rate (%)'], ['termYears', 'New term (years)']] as const).map(([key, label]) => <NumericInput key={key} label={label} value={r[key] * (key === 'annualRate' ? 100 : 1)} onChange={n => apply({ ...value, refinances: value.refinances.map(item => item.id === r.id ? { ...item, [key]: n / (key === 'annualRate' ? 100 : 1) } : item) })} />)}
    </div><label><input type="checkbox" checked={r.enabled} onChange={e => apply({ ...value, refinances: value.refinances.map(item => item.id === r.id ? { ...item, enabled: e.target.checked } : item) })} /> Include remortgage</label>
      <button type="button" onClick={() => apply({ ...value, refinances: value.refinances.filter(item => item.id !== r.id) })}>Remove remortgage</button>
    </fieldset>)}
    <button type="button" onClick={() => apply({ ...value, refinances: [...value.refinances, { id: crypto.randomUUID(), year, annualRate: value.annualRate ?? 0, termYears: value.termYears ?? 1, enabled: false }] })}>Add remortgage</button>
    {error && <p role="alert">{error}</p>}
    {preview.error ? <p>{preview.error}</p> : <p>Base-year payments: {formatGBP(preview.payment!)}; closing mortgage: {formatGBP(preview.closing!)} (real {priceYear} GBP).</p>}
  </section>
}
