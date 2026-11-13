import { formatGBP } from '../formatting/money'
import './AllocationMeter.css'
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

/** "Available £4,000.00 + £2,500.00": each person's share of Available, or the household's with one adult. */
const availableLine = (availablePence: number, people: readonly MeterPerson[]) => `Available ${people.length > 1 ? people.map(person => pounds(person.availablePence)).join(' + ') : pounds(availablePence)}`

/**
 * Plan's figures, figure first (no headline sentence). Desktop: one row of the household balance, a bar per person
 * with their own figure, and Available with Edit income and "Review Ben's items". Phones (`compact`): the balance and
 * "planned of available" on one line, then a thin bar per person. Red only on an amount that's over.
 */
export function AllocationMeter({ availablePence, plannedPence, people = [], basis, onEditIncome, onReview, compact = false, className = '', label = 'Plan summary' }: {
  availablePence: number
  plannedPence: number
  people?: readonly MeterPerson[]
  /** Where Available comes from, e.g. "£7,940.00 salary + £400.00 other". Shown only when it isn't all salary. */
  basis?: string
  onEditIncome?: () => void
  onReview?: (personId: string) => void
  compact?: boolean
  className?: string
  label?: string
}) {
  const summary = meterSummary(people, availablePence, plannedPence)
  const balance = <strong className={`allocation-meter-balance${summary.household < 0 ? ' is-over' : ''}`}>{balanceText(summary.household)}</strong>
  const share = availablePence > 0 ? Math.round(plannedPence / availablePence * 1000) / 10 : null
  const bars = summary.split ? <ul className="allocation-meter-people" aria-label="By person">
    {people.map(person => {
      const left = person.availablePence - person.plannedPence
      return <li key={person.personId} className={`allocation-meter-person${left < 0 ? ' is-over' : ''}`}>
        <span className="allocation-meter-name">{person.name}</span>
        <Track availablePence={person.availablePence} plannedPence={person.plannedPence} label={`${person.name}: ${pounds(person.plannedPence)} planned of ${pounds(person.availablePence)} available`}/>
        <span className="allocation-meter-person-balance">{balanceText(left)}</span>
      </li>
    })}
  </ul> : <div className="allocation-meter-single" role="meter" aria-label="Planned" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share === null ? plannedPence > 0 ? 100 : 0 : Math.round(Math.min(share, 100))} aria-valuetext={share === null ? 'No income yet' : `${share}% of Available planned`}><Track availablePence={availablePence} plannedPence={plannedPence}/></div>
  const review = summary.worst && onReview && <button type="button" className="text-button allocation-meter-review" onClick={() => onReview(summary.worst!.personId)}>Review {summary.worst.name}’s items</button>
  const edit = onEditIncome && <button type="button" className="text-button allocation-meter-edit" onClick={onEditIncome}>Edit income</button>
  const otherBasis = basis && !/^(all from salary|no income yet)$/.test(basis) ? basis : ''
  if (compact) return <section className={`allocation-meter is-compact ${summary.state} ${className}`.trim()} aria-label={label}>
    <p className="allocation-meter-line">{balance}<span className="allocation-meter-of">{pounds(plannedPence)} of {pounds(availablePence)}</span></p>
    {bars}
    {(review || edit) && <p className="allocation-meter-links">{review}{edit}</p>}
  </section>
  return <section className={`allocation-meter ${summary.state}${summary.split ? ' is-split' : ''} ${className}`.trim()} aria-label={label}>
    <div className="allocation-meter-lead">
      <p className="allocation-meter-eyebrow">Plan</p>
      {balance}
      <p className="allocation-meter-of">{pounds(plannedPence)} planned of {pounds(availablePence)}{!summary.split && share !== null ? ` · ${share}%` : ''}</p>
    </div>
    {bars}
    <div className="allocation-meter-side">
      <p>{availableLine(availablePence, people)}</p>
      {otherBasis && <p className="allocation-meter-basis">{otherBasis}</p>}
      {edit}{review}
    </div>
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
