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
export function ForecastCharts({ input, rows, events }: { input: ForecastInput; rows: ForecastYear[]; events: PlanEvent[] }) {
  const points = forecastChartPoints(input, rows)
  const [selection, setSelection] = useState(0)
  const selected = Math.min(selection, points.length - 1)
  const point = points[selected]!
  const id = useId()
  const width = 1000, height = 320, left = 82, right = 24, top = 30, bottom = 40
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const x = (i: number) => left + i / Math.max(1, points.length - 1) * plotWidth
  function scale(minimum: number, maximum: number) {
    const min = Math.min(0, minimum), max = Math.max(1, maximum)
    const margin = (max - min) * .08
    const low = min < 0 ? min - margin : 0, high = max + margin
    return { y: (v: number) => top + (high - v) / (high - low) * plotHeight, ticks: Array.from({ length: 5 }, (_, i) => low + (high - low) * i / 4) }
  }
  const line = scale(Math.min(...points.map(p => p.netWorth)), Math.max(...points.map(p => p.netWorth)))
  const bars = scale(Math.min(...points.map(p => keys.reduce((s, k) => s + Math.min(0, p[k]), 0))), Math.max(...points.map(p => keys.reduce((s, k) => s + Math.max(0, p[k]), 0))))
  const tickIndexes = [...new Set([0, ...Array.from({ length: 5 }, (_, i) => Math.round((points.length - 1) * (i + 1) / 5))])]
  const axes = (s: ReturnType<typeof scale>) => <>{s.ticks.map(v => <g key={v}><line x1={left} x2={width - right} y1={s.y(v)} y2={s.y(v)} stroke="#e4e9df" /><text x={left - 12} y={s.y(v) + 4} textAnchor="end">{compact(v)}</text></g>)}<line x1={left} x2={width - right} y1={s.y(0)} y2={s.y(0)} stroke="#93a18c" />{tickIndexes.map(i => <text key={i} x={x(i)} y={height - 12} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{points[i]!.label}</text>)}</>
  const enabled = events.filter(e => e.value.enabled)
  const milestones = input.household.people.map(p => ({ id: p.id, name: `${p.name} reaches FIRE`, year: p.birthYear! + (p.targetFireAge ?? input.planning.fireAge) }))
  return <section className="charts-section" aria-label="Projected balances"><div className="setup-card chart-card"><div className="section-heading"><div><p className="eyebrow">The bigger picture</p><h2>Net worth through time</h2></div><span className="chart-basis">Real 2026 GBP</span></div>
    <p className="muted">Today is your opening position; future values are annual closing balances.</p><div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net worth line chart. Select a year below for exact values."><title>Projected net worth through time</title>{axes(line)}
      {milestones.map((m, markerIndex) => { const i = points.findIndex((p, index) => index > 0 && p.year === m.year); return i < 0 ? null : <g key={m.id}><title>{m.name} · {m.year}</title><line x1={x(i)} x2={x(i)} y1={top} y2={height - bottom} stroke="#9bad83" strokeDasharray="5 5" /><text x={x(i)} y={markerIndex % 2 ? 29 : 17} textAnchor="middle">FIRE</text></g> })}
      <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${line.y(p.netWorth)}`).join(' ')} fill="none" stroke="#203e32" strokeWidth="3" />
      {enabled.map(e => { const i = points.findIndex((p, index) => index > 0 && p.year === eventYear(e)); return i < 0 ? null : <circle key={eventKey(e)} cx={x(i)} cy={line.y(points[i]!.netWorth)} r="5" fill="#bc653d" stroke="#fff"><title>{eventName(e)} · {eventYear(e)}</title></circle> })}
      <line x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} stroke="#203e32" strokeDasharray="3 4" /><circle cx={x(selected)} cy={line.y(point.netWorth)} r="5" fill="#203e32" />
      {points.map((p, i) => <rect key={p.label} x={x(i) - plotWidth / points.length / 2} y={top} width={plotWidth / points.length} height={plotHeight} fill="transparent" onMouseEnter={() => setSelection(i)} onClick={() => setSelection(i)}><title>{p.label}: {formatGBP(p.netWorth)}</title></rect>)}
    </svg></div>
    <div className="chart-inspector"><label htmlFor={id}>Explore a year</label><select id={id} value={selected} onChange={e => setSelection(Number(e.target.value))}>{points.map((p, i) => <option key={p.label} value={i}>{p.label === 'Today' ? 'Today · opening balances' : `${p.label} · year-end`}</option>)}</select><strong>{formatGBP(point.netWorth)}</strong></div>
    <p className="chart-markers muted">{milestones.map(m => `${m.name} in ${m.year}`).join(' · ')}{enabled.length > 0 && ' · Gold dots mark included life events.'}</p>
    {enabled.filter(e => eventYear(e) === point.year && selected > 0).length > 0 && <p className="muted">Events in {point.year}: {enabled.filter(e => eventYear(e) === point.year).map(eventName).join(', ')}</p>}
  </div>
  <div className="setup-card chart-card"><div className="section-heading"><h2>Where your net worth sits</h2><span className="chart-basis">Annual category balances</span></div><ul className="chart-legend">{keys.map(k => <li key={k}><span style={{ background: colours[k] }} />{names[k]}</li>)}</ul>
    <div className="chart-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Annual stacked account category bars. Negative cash and equity appear below zero."><title>ISAs, pensions, cash and home equity by year</title>{axes(bars)}
      {points.slice(1).map((p, index) => { let positive = 0, negative = 0; const i = index + 1; const barWidth = Math.min(24, Math.max(1, plotWidth / points.length * .7))
        return <g key={p.label} onMouseEnter={() => setSelection(i)} onClick={() => setSelection(i)}><title>{p.label}: {keys.map(k => `${names[k]} ${formatGBP(p[k])}`).join('; ')}</title>{keys.map(k => { const value = p[k]; const base = value >= 0 ? positive : negative; if (value >= 0) positive += value; else negative += value
          return <rect key={k} x={x(i) - barWidth / 2} y={bars.y(Math.max(base, base + value))} width={barWidth} height={Math.abs(bars.y(base) - bars.y(base + value))} fill={colours[k]} stroke={selected === i ? '#264c3c' : 'none'} strokeWidth=".6" /> })}</g>
      })}
    </svg></div><div className="category-values" aria-live="polite"><strong>{point.label}</strong>{keys.map(k => <span key={k}>{names[k]} <b>{formatGBP(point[k])}</b></span>)}</div>
    <p className="muted">Home equity is home value minus mortgage debt. Negative cash represents an unfunded plan need.</p>
  </div></section>
}
