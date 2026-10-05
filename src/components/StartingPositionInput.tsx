import { useState } from 'react'
import type { StartingPositionInput as InputDefinition } from '../config/startingPositionFields'
import { formatGBP } from '../formatting/money'

interface Props {
  definition: InputDefinition
  value: number
  onChange: (raw: string) => string | undefined
}

export function StartingPositionInput({ definition, value, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()
  const isMoney = definition.field.kind === 'money'
  const hintId = `${definition.key}-hint`
  const errorId = `${definition.key}-error`
  return (
    <div className="input-field">
      <label htmlFor={definition.key}>{definition.label}{isMoney ? ' (GBP)' : ''}</label>
      <input
        id={definition.key}
        type="text"
        inputMode={isMoney ? 'decimal' : 'numeric'}
        value={draft ?? (isMoney ? formatGBP(value) : String(value))}
        aria-invalid={Boolean(error)}
        aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
        onFocus={() => { if (draft === null) setDraft(String(value)) }}
        onChange={event => {
          const raw = event.target.value
          setDraft(raw)
          setError(onChange(raw))
        }}
        onBlur={() => { if (!error) setDraft(null) }}
      />
      <small id={hintId}>{isMoney ? 'Real 2026 pounds; enter an amount without £ or commas.' : definition.field.kind === 'age' ? 'Whole years at the base year (1–120).' : 'Changes ages; purchasing power stays at 2026.'}</small>
      {error && <small id={errorId} role="alert" className="input-error">{error} Last valid value retained.</small>}
    </div>
  )
}
