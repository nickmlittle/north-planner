import type { PensionContributions } from '../domain/contributions'
import { defaultContributions } from '../config/defaultContributions'
import { NumericInput } from './NumericInput'

export function ContributionInputs({ value = defaultContributions, onChange }: { value?: PensionContributions; onChange: (value: PensionContributions) => string | undefined }) {
  return <div className="input-grid">
    <NumericInput label="Employee pension (% of gross)" value={value.employeeRate * 100} onChange={n => onChange({ ...value, employeeRate: n / 100 })} />
    <NumericInput label="Employer pension (% of gross)" value={value.employerRate * 100} onChange={n => onChange({ ...value, employerRate: n / 100 })} />
    <label>Pension treatment <select value={value.treatment} onChange={event => onChange({ ...value, treatment: event.target.value as PensionContributions['treatment'] })}>
      <option value="salary-sacrifice">Salary sacrifice</option><option value="net-pay">Net pay (pre-tax, NI unchanged)</option><option value="relief-at-source">Relief at source (SIPP, gross %)</option>
    </select></label>
    <label><input type="checkbox" checked={value.continueAfterFire} onChange={event => onChange({ ...value, continueAfterFire: event.target.checked })} /> Continue this work and contributions past FIRE age</label>
  </div>
}
