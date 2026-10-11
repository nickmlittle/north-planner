import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { missingDetails, snapshotTotals } from '../domain/setup'
import { eventKey, eventName, eventYear, planEvents } from '../domain/events'
import { documentForecast } from '../state/forecast'
import { formatGBP } from '../formatting/money'
import { PlannerHeader } from '../components/PlannerHeader'
import { PlanEvents } from '../components/PlanEvents'
import { ForecastCharts } from '../components/ForecastCharts'
import { ForecastResults } from '../components/ForecastResults'

export function HouseholdDashboard({ document: doc, setDocument, warning, replaceSavedDraft, accountBacked = false, saveStatus }: {
  document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string
}) {
  const heading = useRef<HTMLHeadingElement>(null)
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
    ...planEvents(doc).filter(e => e.value.enabled).map(e => ({ id: eventKey(e), year: eventYear(e), label: eventName(e), kind: 'Life event' })),
    ...doc.snapshot.people.filter(p => p.role !== 'child' && p.dob).flatMap(p => [
      { id: `${p.id}-fire`, year: Number(p.dob.slice(0, 4)) + doc.planning.fireAge, label: `${p.name} reaches FIRE`, kind: 'Retirement' },
      { id: `${p.id}-pension`, year: Number(p.dob.slice(0, 4)) + doc.planning.pensionAccessAge, label: `${p.name} pension access`, kind: 'Pension access' },
    ]),
  ].sort((a, b) => a.year - b.year)
  return <div className="north-shell dashboard-shell"><PlannerHeader step={9} go={go} warning={warning} replaceSavedDraft={replaceSavedDraft} accountBacked={accountBacked} saveStatus={saveStatus} />
    <main className="dashboard-main"><div className="route-heading"><div><p className="eyebrow">{doc.snapshot.name} · A little direction</p><h1 ref={heading} tabIndex={-1}>Your route ahead</h1><p className="page-description">A clear view of today’s position, the milestones ahead and the choices shaping your future.</p></div><svg className="route-illustration" viewBox="0 0 260 110" role="img" aria-label="Woodland hills and a winding trail"><path d="M0 88 43 43l29 34 37-58 47 63 28-34 76 40H0Z"/><path d="M0 96h260M73 77c25-14 39-4 49-16s-4-18 14-26 25-3 31-14"/><path d="M113 82v-19m-8 9h16m-8-20v-9m-7 5h14"/><path d="M42 83V62m-9 10h18m-9-23V40m-6 5h12m125 39V64m-9 9h18m-9-25V38m-6 6h12"/></svg></div>
      <div className="dashboard-tiles">{tiles.map(tile => <section className="dashboard-tile" key={tile.title}><h2>{tile.title}</h2><p>{tile.value}</p><small>{tile.detail}</small></section>)}</div>
      <details className="metric-explanation"><summary>How the FIRE withdrawal estimate works</summary><p>We use year-end balances when the youngest adult reaches the configured FIRE age, or the base year if everyone has already reached it. The estimate applies your withdrawal rate to ISAs, positive cash and pensions whose owners have reached pension access age. Home equity and locked pensions are excluded.</p>{metrics && <p>Accessible investments: {money(metrics.accessible)}. Locked pensions excluded: {money(metrics.lockedPension)}.</p>}<p>This is an indicative estimate, not a model of sustainable retirement income. Pension withdrawals and retirement tax are not modelled; the forecast continues to fund costs from cash and ISAs.</p></details>
      {result.error && <section className="setup-card" aria-labelledby="complete-heading"><h2 id="complete-heading">Complete your picture</h2><p role="status">Forecast unavailable: {result.error}</p><ul className="missing-list">{missing.map((m, i) => <li key={i}><span>{m.label}</span><button className="text-button" onClick={() => go(m.step === 9 ? 10 : m.step)}>Add details</button></li>)}</ul>{!missing.length && <button className="secondary-button" onClick={() => go(10)}>Review plan settings</button>}</section>}
      {result.rows.some(r => r.unfundedCash > 0) && <p className="context-note" role="status">This plan has unfunded cash needs from {metrics?.firstUnfundedYear}. Later balances include that cumulative need; pension assets are not drawn down. These results do not establish retirement affordability.</p>}
      {input && !result.error && <ForecastCharts input={input} rows={result.rows} events={planEvents(doc)} />}
      <section className="setup-card milestone-card" aria-labelledby="milestones-heading"><div className="section-heading"><div><p className="eyebrow">Waypoints</p><h2 id="milestones-heading">Milestones on your route</h2></div><span className="chart-basis">Based on your plan settings</span></div>{milestones.length ? <ol className="milestone-list">{milestones.map(m => <li key={m.id}><span className="milestone-year">{m.year}</span><span className="milestone-pin" aria-hidden="true"/><span className="milestone-copy"><strong>{m.label}</strong><small>{m.kind}</small></span></li>)}</ol> : <p className="muted">Add a move or goal to mark a waypoint on your route.</p>}</section>
      <PlanEvents document={doc} setDocument={setDocument} />
      <details className="forecast-details"><summary>Explore annual forecast and reconciliation</summary><ForecastResults result={result} people={input?.household.people ?? []} /></details>
      <footer className="journey-footer">Deterministic projection · Real 2026 GBP · {accountBacked ? 'Saved to your account' : 'Saved on this device'}</footer>
    </main></div>
}
