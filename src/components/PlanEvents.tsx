import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { householdErrors, missingDetails } from '../domain/setup'
import type { PlanEvent } from '../domain/events'
import { eventKey, eventName, eventYear, planEvents, putPlanEvent, removePlanEvent, validatePlanEvents } from '../domain/events'
import { documentForecast } from '../state/forecast'
import { EventDialog } from './EventDialog'

export function PlanEvents({ document: doc, setDocument }: { document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>> }) {
  const [editing, setEditing] = useState<PlanEvent | 'new' | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const events = planEvents(doc)
  function toggle(event: PlanEvent) {
    const candidate = { ...event, value: { ...event.value, enabled: !event.value.enabled } } as PlanEvent
    const next = putPlanEvent(doc, candidate)
    let invalid = validatePlanEvents(next)
    if (!invalid && !householdErrors(doc.snapshot).length && !missingDetails(doc.snapshot, true).length) invalid = documentForecast(next).result.error
    setError(invalid ?? '')
    if (!invalid) setDocument(next)
  }
  return <section className="setup-card events-card" aria-labelledby="events-heading"><div className="section-heading"><div><p className="eyebrow">Make room for life</p><h2 id="events-heading">Your goals and life events</h2></div><button className="primary-button" onClick={() => setEditing('new')}>+ Add goal or life event</button></div>
    <p className="muted">Explore the big changes and everyday choices that shape your future.</p>
    {error && <p className="error-summary" role="alert">{error}</p>}
    {!events.length && <div className="events-empty"><span aria-hidden="true">↗</span><h3>What’s your next chapter?</h3><p>A new home, a growing family, or a purchase you’re planning for. Add an event to see what changes.</p></div>}
    <ol className="event-list">{events.map(event => <li key={eventKey(event)} className={!event.value.enabled ? 'event-excluded' : ''}>
      <span className="event-year">{eventYear(event)}</span><div className="event-description"><strong>{eventName(event)}</strong><span>{{ move: 'House move', child: 'Future child', purchase: 'Purchase', spending: 'Spending change' }[event.kind]}{!event.value.enabled && ' · Excluded'}</span></div>
      <div className="event-controls"><label className="checkbox-label"><input type="checkbox" checked={event.value.enabled} onChange={() => toggle(event)} aria-label={`Include ${eventName(event)}`} />Include</label><button className="text-button" onClick={() => setEditing(event)}>Edit <span className="sr-only">{eventName(event)}</span></button><button className="text-button danger-link" onClick={() => setRemoving(eventKey(event))}>Delete <span className="sr-only">{eventName(event)}</span></button></div>
      {removing === eventKey(event) && <div className="removal-panel"><p>Delete {eventName(event)} from your plan?</p><div className="button-row"><button className="secondary-button" onClick={() => setRemoving(null)}>Keep event</button><button className="danger-button" onClick={() => { setDocument(d => removePlanEvent(d, event)); setRemoving(null); setError('') }}>Confirm deletion</button></div></div>}
    </li>)}</ol>
    {editing && <EventDialog document={doc} event={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={event => { setDocument(d => putPlanEvent(d, event)); setEditing(null); setError('') }} />}
  </section>
}
