import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { missingDetails, snapshotTotals } from '../domain/setup'
import { eventKey, eventName, eventYear, planEvents, putPlanEvent } from '../domain/events'
import type { PlanEvent } from '../domain/events'
import { documentForecast } from '../state/forecast'
import { formatGBPSummary, formatGBPAnnual } from '../formatting/money'
import { PlannerHeader } from '../components/PlannerHeader'
import { ForecastCharts } from '../components/ForecastCharts'
import { EventDialog } from '../components/EventDialog'
import { PropertyMoveScenario } from '../components/PropertyMoveScenario'
import type { PropertyMove } from '../domain/property'
import { pricedPropertyMove } from '../domain/property'

export function HouseholdDashboard({ document: doc, setDocument, warning, replaceSavedDraft, accountBacked = false, saveStatus, email, onSignOut }: {
  document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string; email?: string; onSignOut?: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [editingEvent, setEditingEvent] = useState<PlanEvent | 'new' | null>(null)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [scenarioMoveId, setScenarioMoveId] = useState(() => doc.moves.find(m => m.enabled)?.id ?? doc.moves[0]?.id ?? '')
  const [scenarioDraft, setScenarioDraft] = useState<{ id: string; value: PropertyMove } | null>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo?.(0, 0) }, [])
  const go = (step: number) => setDocument(d => ({ ...d, step, completed: d.completed || step >= 8 }))
  const { input, result, metrics } = documentForecast(doc)
  const baseMove = doc.moves.find(m => m.id === scenarioMoveId) ?? doc.moves[0]
  const scenarioMove = baseMove ? (scenarioDraft?.id === baseMove.id ? scenarioDraft.value : baseMove) : undefined
  const scenarioDirty = Boolean(baseMove && scenarioMove && JSON.stringify(baseMove) !== JSON.stringify(scenarioMove))
  const scenarioDocument = scenarioDirty && baseMove && scenarioMove ? { ...doc, moves: doc.moves.map(m => m.id === baseMove.id ? pricedPropertyMove(scenarioMove) : m) } : undefined
  const scenarioForecast = scenarioDocument ? documentForecast(scenarioDocument) : undefined
  const shownResult = scenarioDirty ? scenarioForecast!.result : result
  const shownMetrics = scenarioDirty ? scenarioForecast?.metrics : metrics
  const goals = planEvents(doc)
  const chartGoals = scenarioDirty && scenarioMove ? goals.map(event => event.kind === 'move' && event.value.id === scenarioMove.id
    ? { kind: 'move' as const, value: scenarioMove } : event) : goals
  const totals = snapshotTotals(doc.snapshot)
  const missing = missingDetails(doc.snapshot, true)
  const money = (n: number | null | undefined) => n == null ? 'Not available' : formatGBPSummary(n)
  const finalYear = shownResult.rows.at(-1)?.year
  const fundingValue = shownMetrics ? shownMetrics.firstUnfundedYear == null ? finalYear ? `Funded through ${finalYear}` : 'Unavailable' : `Shortfall from ${shownMetrics.firstUnfundedYear}` : 'Unavailable'
  const tiles = [
    { title: 'Net worth today', value: totals.netWorth === null ? 'Incomplete' : money(totals.netWorth), detail: totals.netWorth === null ? `Known assets: ${money(totals.knownAssets)}` : 'Current assets less mortgage debt' },
    { title: 'Net worth at retirement', value: money(shownMetrics?.fireNetWorth), detail: scenarioDirty ? `What-if · current plan ${money(metrics?.fireNetWorth)} · ${shownMetrics?.fireYear} year-end` : shownMetrics ? `Year-end ${shownMetrics.fireYear} · all adults reach their configured FIRE age` : 'Complete your details to project ahead' },
    { title: 'Indicative annual withdrawal', value: shownMetrics?.annualWithdrawal == null ? 'Not available' : formatGBPAnnual(shownMetrics.annualWithdrawal), detail: scenarioDirty ? `What-if · current plan ${metrics?.annualWithdrawal == null ? 'Not available' : formatGBPAnnual(metrics.annualWithdrawal)} · ${Number((doc.planning.withdrawalRate * 100).toFixed(2))}% rate` : `${Number((doc.planning.withdrawalRate * 100).toFixed(2))}% of accessible investments` },
    { title: 'Plan funding', value: fundingValue, detail: shownMetrics ? shownMetrics.firstUnfundedYear == null ? 'No projected shortfall' : 'Cash and ISAs run short; the cumulative need is shown after this year.' : 'Funding result unavailable' },
  ]
  const milestones = [
    ...goals.map(e => ({ id: eventKey(e), year: eventYear(e), label: e.kind === 'move' ? `${e.value.name}` : eventName(e), kind: e.kind, event: e, target: undefined as string | undefined })),
    ...doc.snapshot.people.filter(p => p.role !== 'child' && p.dob).flatMap(p => [
      { id: `${p.id}-fire`, year: Number(p.dob.slice(0, 4)) + doc.planning.fireAge, label: `${p.name.trim().split(/\s+/)[0]} · Work optional`, kind: 'retirement', event: undefined, target: 'planning-fire-age' },
      { id: `${p.id}-pension`, year: Number(p.dob.slice(0, 4)) + doc.planning.pensionAccessAge, label: `${p.name.trim().split(/\s+/)[0]} · Pension access`, kind: 'pension', event: undefined, target: 'planning-pension-age' },
    ]),
  ].sort((a, b) => a.year - b.year || a.label.localeCompare(b.label))
  return <div className="north-shell dashboard-shell"><PlannerHeader step={9} go={go} warning={warning} replaceSavedDraft={replaceSavedDraft} accountBacked={accountBacked} saveStatus={saveStatus} email={email} onSignOut={onSignOut} />
    <main className="dashboard-main dashboard-container"><div className="route-heading"><div><h1 ref={heading} tabIndex={-1}>Your route ahead</h1><p className="page-description">Adjust a property move to explore its forecast impact. Save changes to update the plan; Milestones controls include or exclude saved goals.</p></div><svg className="route-illustration" viewBox="0 0 260 110" role="img" aria-label="Woodland hills and a winding trail"><path d="M0 88 43 43l29 34 37-58 47 63 28-34 76 40H0Z"/><path d="M0 96h260M73 77c25-14 39-4 49-16s-4-18 14-26 25-3 31-14"/><path d="M113 82v-19m-8 9h16m-8-20v-9m-7 5h14"/><path d="M42 83V62m-9 10h18m-9-23V40m-6 5h12m125 39V64m-9 9h18m-9-25V38m-6 6h12"/></svg></div>
      <div className="dashboard-tiles">{tiles.map(tile => <section className="dashboard-tile" key={tile.title}><h2>{tile.title}</h2><p>{tile.value}</p><small>{tile.detail}</small>{tile.title === 'Indicative annual withdrawal' && <div className="metric-help"><button className="metric-help-trigger" type="button" aria-label="How this estimate works" aria-describedby="withdrawal-estimate-help">i</button><div className="metric-tooltip" id="withdrawal-estimate-help" role="tooltip"><strong>How this estimate works</strong><p>Applies your withdrawal rate to ISAs, positive cash and pensions accessible at FIRE. Home equity and locked pensions are excluded; pension withdrawals and retirement tax are not modelled.</p>{shownMetrics && <p>Accessible investments: {money(shownMetrics.accessible)}. Locked pensions: {money(shownMetrics.lockedPension)}.</p>}</div></div>}</section>)}</div>
      {shownResult.error && <section className="dashboard-alert" aria-labelledby="complete-heading"><strong id="complete-heading">Complete your picture</strong><span role="status">Forecast unavailable: {shownResult.error}</span><div>{missing.slice(0, 2).map((m, i) => <button className="text-button" key={i} onClick={() => go(m.step === 9 ? 10 : m.step)}>Add {m.label.toLowerCase()}</button>)}{!missing.length && <button className="text-button" onClick={() => go(10)}>Review plan settings</button>}</div></section>}
      <div className="dashboard-overview">
        {input && !result.error ? <ForecastCharts input={input} rows={result.rows} events={chartGoals} onAddGoal={() => setEditingEvent('new')}
          comparison={scenarioDirty && scenarioForecast?.input && !scenarioForecast.result.error ? { input: scenarioForecast.input, rows: scenarioForecast.result.rows } : undefined} /> : <section className="setup-card dashboard-chart-placeholder"><div className="section-heading"><h2>Net worth over time</h2><button className="primary-button add-goal-button" onClick={() => setEditingEvent('new')}>+ Add goal</button></div><p className="muted">Complete your household details to see your projected net worth and asset breakdown.</p></section>}
        {scenarioOpen ? baseMove && scenarioMove ? <PropertyMoveScenario move={pricedPropertyMove(scenarioMove)} base={baseMove} moves={doc.moves} maxYear={input?.household.assumptions.endYear ?? Math.max(2026, baseMove.year)}
            onSelect={id => { setScenarioMoveId(id); setScenarioDraft(null) }} onChange={value => setScenarioDraft({ id: value.id, value })}
            onReset={() => setScenarioDraft(null)} dirty={scenarioDirty} error={scenarioDirty ? scenarioForecast?.result.error : undefined}
            onSave={() => {
              const next = pricedPropertyMove({ ...scenarioMove, enabled: true })
              setDocument(d => ({ ...d, moves: d.moves.map(m => m.id === next.id ? next : m) }))
              setScenarioDraft(null)
            }} onClose={() => setScenarioOpen(false)} /> : <section className="setup-card move-scenario scenario-panel"><div className="section-heading"><div><p className="eyebrow">Explore a what-if</p><h2>Property move scenario</h2></div><button className="secondary-button" onClick={() => setScenarioOpen(false)}>Close</button></div><p className="muted">Add a house move to adjust its timing, price, and cost assumptions against your current plan.</p><button className="primary-button" onClick={() => setEditingEvent('new')}>+ Add house move</button></section>
          : <section className="setup-card milestone-card" aria-labelledby="milestones-heading"><div className="section-heading"><div><h2 id="milestones-heading">Milestones</h2></div><button className="secondary-button scenario-launch" onClick={() => setScenarioOpen(true)}>Explore a move</button></div>{milestones.length ? <ol className="milestone-list">{milestones.map(m => {
          return <li key={m.id} className={m.event && !m.event.value.enabled ? 'milestone-excluded' : undefined}><span className="milestone-year">{m.year}</span><span className={`milestone-pin milestone-pin-${m.kind}`} aria-hidden="true"/><span className="milestone-copy">{m.event ? <button className="milestone-link" onClick={() => setEditingEvent(m.event!)}>{m.label}</button> : <button className="milestone-link" onClick={() => { window.location.hash = m.target!; go(10) }}>{m.label}</button>}{m.event && !m.event.value.enabled && <span className="milestone-status">Excluded</span>}</span></li>
        })}</ol> : <p className="muted">Add a goal to mark a waypoint.</p>}</section>}
      </div>
      {editingEvent && <EventDialog document={doc} event={editingEvent === 'new' ? undefined : editingEvent} onClose={() => setEditingEvent(null)} onSave={event => { setDocument(d => putPlanEvent(d, event)); setEditingEvent(null) }} />}
    </main></div>
}
