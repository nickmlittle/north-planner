import { useState } from 'react'

export function NumericInput({ label, value, onChange, suffix = '' }: {
  label: string; value: number; onChange: (value: number) => string | undefined; suffix?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  return <label className="input-field">{label}{suffix}
    <input type="text" inputMode="decimal" value={draft ?? String(value)} aria-invalid={Boolean(error)}
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
