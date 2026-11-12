import type { ReactNode } from 'react'
import './Segmented.css'

export type SegmentedOption = { value: string; label: string; detail?: ReactNode }

/**
 * A small pill switch: "Steps | By account", "Ada 0/9 | Ben 0/9 | Both". Toggle buttons (aria-pressed) in a named
 * group, for a view choice that isn't navigation.
 */
export function Segmented({ options, value, onChange, label }: { options: SegmentedOption[]; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" className="segmented-option" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
      {option.label}{option.detail !== undefined && option.detail !== '' && <small className="segmented-detail">{option.detail}</small>}
    </button>)}
  </div>
}
