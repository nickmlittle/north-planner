import type { ReturnAssumptions } from '../domain/planning'
import { validatePlanning } from '../domain/planning'
import { NumericInput } from './NumericInput'

const fields: [Exclude<keyof ReturnAssumptions, 'cashReturn'>, string, boolean][] = [
  ['equityReturn', 'Equity expected real return', true], ['equityVolatility', 'Equity volatility', true],
  ['bondReturn', 'Bond expected real return', true], ['bondVolatility', 'Bond volatility', true],
  ['houseGrowth', 'House real growth', true], ['fireAge', 'FIRE age', false],
  ['pensionAccessAge', 'Pension access age', false], ['horizonAge', 'Planning horizon age', false],
  ['withdrawalRate', 'Sustainable withdrawal rate', true],
]

export function PlanningInputs({ value, onChange }: { value: ReturnAssumptions; onChange: (value: ReturnAssumptions) => void }) {
  return <section className="household-card"><h2>Planning assumptions</h2>
    <p>Illustrative real returns. Volatility and withdrawal rate are retained for later modelling; no probability is calculated.</p>
    <div className="input-grid">{fields.map(([key, label, percent]) => <NumericInput key={key} label={label}
      value={value[key] * (percent ? 100 : 1)} suffix={percent ? ' (%)' : ''}
      onChange={number => {
        const next = { ...value, [key]: number / (percent ? 100 : 1) }
        const error = validatePlanning(next)
        if (!error) onChange(next)
        return error
      }} />)}</div>
    <p>Cash real return: 0% (fixed for V1).</p>
  </section>
}
