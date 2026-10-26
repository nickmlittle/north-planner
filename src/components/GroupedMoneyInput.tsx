import { useState } from 'react'

const displayGBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
})

export function GroupedMoneyInput({ value, onChange, label }: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  return <input
    aria-label={label}
    type="text"
    inputMode="decimal"
    value={editing ? draft : displayGBP.format(value)}
    onFocus={() => {
      setEditing(true)
      setDraft(String(value))
    }}
    onChange={event => {
      const next = event.target.value.replace(/[£,\s]/g, '')
      if (!/^\d*(\.\d{0,2})?$/.test(next)) return
      setDraft(next)
      if (next !== '' && next !== '.') onChange(Number(next))
      else if (next === '') onChange(0)
    }}
    onBlur={() => setEditing(false)}
  />
}
