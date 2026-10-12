import { useId, useState } from 'react'
import type { ForecastInput, ForecastYear } from '../domain/forecast'
import type { PlanEvent } from '../domain/events'
import { eventKey, eventName, eventYear } from '../domain/events'
import { forecastChartPoints } from '../engine/dashboard'
import { formatGBP } from '../formatting/money'

const colours = { isa: '#203e32', pension: '#70836a', cash: '#bc653d', equity: '#a5bbc2' }
const names = { isa: 'ISAs', pension: 'Pensions', cash: 'Cash / unfunded need', equity: 'Home equity' }
const keys = ['isa', 'pension', 'cash', 'equity'] as const
const compact = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact', maximumFractionDigits: 1 }).format(n)

export function ForecastCharts({ input, rows, events, onAddGoal }: { input: ForecastInput; rows: ForecastYear[]; events: PlanEvent[]; onAddGoal: () => void }) {
  const points = forecastChartPoints(input, rows)
  const includedGoals = events.filter(e => e.value.enabled).length
  const [selection, setSelection] = useState(0)
  const selected = Math.min(selection, points.length - 1)
  const point = points[selected]!
  const id = useId()
  const width = 1000, height = 270, left = 82, right = 24, top = 20, bottom = 36
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const x = (i: number) => left + i / Math.max(1, points.length - 1) * plotWidth
  const cumulative = (p: typeof points[number], keyIndex: number) => keys.slice(0, keyIndex).reduce((sum, key) => sum + (p[key] >= 0 ? p[key] : 0), 0)
  const negativeCumulative = (p: typeof points[number], keyIndex: number) => keys.slice(0, keyIndex).reduce((sum, key) => sum + (p[key] < 0 ? p[key] : 0), 0)
  const stackedMaximum = Math.max(...points.map(p => keys.reduce((sum, key) => sum + Math.max(0, p[key]), 0)))
  const stackedMinimum = Math.min(...points.map(p => keys.reduce((sum, key) => sum + Math.min(0, p[key]), 0)))
  const minimum = Math.min(stackedMinimum, ...points.map(p => p.netWorth))
  const maximum = Math.max(stackedMaximum, ...points.map(p => p.netWorth))
  const margin = (maximum - minimum || 1) * .08
  const low = minimum < 0 ? minimum - margin : 0, high = maximum + margin
  const y = (value: number) => top + (high - value) / (high - low) * plotHeight
  const ticks = Array.from({ length: 5 }, (_, i) => low + (high - low) * i / 4)
  const tickIndexes = [...new Set([0, ...Array.from({ length: 5 }, (_, i) => Math.round((points.length - 1) * (i + 1) / 5))])]
  const enabled = events.filter(e => e.value.enabled)
  const fireMilestones = input.household.people.map(p => ({ id: p.id, name: `${p.name} reaches FIRE`, year: p.birthYear! + (p.targetFireAge ?? input.planning.fireAge) }))
  const areaPath = (keyIndex: number) => {
    const key = keys[keyIndex]!
    const topPath = points.map((p, i) => {
      const value = p[key]
      const base = value >= 0 ? cumulative(p, keyIndex) : negativeCumulative(p, keyIndex)
      return `${i ? 'L' : 'M'}${x(i)},${y(base + value)}`
    }).join(' ')
    const bottomPath = points.slice().reverse().map((p, reverseIndex) => {
      const i = points.length - reverseIndex - 1
      const value = p[key]
      const base = value >= 0 ? cumulative(p, keyIndex) : negativeCumulative(p, keyIndex)
      return `L${x(i)},${y(base)}`
    }).join(' ')
    return `${topPath} ${bottomPath} Z`
  }
  return <section className="charts-section" aria-labelledby="net-worth-chart-heading">
    <div className="setup-card chart-card">
      <div className="section-heading chart-title-row"><div><p className="eyebrow">The bigger picture</p><h2 id="net-worth-chart-heading">Net worth through time</h2></div><button className="primary-button add-goal-button" onClick={onAddGoal}>+ Add goal</button></div>
      <p className="muted chart-caption">Real 2026 GBP · Today is your opening position; future values are annual closing balances. {includedGoals} included {includedGoals === 1 ? 'goal' : 'goals'}. Toggle goals in Milestones to update the forecast.</p>
      <ul className="chart-legend" aria-label="Chart legend"><li><span className="net-worth-key"/>Net worth</li>{keys.map(k => <li key={k}><span style={{ background: colours[k] }} />{names[k]}</li>)}</ul>
      <div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Combined net worth and asset category chart. Select a year below for exact values."><title>Net worth and account categories over time</title>
        {ticks.map(v => <g key={v}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="#e4e9df"/><text x={left - 12} y={y(v) + 4} textAnchor="end">{compact(v)}</text></g>)}
        <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="#93a18c"/>
        {tickIndexes.map(i => <text key={i} x={x(i)} y={height - 10} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{points[i]!.label}</text>)}
        {keys.map((key, i) => <path key={key} d={areaPath(i)} fill={colours[key]} fillOpacity=".66" stroke={colours[key]} strokeWidth="1"/>)}
        {fireMilestones.map((m, markerIndex) => { const i = points.findIndex((p, index) => index > 0 && p.year === m.year); return i < 0 ? null : <g key={m.id}><title>{m.name} · {m.year}</title><line x1={x(i)} x2={x(i)} y1={top} y2={height - bottom} stroke="#50684c" strokeDasharray="5 5"/><text x={x(i)} y={markerIndex % 2 ? 13 : 9} textAnchor="middle">FIRE</text></g> })}
        <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.netWorth)}`).join(' ')} fill="none" stroke="#172f27" strokeWidth="4" strokeLinejoin="round"/>
        {enabled.map(e => { const i = points.findIndex((p, index) => index > 0 && p.year === eventYear(e)); return i < 0 ? null : <circle key={eventKey(e)} cx={x(i)} cy={y(points[i]!.netWorth)} r="5" fill="#bc653d" stroke="#fff" strokeWidth="2"><title>{eventName(e)} · {eventYear(e)}</title></circle> })}
        <line x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} stroke="#172f27" strokeDasharray="3 4"/><circle cx={x(selected)} cy={y(point.netWorth)} r="5" fill="#172f27"/>
        {points.map((p, i) => <rect key={p.label} x={x(i) - plotWidth / points.length / 2} y={top} width={plotWidth / points.length} height={plotHeight} fill="transparent" onMouseEnter={() => setSelection(i)} onClick={() => setSelection(i)}><title>{p.label}: {formatGBP(p.netWorth)}</title></rect>)}
      </svg></div>
      <div className="chart-inspector"><label htmlFor={id}>Explore a year</label><select id={id} value={selected} onChange={e => setSelection(Number(e.target.value))}>{points.map((p, i) => <option key={p.label} value={i}>{p.label === 'Today' ? 'Today · opening balances' : `${p.label} · year-end`}</option>)}</select><strong>{formatGBP(point.netWorth)}</strong></div>
      <div className="category-values" aria-live="polite"><strong>{point.label}</strong>{keys.map(k => <span key={k}>{names[k]} <b>{formatGBP(point[k])}</b></span>)}</div>
      <p className="chart-markers muted">Orange dots mark included goals and life events. Dashed lines mark FIRE ages.</p>
    </div>
  </section>
}
