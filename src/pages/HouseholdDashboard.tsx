import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { missingDetails, snapshotTotals } from '../domain/setup'
import { eventKey, eventName, eventYear, planEvents, putPlanEvent } from '../domain/events'
import type { PlanEvent } from '../domain/events'
import { documentForecast } from '../state/forecast'
import { formatGBPSummary, formatGBPAnnual } from '../formatting/money'
import { ForecastCharts } from '../components/ForecastCharts'
import { EventDialog } from '../components/EventDialog'
import { PropertyMoveScenario } from '../components/PropertyMoveScenario'
import type { PropertyMove } from '../domain/property'
import { pricedPropertyMove } from '../domain/property'
import { navigateToDashboard, navigateToHousehold, navigateToSettings } from '../state/navigation'
import { BalanceDateReview } from '../components/BalanceDateReview'
import { SummaryTile, SummaryTiles } from '../components/SummaryTiles'
import { PageFrame } from '../components/PageFrame'
import type { SettingsSection } from '../state/navigation'

export function HouseholdDashboard({ document: doc, setDocument, onSelectView }: {
  document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; warning?: string; replaceSavedDraft?: () => void; downloadOriginal?: () => void; recoveryOriginal?: string; accountBacked?: boolean; saveStatus?: string; email?: string; onSignOut?: () => void; settingsSection?: SettingsSection; onSelectSettings?: (section: SettingsSection) => void; onSelectView?: (view: 'dashboard' | 'household' | 'budget') => void; currentView?: 'dashboard' | 'household' | 'budget'
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [editingEvent, setEditingEvent] = useState<PlanEvent | 'new' | null>(null)
  const [milestonesExpanded, setMilestonesExpanded] = useState(false)
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [scenarioMoveId, setScenarioMoveId] = useState(() => doc.moves.find(m => m.enabled)?.id ?? doc.moves[0]?.id ?? '')
  const [scenarioDraft, setScenarioDraft] = useState<{ id: string; value: PropertyMove } | null>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo?.(0, 0) }, [])
  const go = (step: number) => {
    if (step === 9) { if (onSelectView) onSelectView('dashboard'); else navigateToDashboard() }
    else if (step === 10) navigateToSettings('planning')
    else navigateToHousehold(step)
  }
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
  const planningStartYear = Number(doc.snapshot.planningStartDate.slice(0, 4))
  const fallbackFireYear = Math.max(planningStartYear, ...doc.snapshot.people.filter(person => person.role !== 'child' && person.dob).map(person => Number(person.dob.slice(0, 4)) + doc.planning.fireAge))
  const projectionLabel = `Projected net worth · work optional ${shownMetrics?.fireYear ?? fallbackFireYear}`
  const milestones = [
    ...goals.map(e => ({ id: eventKey(e), year: eventYear(e), label: e.kind === 'move' ? `${e.value.name}` : eventName(e), kind: e.kind, event: e, target: undefined as string | undefined })),
    ...doc.snapshot.people.filter(p => p.role !== 'child' && p.dob).flatMap(p => [
      { id: `${p.id}-fire`, year: Number(p.dob.slice(0, 4)) + doc.planning.fireAge, label: `${p.name.trim().split(/\s+/)[0]} · Work optional`, kind: 'retirement', event: undefined, target: 'planning-fire-age' },
      { id: `${p.id}-pension`, year: Number(p.dob.slice(0, 4)) + doc.planning.pensionAccessAge, label: `${p.name.trim().split(/\s+/)[0]} · Pension access`, kind: 'pension', event: undefined, target: 'planning-pension-age' },
    ]),
  ].sort((a, b) => a.year - b.year || a.label.localeCompare(b.label))
  const upcomingMilestones = milestones.filter(m => m.year >= Number(doc.snapshot.planningStartDate.slice(0, 4)))
  const visibleMilestones = milestonesExpanded ? upcomingMilestones : upcomingMilestones.slice(0, 3)
  const annualWithdrawal = shownMetrics?.annualWithdrawal == null ? 'Not available' : formatGBPAnnual(shownMetrics.annualWithdrawal)
  return <div className={`north-shell dashboard-shell${milestonesExpanded ? ' milestones-expanded' : ''}`}>
    <PageFrame className="dashboard-main" headingRef={heading} title="Your route ahead" summary={<div className="dashboard-summary"><SummaryTiles label="Dashboard headline summary" className="dashboard-primary-tiles"><SummaryTile label="Net worth today" value={totals.netWorth === null ? 'Incomplete' : money(totals.netWorth)} className="dashboard-primary-tile"/><SummaryTile label={projectionLabel} value={money(shownMetrics?.fireNetWorth)} className="dashboard-primary-tile"/></SummaryTiles><div className="dashboard-supporting-metrics"><span>Indicative annual withdrawal <strong>{annualWithdrawal}</strong><span className="metric-help"><button className="metric-help-trigger" type="button" aria-label="How this estimate works" aria-describedby="withdrawal-estimate-help">i</button><span className="metric-tooltip" id="withdrawal-estimate-help" role="tooltip"><strong>How this estimate works</strong><span>Applies your withdrawal rate to ISAs, positive cash and pensions accessible at the work-optional date. Home equity and locked pensions are excluded; pension withdrawals and retirement tax are not modelled.</span>{shownMetrics && <span>Accessible investments: {money(shownMetrics.accessible)}. Locked pensions: {money(shownMetrics.lockedPension)}.</span>}</span></span></span><span>Funding horizon <strong>{fundingValue}</strong></span></div></div>} afterSummary={!doc.balanceDatesReviewed ? <details className="dashboard-date-review"><summary>Finish balance date review</summary><BalanceDateReview document={doc} setDocument={setDocument} onReview={() => go(3)} /></details> : undefined}>
      {shownResult.error && <section className="dashboard-alert" aria-labelledby="complete-heading"><strong id="complete-heading">Complete your picture</strong><span role="status">Forecast unavailable: {shownResult.error}</span><div>{missing.slice(0, 2).map((m, i) => <button className="text-button" key={i} onClick={() => m.step === 9 ? navigateToSettings('children') : go(m.step)}>Add {m.label.toLowerCase()}</button>)}{!missing.length && <button className="text-button" onClick={() => navigateToSettings('planning')}>Review plan settings</button>}</div></section>}
      <div className="dashboard-overview">
        {input && !result.error ? <ForecastCharts input={input} rows={result.rows} events={chartGoals} onAddGoal={() => setEditingEvent('new')}
          comparison={scenarioDirty && scenarioForecast?.input && !scenarioForecast.result.error ? { input: scenarioForecast.input, rows: scenarioForecast.result.rows } : undefined} /> : <section className="setup-card dashboard-chart-placeholder"><div className="section-heading"><h2>Net worth over time</h2><button className="primary-button add-goal-button" onClick={() => setEditingEvent('new')}>+ Add goal</button></div><p className="muted">Complete your household details to see your projected net worth and asset breakdown.</p></section>}
        {scenarioOpen ? baseMove && scenarioMove ? <PropertyMoveScenario move={pricedPropertyMove(scenarioMove)} base={baseMove} moves={doc.moves} minYear={Number(doc.snapshot.planningStartDate.slice(0, 4))} maxYear={input?.household.assumptions.endYear ?? Math.max(Number(doc.snapshot.planningStartDate.slice(0, 4)), baseMove.year)}
            onSelect={id => { setScenarioMoveId(id); setScenarioDraft(null) }} onChange={value => setScenarioDraft({ id: value.id, value })}
            onReset={() => setScenarioDraft(null)} dirty={scenarioDirty} error={scenarioDirty ? scenarioForecast?.result.error : undefined}
            onSave={() => {
              const next = pricedPropertyMove({ ...scenarioMove, enabled: true })
              setDocument(d => ({ ...d, moves: d.moves.map(m => m.id === next.id ? next : m) }))
              setScenarioDraft(null)
            }} onClose={() => setScenarioOpen(false)} /> : <section className="setup-card move-scenario scenario-panel"><div className="section-heading"><div><p className="eyebrow">Explore a what-if</p><h2>Property move scenario</h2></div><button className="secondary-button" onClick={() => setScenarioOpen(false)}>Close</button></div><p className="muted">Add a house move to adjust its timing, price, and cost assumptions against your current plan.</p><button className="primary-button" onClick={() => setEditingEvent('new')}>+ Add house move</button></section>
          : <section className="setup-card milestone-card" aria-labelledby="milestones-heading"><div className="section-heading"><div><h2 id="milestones-heading">Milestones</h2></div><button className="secondary-button scenario-launch" onClick={() => setScenarioOpen(true)}>Explore a move</button></div>{upcomingMilestones.length ? <><ol className="milestone-list">{visibleMilestones.map(m => {
          return <li key={m.id} className={m.event && !m.event.value.enabled ? 'milestone-excluded' : undefined}><span className="milestone-year">{m.year}</span><span className={`milestone-pin milestone-pin-${m.kind}`} aria-hidden="true"/><span className="milestone-copy">{m.event ? <button className="milestone-link" onClick={() => setEditingEvent(m.event!)}>{m.label}</button> : <button className="milestone-link" onClick={() => { window.location.hash = m.target!; navigateToSettings('planning') }}>{m.label}</button>}{m.event && !m.event.value.enabled && <span className="milestone-status">Excluded</span>}</span></li>
        })}</ol>{upcomingMilestones.length > 3 && <button type="button" className="text-button milestone-more" aria-expanded={milestonesExpanded} onClick={() => setMilestonesExpanded(value => !value)}>{milestonesExpanded ? 'Show fewer milestones' : `Show all ${upcomingMilestones.length} milestones`}</button>}</> : <p className="muted">Add a goal to mark a waypoint.</p>}</section>}
      </div>
      {editingEvent && <EventDialog document={doc} event={editingEvent === 'new' ? undefined : editingEvent} onClose={() => setEditingEvent(null)} onSave={event => { setDocument(d => putPlanEvent(d, event)); setEditingEvent(null) }} />}
    </PageFrame></div>
}
