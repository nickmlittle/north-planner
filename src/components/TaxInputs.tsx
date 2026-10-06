import type { TaxRules } from '../domain/tax'
import { validateTaxRules } from '../domain/tax'
import { NumericInput } from './NumericInput'

export function TaxInputs({ value, onChange }: { value: TaxRules; onChange: (value: TaxRules) => void }) {
  function apply(next: TaxRules) {
    const error = validateTaxRules(next)
    if (!error) onChange(next)
    return error
  }
  return <section className="household-card"><h2>Tax estimates</h2>
    <p>2026/27 England, Wales and Northern Ireland; category A employee NI. Annual estimates, not payroll calculations. Thresholds held constant in real 2026 GBP unless edited. Scotland, benefits, student loans, employer NI and future rule changes are excluded.</p>
    <div className="input-grid">{([['personalAllowance', 'Personal allowance (GBP)'], ['taperStart', 'Allowance taper starts (GBP)'], ['taperRate', 'Allowance reduction per pound']] as const).map(([key, label]) => <NumericInput key={key} label={label} value={value[key]} onChange={n => apply({ ...value, [key]: n })} />)}</div>
    {(['incomeTaxBands', 'employeeNIBands'] as const).map(key => <fieldset key={key}><legend>{key === 'incomeTaxBands' ? 'Income tax: ceilings after allowance' : 'Employee NI: gross earnings ceilings'}</legend>
      {value[key].map((band, i) => <div className="input-grid" key={i}>
        {band.upTo !== null && <NumericInput label={`${key === 'incomeTaxBands' ? 'Tax' : 'NI'} band ${i + 1} ceiling (GBP)`} value={band.upTo} onChange={n => apply({ ...value, [key]: value[key].map((b, j) => j === i ? { ...b, upTo: n } : b) })} />}
        <NumericInput label={`${key === 'incomeTaxBands' ? 'Tax' : 'NI'} band ${i + 1} rate (%)`} value={band.rate * 100} onChange={n => apply({ ...value, [key]: value[key].map((b, j) => j === i ? { ...b, rate: n / 100 } : b) })} />
      </div>)}
    </fieldset>)}
  </section>
}
