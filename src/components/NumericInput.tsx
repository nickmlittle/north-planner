import { useState } from 'react'

export function NumericInput({ label, value, onChange, suffix = '', id }: {
  label: string; value: number | null; onChange: (value: number) => string | undefined; suffix?: string; id?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  return <label className="input-field">{label}{suffix}
    <input id={id} type="text" inputMode="decimal" value={draft ?? (value === null ? '' : value.toLocaleString('en-GB', { useGrouping: false, maximumFractionDigits: 12 }))} aria-invalid={Boolean(error)}
      onChange={event => {
        const raw = event.target.value
        setDraft(raw)
        if (!/^-?\d+(?:\.\d+)?$/.test(raw.trim()) || !Number.isFinite(Number(raw))) setError('Enter a finite decimal number.')
        else setError(onChange(Number(raw)))
      }}
      onBlur={() => { if (!error) setDraft(null) }} />
    {error && <small role="alert" className="input-error">{error} Last valid value retained.</small>}
  </label>
}
