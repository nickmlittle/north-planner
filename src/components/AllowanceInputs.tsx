import type { ISAAllowances } from '../domain/surplus'
import { validateAllowances } from '../domain/surplus'
import type { Person } from '../domain/models'
import { NumericInput } from './NumericInput'

export function AllowanceInputs({ value, onChange, people }: { value: ISAAllowances; onChange: (value: ISAAllowances) => void; people: Person[] }) {
  return <section className="household-card"><h2>ISA surplus allocation</h2>
    <p>Pool take-home income after lifestyle, child and mortgage costs. Available cash is also eligible for next year's ISA sweep. Allocation aims for similar projected ISA balances at each person's FIRE age; allowances cap subscriptions. Cash earns 0% real.</p>
    <p>Annual calendar-year buckets approximate tax years. Allowances are held constant in real 2026 GBP; flexible ISA replacement and other external subscriptions are excluded.</p>
    <div className="input-grid">{people.map(person => <NumericInput key={person.id} label={`${person.name} annual ISA allowance (GBP)`} value={value[person.id] ?? 0} onChange={n => {
      const next = { ...value, [person.id]: n }, error = validateAllowances(next)
      if (!error) onChange(next)
      return error
    }} />)}</div>
  </section>
}
