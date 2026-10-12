import { useEffect, useRef, useState } from 'react'
import type { AppDocument } from '../domain/setup'
import { ageBands, householdErrors, missingDetails } from '../domain/setup'
import type { EventKind, PlanEvent } from '../domain/events'
import { eventName, eventYear, putPlanEvent, validatePlanEvents } from '../domain/events'
import { documentForecast } from '../state/forecast'
import { formatGBPWhole as formatGBP } from '../formatting/money'
import { MoneyField, SetupField } from './SetupFields'
import { defaultPropertyFeeRates, pricedPropertyMove, stampDutyLandTax } from '../domain/property'

type Fields = Record<string, string>
type WorkDraft = { id: string; personId: string; startYear: string; endYear: string; workingFraction: string; annualGrossOverride: string }
const choices: { kind: EventKind; title: string; description: string }[] = [
  { kind: 'move', title: 'House move', description: 'Sell your current home and plan your next one.' },
  { kind: 'child', title: 'Future child', description: 'Plan costs through childhood and changes to work.' },
  { kind: 'purchase', title: 'Purchase', description: 'A car, rental purchase costs, or something else.' },
  { kind: 'spending', title: 'Spending change', description: 'Increase or reduce your annual living costs.' },
]
function initialFields(event?: PlanEvent): Fields {
  const f: Fields = { name: '', year: '2027', preset: 'car', upfrontCost: '', recurring: 'no', annualCost: '', startYear: '2027', finalYear: '2027',
    annualChange: '', birthCost: '', purchasePrice: '', movingCosts: '', agentFeeRate: String(defaultPropertyFeeRates.agentFeeRate * 100),
    legalFeeRate: String(defaultPropertyFeeRates.legalFeeRate * 100), renovationRate: String(defaultPropertyFeeRates.renovationRate * 100), annualRate: '', termYears: '', saleValue: '' }
  ageBands.forEach(b => { f[b.key] = '' })
  if (!event) return f
  f.name = eventName(event); f.year = String(eventYear(event))
  const v = event.value
  if (event.kind === 'purchase') {
    Object.assign(f, { preset: event.value.preset, upfrontCost: String(event.value.upfrontCost), recurring: event.value.recurring ? 'yes' : 'no',
      annualCost: String(event.value.recurring?.annualCost ?? ''), startYear: String(event.value.recurring?.startYear ?? event.value.year), finalYear: String((event.value.recurring?.endYear ?? event.value.year + 1) - 1) })
  } else if (event.kind === 'move') {
    for (const [key, value] of Object.entries(v)) if (typeof value === 'number') f[key] = String(['annualRate', 'agentFeeRate', 'legalFeeRate', 'renovationRate'].includes(key) ? value * 100 : value)
  } else if (event.kind === 'child') {
    f.birthCost = String(event.value.birthCost)
    for (const [key, value] of Object.entries(event.value.costs)) f[key] = String(value)
  } else {
    Object.assign(f, { startYear: String(event.value.startYear), finalYear: String(event.value.endYear - 1), annualChange: String(event.value.annualChange) })
  }
  return f
}

export function EventDialog({ document: doc, event, onClose, onSave }: {
  document: AppDocument; event?: PlanEvent; onClose: () => void; onSave: (event: PlanEvent) => void
}) {
  const [kind, setKind] = useState<EventKind | null>(event?.kind ?? null)
  const [stage, setStage] = useState(event ? 1 : 0)
  const [fields, setFields] = useState(() => initialFields(event))
  const [work, setWork] = useState<WorkDraft[]>(() => event?.kind === 'child' ? event.value.workAdjustments.map(a => ({ ...a,
    startYear: String(a.startYear), endYear: String(a.endYear), workingFraction: String(a.workingFraction), annualGrossOverride: a.annualGrossOverride === null ? '' : String(a.annualGrossOverride) })) : [])
  const [candidate, setCandidate] = useState<PlanEvent | null>(null)
  const [error, setError] = useState('')
  const [id] = useState(() => event?.value.id ?? crypto.randomUUID())
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const el = dialog.current!; const opener = window.document.activeElement as HTMLElement | null
    const overflow = window.document.body.style.overflow
    window.document.body.style.overflow = 'hidden'
    if (el.showModal) el.showModal(); else el.setAttribute('open', '')
    title.current?.focus()
    return () => { window.document.body.style.overflow = overflow; opener?.focus() }
  }, [])
  function field(key: string, value: string) { setFields(f => ({ ...f, [key]: value })); setError('') }
  function build(): PlanEvent {
    const number = (key: string, signed = false) => {
      const raw = fields[key]?.trim() ?? ''
      if (!(signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(raw) || !Number.isFinite(Number(raw))) throw new Error(`Enter a valid ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}. Enter 0 if there is no cost.`)
      return Number(raw)
    }
    const year = (key: string) => { const n = number(key); if (!Number.isInteger(n) || n < 1900 || n > 9998) throw new Error('Enter whole calendar years from 1900 to 9998.'); return n }
    if (!(fields.name ?? '').trim()) throw new Error('Give this event a name.')
    const common = { id, name: (fields.name ?? '').trim(), enabled: fields.__enabled === undefined ? event?.value.enabled ?? true : fields.__enabled === 'true' }
    switch (kind) {
      case 'move': return { kind, value: pricedPropertyMove({ ...common, year: year('year'), purchasePrice: number('purchasePrice'), stampDuty: 0, agentFees: 0, legalFees: 0,
        movingCosts: number('movingCosts'), renovation: 0, agentFeeRate: number('agentFeeRate') / 100, legalFeeRate: number('legalFeeRate') / 100,
        renovationRate: number('renovationRate') / 100, annualRate: fields.annualRate?.trim() ? number('annualRate') / 100 : null,
        termYears: fields.termYears?.trim() ? number('termYears') : null, saleValue: (fields.saleValue ?? '').trim() ? number('saleValue') : null }) }
      case 'child': return { kind, value: { ...common, birthYear: year('year'), birthCost: number('birthCost'),
        costs: { ages0to2: number('ages0to2'), ages3to4: number('ages3to4'), ages5to11: number('ages5to11'), ages12to18: number('ages12to18') },
        workAdjustments: work.map(a => {
          if (![a.startYear, a.endYear, a.workingFraction].every(s => s.trim() && Number.isFinite(Number(s)))) throw new Error('Complete every parental work change.')
          if (a.annualGrossOverride.trim() && (!/^\d+(?:\.\d{1,2})?$/.test(a.annualGrossOverride) || !Number.isFinite(Number(a.annualGrossOverride)))) throw new Error('Enter a valid gross income override.')
          return { ...a, startYear: Number(a.startYear), endYear: Number(a.endYear), workingFraction: Number(a.workingFraction), annualGrossOverride: a.annualGrossOverride.trim() ? Number(a.annualGrossOverride) : null }
        }) } }
      case 'purchase': return { kind, value: { ...common, preset: fields.preset as 'car' | 'rental-costs' | 'other', year: year('year'), upfrontCost: number('upfrontCost'),
        recurring: fields.recurring === 'yes' ? { annualCost: number('annualCost'), startYear: year('startYear'), endYear: year('finalYear') + 1 } : null } }
      case 'spending': return { kind, value: { ...common, startYear: year('startYear'), endYear: year('finalYear') + 1, annualChange: number('annualChange', true) } }
      default: throw new Error('Choose an event type.')
    }
  }
  function check(next: PlanEvent) {
    const proposed = putPlanEvent(doc, next)
    const invalid = validatePlanEvents(proposed)
    if (invalid) throw new Error(invalid)
    const forecast = documentForecast(proposed)
    const incomplete = householdErrors(doc.snapshot).length || missingDetails(doc.snapshot, true).length
    if (!incomplete && forecast.result.error) throw new Error(forecast.result.error)
    return forecast
  }
  function preview() {
    try { const next = build(); check(next); setCandidate(next); setError(''); setStage(2); title.current?.focus() }
    catch (e) { setError(e instanceof Error ? e.message : 'Check the event details.') }
  }
  function save() {
    try { if (candidate) { check(candidate); onSave(candidate) } }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save event.') }
  }
  const before = documentForecast(doc)
  const after = candidate ? documentForecast(putPlanEvent(doc, candidate)) : undefined
  const horizon = Math.max(2026, ...doc.snapshot.people.filter(p => p.role !== 'child').map(p => Number(p.dob.slice(0, 4)) + doc.planning.horizonAge))
  const outside = candidate && (eventYear(candidate) < 2026 || eventYear(candidate) > horizon)
  const money = (key: string, label: string, help?: string) => <MoneyField key={key} label={label} value={fields[key] ?? ''} onChange={v => field(key, v)} help={help} />
  const text = (key: string, label: string, help?: string) => <SetupField key={key} label={label} value={fields[key] ?? ''} onChange={v => field(key, v)} help={help} />
  const metric = (n: number | null | undefined) => n == null ? 'Unavailable' : formatGBP(n)
  return <dialog ref={dialog} className="event-dialog" aria-labelledby="event-dialog-title" onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}
    onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key !== 'Tab') return
      const focusable = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]'))
      const first = focusable[0], last = focusable[focusable.length - 1]
      const active = window.document.activeElement
      if (e.shiftKey && (active === first || active === title.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && (active === last || active === title.current)) { e.preventDefault(); first?.focus() }
    }}>
    <div className="dialog-content"><div className="section-heading"><p className="eyebrow">Your next chapter</p><button className="text-button" onClick={onClose} aria-label="Close event dialog">Close ×</button></div>
      <h2 id="event-dialog-title" ref={title} tabIndex={-1}>{event ? `Edit ${eventName(event)}` : 'Add goal or life event'}</h2>
      <ol className="dialog-stages">{['Choose type', 'Enter details', 'Preview impact'].map((s, i) => <li key={s} aria-current={stage === i ? 'step' : undefined}>{i + 1}. {s}</li>)}</ol>
      {error && <p className="error-summary" role="alert">{error}</p>}
      {stage === 0 && <div className="event-choices">{choices.map(c => <button key={c.kind} className="event-choice" disabled={c.kind === 'move' && doc.snapshot.housing !== 'own'} onClick={() => { setKind(c.kind); setStage(1); title.current?.focus() }}><strong>{c.title}</strong><span>{c.description}</span>{c.kind === 'move' && doc.snapshot.housing !== 'own' && <small>Requires an existing home to sell. First-home buying comes later.</small>}</button>)}</div>}
      {stage === 1 && <form onSubmit={e => { e.preventDefault(); preview() }}>
        <p className="muted">{choices.find(c => c.kind === kind)?.title} · All costs in real 2026 GBP. Enter explicit zero where there is no cost.</p>
        {event && <label className="checkbox-label event-enabled"><input type="checkbox" checked={fields.__enabled === undefined ? event.value.enabled : fields.__enabled === 'true'} onChange={e => {
          const enabled = e.target.checked
          const updated: PlanEvent = event.kind === 'move' ? { kind: 'move', value: { ...event.value, enabled } }
            : event.kind === 'child' ? { kind: 'child', value: { ...event.value, enabled } }
              : event.kind === 'purchase' ? { kind: 'purchase', value: { ...event.value, enabled } }
                : { kind: 'spending', value: { ...event.value, enabled } }
          setFields(f => ({ ...f, __enabled: String(enabled) })); setCandidate(updated)
        }} />Include this event in the forecast</label>}
        {text('name', 'Event name')}
        {kind !== 'spending' && text('year', kind === 'child' ? 'Birth year' : kind === 'move' ? 'Move year' : 'Purchase year')}
        {kind === 'purchase' && <><SetupField label="Purchase type" value={fields.preset!} onChange={v => field('preset', v)}><option value="car">Car</option><option value="rental-costs">Rental-property purchase costs</option><option value="other">Other</option></SetupField>
          {fields.preset === 'rental-costs' && <p className="context-note">This records purchase and running costs only. Property value, financing and rental income are not included.</p>}
          {money('upfrontCost', 'One-off purchase cost (£)')}
          <label className="checkbox-label"><input type="checkbox" checked={fields.recurring === 'yes'} onChange={e => field('recurring', e.target.checked ? 'yes' : 'no')} />Include recurring running costs</label>
          {fields.recurring === 'yes' && <div className="input-grid">{money('annualCost', 'Annual running cost (£)')}{text('startYear', 'Running costs start year')}{text('finalYear', 'Running costs final year', 'Includes this whole year.')}</div>}</>}
        {kind === 'spending' && <div className="input-grid">{text('startYear', 'Start year')}{text('finalYear', 'Final year', 'Includes this whole year.')}{text('annualChange', 'Annual spending change (£)', 'Positive increases costs; negative reduces them.')}</div>}
        {kind === 'move' && <><div className="input-grid">{money('purchasePrice', 'New home purchase price (£)')}{money('agentFeeRate', 'Estate-agent fee (% of purchase price)')}{money('legalFeeRate', 'Legal fees (% of purchase price)')}{money('renovationRate', 'Renovation and furnishing (% of purchase price)')}{money('movingCosts', 'Moving costs (£)')}{money('annualRate', 'New mortgage rate (%)', 'Required if this move needs a new mortgage.')}{money('termYears', 'New mortgage term (years)')}{money('saleValue', 'Sale value override (£)', 'Optional: leave blank to use the projected home value.')}</div><p className="context-note">Estimated SDLT: {formatGBP(stampDutyLandTax(Number(fields.purchasePrice) || 0))}. Estate-agent, legal, and renovation costs scale with purchase price. SDLT uses England and Northern Ireland main-home rates; additional-property and non-resident surcharges are not included.</p><p className="muted">Sale equity funds the purchase, then ISAs, then a new mortgage. Existing cash is not used. Borrowing is not checked against lender criteria.</p></>}
        {kind === 'child' && <><div className="input-grid">{money('birthCost', 'One-off baby cost (£)')}{ageBands.map(b => money(b.key, `${b.label} annual cost (£)`))}</div><h3>Parental work changes</h3><p className="muted">Optional. End years are exclusive; a change from 2027 to 2028 applies in 2027.</p>
          {work.map((a, index) => <fieldset className="work-change" key={a.id}><legend>Work change {index + 1}</legend><SetupField label={`Parent ${index + 1}`} value={a.personId} onChange={personId => setWork(w => w.map(v => v.id === a.id ? { ...v, personId } : v))}>{doc.snapshot.people.filter(p => p.role !== 'child').map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</SetupField>
            <div className="input-grid">{(['startYear', 'endYear', 'workingFraction', 'annualGrossOverride'] as const).map(key => <SetupField key={key} label={`${{ startYear: 'Start year', endYear: 'End year (exclusive)', workingFraction: 'Working fraction (0–1)', annualGrossOverride: 'Annual gross override (£, optional)' }[key]} · work change ${index + 1}`} value={a[key]} onChange={value => setWork(w => w.map(v => v.id === a.id ? { ...v, [key]: value } : v))} />)}</div><button type="button" className="text-button" onClick={() => setWork(w => w.filter(v => v.id !== a.id))}>Remove work change {index + 1}</button></fieldset>)}
          <button type="button" className="secondary-button" onClick={() => setWork(w => [...w, { id: crypto.randomUUID(), personId: doc.snapshot.people.find(p => p.role !== 'child')?.id ?? '', startYear: fields.year!, endYear: String(Number(fields.year) + 1), workingFraction: '', annualGrossOverride: '' }])}>Add parental work change</button></>}
        <div className="dialog-actions">{!event && <button type="button" className="secondary-button" onClick={() => { setStage(0); setError(''); title.current?.focus() }}>Back</button>}<button type="submit" className="primary-button">Preview impact →</button></div>
      </form>}
      {stage === 2 && candidate && <><h3>{eventName(candidate)} · {eventYear(candidate)}</h3>
        {outside && <p className="context-note">This event starts outside the projection horizon (2026–{horizon}). Only costs within the projection are shown.</p>}
        {!candidate.value.enabled && <p className="context-note">This event is excluded from the plan. Enable it from your event list to see its impact.</p>}
        {after?.result.error && <p role="status">Preview unavailable: {after.result.error} You can save this event and complete your household details later.</p>}
        <div className="table-scroll"><table><caption>Projected impact · year-end FIRE balances</caption><thead><tr><th>Measure</th><th>Saved plan</th><th>With this event</th></tr></thead><tbody>
          <tr><th scope="row">Net worth at FIRE</th><td>{metric(before.metrics?.fireNetWorth)}</td><td>{metric(after?.metrics?.fireNetWorth)}</td></tr>
          <tr><th scope="row">Indicative annual withdrawal</th><td>{metric(before.metrics?.annualWithdrawal)}</td><td>{metric(after?.metrics?.annualWithdrawal)}</td></tr>
          <tr><th scope="row">First unfunded year</th><td>{before.metrics ? before.metrics.firstUnfundedYear ?? 'None within projection' : 'Unavailable'}</td><td>{after?.metrics ? after.metrics.firstUnfundedYear ?? 'None within projection' : 'Unavailable'}</td></tr>
        </tbody></table></div>
        <p className="muted">Withdrawal estimates use accessible investments and the chosen withdrawal rate. Pension drawdown is not modelled. These figures do not establish retirement affordability.</p>
        <div className="dialog-actions"><button className="secondary-button" onClick={() => { setStage(1); title.current?.focus() }}>Back to details</button><button className="primary-button" onClick={save}>Save event</button></div>
      </>}
    </div>
  </dialog>
}
