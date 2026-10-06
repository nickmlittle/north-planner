import { useState } from 'react'
import type { PropertyMove } from '../domain/property'
import { validateMoves } from '../domain/property'
import { newPropertyMove } from '../config/defaultMoves'
import { NumericInput } from './NumericInput'

export function PropertyInputs({ value, onChange, year }: { value: PropertyMove[]; onChange: (value: PropertyMove[]) => void; year: number }) {
  const [error, setError] = useState<string>()
  function apply(next: PropertyMove[]) { const error = validateMoves(next); setError(error); if (!error) onChange(next); return error }
  function update(id: string, patch: Partial<PropertyMove>) { return apply(value.map(m => m.id === id ? { ...m, ...patch } : m)) }
  return <section className="household-card"><h2>Property moves</h2>
    <p>Funding order: sale, repay old mortgage/selling costs, equity, ISA if needed, then new mortgage. Excess equity becomes cash. Transaction costs are explicit real 2026 GBP inputs, including stamp duty. No lender affordability or LTV test is performed.</p>
    {value.map(move => <fieldset key={move.id}><legend>{move.name}</legend>
      <label>Move name <input value={move.name} onChange={e => update(move.id, { name: e.target.value })} /></label>
      <label><input type="checkbox" checked={move.enabled} onChange={e => update(move.id, { enabled: e.target.checked })} /> Include move</label>
      <div className="input-grid">{([['year', 'Move year'], ['purchasePrice', 'New purchase price (GBP)'], ['stampDuty', 'Stamp duty (GBP)'], ['agentFees', 'Estate-agent fees (GBP)'], ['legalFees', 'Legal fees (GBP)'], ['movingCosts', 'Moving costs (GBP)'], ['renovation', 'Renovation/furnishing (GBP)'], ['annualRate', 'New mortgage rate (%)'], ['termYears', 'New mortgage term (years)']] as const).map(([key, label]) => <NumericInput key={key} label={label} value={move[key] === null ? null : move[key]! * (key === 'annualRate' ? 100 : 1)} onChange={n => update(move.id, { [key]: n / (key === 'annualRate' ? 100 : 1) })} />)}</div>
      <label><input type="checkbox" checked={move.saleValue !== null} onChange={e => update(move.id, { saleValue: e.target.checked ? 0 : null })} /> Override forecast sale value</label>
      {move.saleValue !== null && <NumericInput label="Sale value override (GBP)" value={move.saleValue} onChange={n => update(move.id, { saleValue: n })} />}
      <button type="button" onClick={() => apply(value.filter(m => m.id !== move.id))}>Remove move</button>
    </fieldset>)}
    <button type="button" onClick={() => apply([...value, newPropertyMove(year + 1)])}>Add property move</button>
    {error && <p role="alert">{error}</p>}
  </section>
}
