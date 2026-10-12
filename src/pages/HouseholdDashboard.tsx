import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { missingDetails, snapshotTotals } from '../domain/setup'
import { eventKey, eventName, eventYear, planEvents, putPlanEvent } from '../domain/events'
import type { PlanEvent } from '../domain/events'
import { documentForecast } from '../state/forecast'
import { formatGBP } from '../formatting/money'
import { PlannerHeader } from '../components/PlannerHeader'
import { ForecastCharts } from '../components/ForecastCharts'
import { EventDialog } from '../components/EventDialog'

export function HouseholdDashboard({ document: doc, setDocument, warning, replaceSavedDraft, accountBacked = false, saveStatus }: {
  document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [editingEvent, setEditingEvent] = useState<PlanEvent | 'new' | null>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo?.(0, 0) }, [])
  const go = (step: number) => setDocument(d => ({ ...d, step, completed: d.completed || step >= 8 }))
  const { input, result, metrics } = documentForecast(doc)
  const totals = snapshotTotals(doc.snapshot)
  const missing = missingDetails(doc.snapshot, true)
  const money = (n: number | null | undefined) => n == null ? 'Not available' : formatGBP(n)
  const tiles = [
    { title: 'Net worth today', value: totals.netWorth === null ? 'Incomplete' : money(totals.netWorth), detail: totals.netWorth === null ? `Known assets: ${money(totals.knownAssets)}` : 'Your current assets, less mortgage debt' },
    { title: 'Projected net worth at FIRE', value: money(metrics?.fireNetWorth), detail: metrics ? `Year-end ${metrics.fireYear} · all adults reach FIRE` : 'Complete your details to project ahead' },
    { title: 'Indicative annual withdrawal at FIRE', value: money(metrics?.annualWithdrawal), detail: `${Number((doc.planning.withdrawalRate * 100).toFixed(2))}% of accessible investments` },
    { title: 'First unfunded year', value: metrics ? metrics.firstUnfundedYear?.toString() ?? 'None' : 'Not available', detail: metrics?.firstUnfundedYear ? 'Cash and ISAs no longer cover planned costs' : 'Within the projection horizon' },
  ]
  const milestones = [
    ...planEvents(doc).filter(e => e.value.enabled).map(e => ({ id: eventKey(e), year: eventYear(e), label: eventName(e), kind: 'Life event', event: e, target: undefined as string | undefined })),
    ...doc.snapshot.people.filter(p => p.role !== 'child' && p.dob).flatMap(p => [
      { id: `${p.id}-fire`, year: Number(p.dob.slice(0, 4)) + doc.planning.fireAge, label: `${p.name} reaches FIRE`, kind: 'Retirement', event: undefined, target: 'planning-fire-age' },
      { id: `${p.id}-pension`, year: Number(p.dob.slice(0, 4)) + doc.planning.pensionAccessAge, label: `${p.name} pension access`, kind: 'Pension access', event: undefined, target: 'planning-pension-age' },
    ]),
  ].sort((a, b) => a.year - b.year)
  return <div className="north-shell dashboard-shell"><PlannerHeader step={9} go={go} warning={warning} replaceSavedDraft={replaceSavedDraft} accountBacked={accountBacked} saveStatus={saveStatus} />
    <main className="dashboard-main"><div className="route-heading"><div><p className="eyebrow">{doc.snapshot.name} · Your household outlook</p><h1 ref={heading} tabIndex={-1}>Your route ahead</h1><p className="page-description">A clear view of today’s position, the milestones ahead and the choices shaping your future.</p></div><svg className="route-illustration" viewBox="0 0 260 110" role="img" aria-label="Woodland hills and a winding trail"><path d="M0 88 43 43l29 34 37-58 47 63 28-34 76 40H0Z"/><path d="M0 96h260M73 77c25-14 39-4 49-16s-4-18 14-26 25-3 31-14"/><path d="M113 82v-19m-8 9h16m-8-20v-9m-7 5h14"/><path d="M42 83V62m-9 10h18m-9-23V40m-6 5h12m125 39V64m-9 9h18m-9-25V38m-6 6h12"/></svg></div>
      <div className="dashboard-tiles">{tiles.map(tile => <section className="dashboard-tile" key={tile.title}><h2>{tile.title}</h2><p>{tile.value}</p><small>{tile.detail}</small>{tile.title === 'Indicative annual withdrawal at FIRE' && <details className="metric-explanation"><summary>How this estimate works</summary><p>Applies your withdrawal rate to ISAs, positive cash and pensions accessible at FIRE. Home equity and locked pensions are excluded; pension withdrawals and retirement tax are not modelled.</p>{metrics && <p>Accessible investments: {money(metrics.accessible)}. Locked pensions: {money(metrics.lockedPension)}.</p>}</details>}</section>)}</div>
      {result.error && <section className="dashboard-alert" aria-labelledby="complete-heading"><strong id="complete-heading">Complete your picture</strong><span role="status">Forecast unavailable: {result.error}</span><div>{missing.slice(0, 2).map((m, i) => <button className="text-button" key={i} onClick={() => go(m.step === 9 ? 10 : m.step)}>Add {m.label.toLowerCase()}</button>)}{!missing.length && <button className="text-button" onClick={() => go(10)}>Review plan settings</button>}</div></section>}
      {result.rows.some(r => r.unfundedCash > 0) && <p className="context-note dashboard-context" role="status">Unfunded cash needs begin in {metrics?.firstUnfundedYear}; later balances include that cumulative need. Pension assets are not drawn down.</p>}
      <div className="dashboard-overview">
        {input && !result.error ? <ForecastCharts input={input} rows={result.rows} events={planEvents(doc)} onAddGoal={() => setEditingEvent('new')} /> : <section className="setup-card dashboard-chart-placeholder"><div className="section-heading"><h2>Net worth through time</h2><button className="primary-button add-goal-button" onClick={() => setEditingEvent('new')}>+ Add goal</button></div><p className="muted">Complete your household details to see your projected net worth and asset breakdown.</p></section>}
        <section className="setup-card milestone-card" aria-labelledby="milestones-heading"><div className="section-heading"><div><p className="eyebrow">Waypoints</p><h2 id="milestones-heading">Milestones</h2></div></div>{milestones.length ? <ol className="milestone-list">{milestones.map(m => <li key={m.id}><span className="milestone-year">{m.year}</span><span className="milestone-pin" aria-hidden="true"/><span className="milestone-copy">{m.event ? <button className="milestone-link" onClick={() => setEditingEvent(m.event!)}>{m.label}</button> : <button className="milestone-link" onClick={() => { window.location.hash = m.target!; go(10) }}>{m.label}</button>}<small>{m.kind}</small></span></li>)}</ol> : <p className="muted">Add a goal to mark a waypoint.</p>}</section>
      </div>
      {editingEvent && <EventDialog document={doc} event={editingEvent === 'new' ? undefined : editingEvent} onClose={() => setEditingEvent(null)} onSave={event => { setDocument(d => putPlanEvent(d, event)); setEditingEvent(null) }} />}
    </main></div>
}
