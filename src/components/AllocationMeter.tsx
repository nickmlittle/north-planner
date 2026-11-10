import { ChevronRight, Pencil } from 'lucide-react'
import { formatGBP } from '../formatting/money'
import { balanceText, meterSummary, type MeterPerson } from './meterSummary'

const pounds = (pence: number) => formatGBP(pence / 100)

/** The bar for one balance: pine up to what's planned, and when over, a hatched end for the part available money doesn't cover. Percentages of the track. */
function barShape(availablePence: number, plannedPence: number) {
  if (plannedPence > availablePence && plannedPence > 0) {
    const covered = availablePence > 0 ? availablePence / plannedPence * 100 : 0
    return { fill: covered, over: 100 - covered }
  }
  return { fill: availablePence > 0 ? plannedPence / availablePence * 100 : 0, over: 0 }
}

function Track({ availablePence, plannedPence, className = 'allocation-meter-track', label }: { availablePence: number; plannedPence: number; className?: string; label?: string }) {
  const { fill, over } = barShape(availablePence, plannedPence)
  const share = availablePence > 0 ? Math.round(plannedPence / availablePence * 1000) / 10 : null
  return <span className={className} {...label ? { role: 'meter', 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': share === null ? (plannedPence > 0 ? 100 : 0) : Math.round(Math.min(share, 100)), 'aria-valuetext': share === null ? 'No income yet' : `${share}% of Available planned` } : {}}>
    <span className="allocation-meter-fill" style={{ width: `${Math.min(fill, 100)}%` }}/>
    {over > 0 && <span className="allocation-meter-over" style={{ width: `${over}%` }}/>}
  </span>
}

/**
 * The Plan's answer first. With two or more adults: the worst figure as the headline, one bar per person, and the household on its own line.
 * With one adult: the household balance and one bar. `onReview` opens the items of whoever is furthest over; the pencil edits income.
 */
export function AllocationMeter({ availablePence, plannedPence, people = [], basis, onEditIncome, onReview, eyebrow, compact = false, className = '', label = 'Plan summary' }: {
  availablePence: number
  plannedPence: number
  people?: readonly MeterPerson[]
  /** Where Available comes from, e.g. "£7,940.00 salary + £400.00 other". */
  basis?: string
  onEditIncome?: () => void
  onReview?: (personId: string) => void
  /** A small line above the headline, e.g. "November plan" on Home. */
  eyebrow?: string
  compact?: boolean
  className?: string
  label?: string
}) {
  const summary = meterSummary(people, availablePence, plannedPence)
  const rows = summary.split ? people : []
  return <section className={`allocation-meter ${summary.state}${summary.split ? ' is-split' : ''}${compact ? ' is-compact' : ''} ${className}`.trim()} aria-label={label}>
    <div className="allocation-meter-head">
      {eyebrow && <p className="allocation-meter-eyebrow">{eyebrow}</p>}
      <p className="allocation-meter-balance">{summary.split ? <strong>{summary.headline}</strong> : summary.household === 0 ? <strong>Balanced</strong> : <><strong>{pounds(Math.abs(summary.household))}</strong> <span>{summary.household < 0 ? 'over' : 'left'}</span></>}</p>
      {summary.hint && !compact && <p className="allocation-meter-hint">{summary.hint}</p>}
      {!summary.split && !compact && availablePence > 0 && <p className="allocation-meter-share">{Math.round(plannedPence / availablePence * 1000) / 10}% planned</p>}
    </div>
    <div className="allocation-meter-body">
      {summary.split ? <ul className="allocation-meter-people" aria-label="By person">
        {rows.map(person => {
          const balance = person.availablePence - person.plannedPence
          return <li key={person.personId} className={`allocation-meter-person${balance < 0 ? ' is-over' : ''}`}>
            <span className="allocation-meter-name">{person.name}</span>
            <Track availablePence={person.availablePence} plannedPence={person.plannedPence} label={`${person.name}: planned`}/>
            <strong className="allocation-meter-person-balance">{balanceText(balance)}</strong>
            <span className="allocation-meter-person-detail">{pounds(person.plannedPence)} planned of {pounds(person.availablePence)} available</span>
          </li>
        })}
      </ul> : <div role="meter" aria-label="Planned" aria-valuemin={0} aria-valuemax={100} aria-valuenow={availablePence > 0 ? Math.round(Math.min(plannedPence / availablePence * 100, 100)) : plannedPence > 0 ? 100 : 0} aria-valuetext={availablePence > 0 ? `${Math.round(plannedPence / availablePence * 1000) / 10}% of Available planned` : 'No income yet'}><Track availablePence={availablePence} plannedPence={plannedPence}/></div>}
      {summary.split && <p className="allocation-meter-household"><strong>Household</strong><span className="allocation-meter-household-detail">{pounds(plannedPence)} planned of {pounds(availablePence)}</span><strong>{balanceText(summary.household)}</strong></p>}
      {summary.hint && compact && <p className="allocation-meter-hint">{summary.hint}</p>}
    </div>
    <p className="allocation-meter-detail">
      {summary.worst && onReview && <button type="button" className="allocation-meter-review" onClick={() => onReview(summary.worst!.personId)}>Review {summary.worst.name}’s items<ChevronRight aria-hidden="true"/></button>}
      {!summary.split && <span><strong>{pounds(plannedPence)}</strong> planned of <strong>{pounds(availablePence)}</strong> available</span>}
      {onEditIncome && <button type="button" className="allocation-meter-edit" aria-label="Edit income" title="Edit income" onClick={onEditIncome}><Pencil aria-hidden="true"/>{summary.split && <span>Edit income</span>}</button>}
      {!compact && basis && <span className="allocation-meter-basis">({basis})</span>}
    </p>
  </section>
}

/** The meter in one line, docked above the phone's bottom nav while the card is scrolled away: the worst figure, and a thin bar per person. A visual echo of the card, so hidden from screen readers. */
export function AllocationMeterMini({ availablePence, plannedPence, people = [] }: { availablePence: number; plannedPence: number; people?: readonly MeterPerson[] }) {
  const summary = meterSummary(people, availablePence, plannedPence)
  return <div className={`allocation-meter-mini ${summary.state}`} aria-hidden="true">
    <span className="allocation-meter-mini-balance">{summary.mini}</span>
    {summary.split ? <span className="allocation-meter-mini-people">{people.map(person => <span key={person.personId} className="allocation-meter-mini-person"><span>{person.name.charAt(0)}</span><Track availablePence={person.availablePence} plannedPence={person.plannedPence} className="allocation-meter-mini-track"/></span>)}</span>
      : <Track availablePence={availablePence} plannedPence={plannedPence} className="allocation-meter-mini-track"/>}
  </div>
}
