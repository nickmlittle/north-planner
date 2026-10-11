import { useId } from 'react'
import type { ReactNode } from 'react'
import { amount } from '../domain/setup'
import type { Frequency } from '../domain/setup'

export function SetupField({ label, value, onChange, help, error, type = 'text', children }: {
  label: string; value: string; onChange: (value: string) => void; help?: string; error?: string; type?: string; children?: ReactNode
}) {
  const id = useId(); const description = error || help
  return <div className="input-field"><label htmlFor={id}>{label}</label>
    {children ? <select id={id} value={value} onChange={e => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={description ? `${id}-help` : undefined}>{children}</select>
      : <input id={id} type={type} inputMode={type === 'text' ? 'text' : undefined} value={value} onChange={e => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={description ? `${id}-help` : undefined} />}
    {description && <small id={`${id}-help`} className={error ? 'input-error' : ''} role={error ? 'alert' : undefined}>{description}</small>}
  </div>
}
export function MoneyField({ label, value, onChange, max, integer, help }: { label: string; value: string; onChange: (value: string) => void; max?: number; integer?: boolean; help?: string }) {
  const id = useId(); const n = amount(value)
  const error = value !== '' && (n === null || (max !== undefined && n > max) || (integer && !Number.isInteger(n)))
    ? `Enter ${integer ? 'a whole number' : 'a non-negative amount with up to two decimals'}${max !== undefined ? ` from 0 to ${max}` : ''}.` : ''
  return <div className="input-field"><label htmlFor={id}>{label}</label>
    <input id={id} type="text" inputMode={integer ? 'numeric' : 'decimal'} value={value} placeholder="Not added" onChange={e => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error || help ? `${id}-help` : undefined} />
    {(error || help) && <small id={`${id}-help`} className={error ? 'input-error' : ''} role={error ? 'alert' : undefined}>{error || help}</small>}
  </div>
}
export function FrequencyField({ value, onChange, label = 'Frequency' }: { value: Frequency; onChange: (v: Frequency) => void; label?: string }) {
  return <SetupField label={label} value={value} onChange={v => onChange(v as Frequency)}><option value="month">Per month</option><option value="year">Per year</option></SetupField>
}
export function SetupCard({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return <section className="setup-card"><h2>{title}</h2>{description && <p className="muted">{description}</p>}{children}</section>
}
