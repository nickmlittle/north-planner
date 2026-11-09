import { Pencil } from 'lucide-react'
import { formatGBP } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

/** Planned as a share of Available, to one decimal place ("99.7"). Null when there is nothing available to share. */
function plannedShare(availablePence: number, plannedPence: number): number | null {
  if (availablePence <= 0) return null
  return Math.round(plannedPence / availablePence * 1000) / 10
}

/**
 * The Plan's answer first: what's left (or over), then a bar of Planned against Available and the sentence behind it.
 * The pencil edits income, beside the figure it changes. `compact` drops the share and the basis for phones.
 */
export function AllocationMeter({ availablePence, plannedPence, basis, onEditIncome, compact = false, className = '', label = 'Plan summary' }: {
  availablePence: number
  plannedPence: number
  /** Where Available comes from, e.g. "£7,940.00 salary + £400.00 other". */
  basis?: string
  onEditIncome: () => void
  compact?: boolean
  className?: string
  label?: string
}) {
  const balance = availablePence - plannedPence
  const state = balance < 0 ? 'is-deficit' : balance === 0 ? 'is-balanced' : 'is-surplus'
  const share = plannedShare(availablePence, plannedPence)
  const fill = share === null ? (plannedPence > 0 ? 100 : 0) : Math.min(share, 100)
  return <section className={`allocation-meter ${state}${compact ? ' is-compact' : ''} ${className}`.trim()} aria-label={label}>
    <div className="allocation-meter-head">
      <p className="allocation-meter-balance">{balance === 0 ? <strong>Balanced</strong> : <><strong>{pounds(Math.abs(balance))}</strong> <span>{balance < 0 ? 'over' : 'left'}</span></>}</p>
      {!compact && share !== null && <p className="allocation-meter-share">{share}% planned</p>}
    </div>
    <div className="allocation-meter-track" role="meter" aria-label="Planned" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)} aria-valuetext={share === null ? 'No income yet' : `${share}% of Available planned`}>
      <div className="allocation-meter-fill" style={{ width: `${fill}%` }}/>
    </div>
    <p className="allocation-meter-detail">
      <span><strong>{pounds(plannedPence)}</strong> planned of <strong>{pounds(availablePence)}</strong> available</span>
      <button type="button" className="allocation-meter-edit" aria-label="Edit income" title="Edit income" onClick={onEditIncome}><Pencil aria-hidden="true"/></button>
      {!compact && basis && <span className="allocation-meter-basis">({basis})</span>}
    </p>
  </section>
}

/** The meter in one line, docked above the phone's bottom nav while the card is scrolled away. A visual echo of the card, so hidden from screen readers. */
export function AllocationMeterMini({ availablePence, plannedPence }: { availablePence: number; plannedPence: number }) {
  const balance = availablePence - plannedPence
  const share = plannedShare(availablePence, plannedPence)
  const fill = share === null ? (plannedPence > 0 ? 100 : 0) : Math.min(share, 100)
  return <div className={`allocation-meter-mini ${balance < 0 ? 'is-deficit' : balance === 0 ? 'is-balanced' : 'is-surplus'}`} aria-hidden="true">
    <span className="allocation-meter-mini-balance">{balance === 0 ? 'Balanced' : `${pounds(Math.abs(balance))} ${balance < 0 ? 'over' : 'left'}`}</span>
    <span className="allocation-meter-mini-track"><span className="allocation-meter-mini-fill" style={{ width: `${fill}%` }}/></span>
  </div>
}
