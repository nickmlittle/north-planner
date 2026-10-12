import { useId } from 'react'
import type { PropertyMove } from '../domain/property'
import { formatGBP } from '../formatting/money'

export function PropertyMoveScenario({ move, base, moves, minYear, maxYear, onChange, onSelect, onSave, onReset, onClose, dirty, error }: {
  move: PropertyMove; base: PropertyMove; moves: PropertyMove[]; minYear: number; maxYear: number; onChange: (next: PropertyMove) => void; onSelect: (id: string) => void
  onSave: () => void; onReset: () => void; onClose: () => void; dirty: boolean; error?: string
}) {
  const id = useId()
  const priceMax = Math.max(1_000_000, Math.ceil(Math.max(base.purchasePrice, move.purchasePrice) * 2 / 50_000) * 50_000)
  const change = (patch: Partial<PropertyMove>) => onChange({ ...move, ...patch, enabled: true })
  const changed = (key: 'year' | 'purchasePrice' | 'agentFeeRate' | 'legalFeeRate' | 'renovationRate') => base[key] !== move[key]
  const changedLabel = (key: 'year' | 'purchasePrice' | 'agentFeeRate' | 'legalFeeRate' | 'renovationRate') => changed(key) && <small className="scenario-changed">Changed</small>
  return <section className="setup-card move-scenario scenario-panel" aria-labelledby={`${id}-heading`}>
    <div className="section-heading"><div><p className="eyebrow">Explore a what-if</p><h2 id={`${id}-heading`}>Property move scenario</h2></div>
      <div className="scenario-panel-actions"><label className="scenario-select">Move<select aria-label="Property move scenario" value={move.id} onChange={e => onSelect(e.target.value)}>
        {moves.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></label><button className="secondary-button" onClick={onClose}>Close</button></div>
    </div>
    <div className="scenario-controls">
      <label htmlFor={`${id}-year`}>Move year <strong>{move.year}</strong>{changedLabel('year')}</label>
      <input id={`${id}-year`} type="range" min={minYear} max={maxYear} step="1" value={Math.min(maxYear, Math.max(minYear, move.year))}
        onChange={e => change({ year: Number(e.target.value) })} aria-valuetext={String(move.year)} />
      <label htmlFor={`${id}-price`}>New home purchase price <strong>{formatGBP(move.purchasePrice)}</strong>{changedLabel('purchasePrice')}</label>
      <input id={`${id}-price`} type="range" min="0" max={priceMax} step="5000" value={Math.min(priceMax, Math.max(0, move.purchasePrice))}
        onChange={e => change({ purchasePrice: Number(e.target.value) })} aria-valuetext={formatGBP(move.purchasePrice)} />
      <div className="scenario-numeric"><label htmlFor={`${id}-price-number`}>Exact purchase price (£)</label><input id={`${id}-price-number`} type="number" min="0" step="1000" value={move.purchasePrice}
        onChange={e => change({ purchasePrice: Math.max(0, Number(e.target.value) || 0) })} /></div>
    </div>
    <div className="scenario-fees">
      <h3>Purchase cost assumptions</h3>
      {([['agentFeeRate', 'Estate-agent fees'], ['legalFeeRate', 'Legal fees'], ['renovationRate', 'Renovation and furnishing']] as const).map(([key, label]) => <label key={key}>
        {label} (% of price){changedLabel(key)}<input aria-label={`${label} percent`} type="number" min="0" max="100" step="0.1" value={Number((move[key] * 100).toFixed(2))}
          onChange={e => change({ [key]: Math.min(1, Math.max(0, Number(e.target.value) || 0) / 100) })} />
      </label>)}
    </div>
    <p className="scenario-cost-note">Estimated SDLT: {formatGBP(move.stampDuty)} · Agent: {formatGBP(move.agentFees)} · Legal: {formatGBP(move.legalFees)} · Renovation: {formatGBP(move.renovation)}</p>
    <p className="muted">SDLT uses England and Northern Ireland main-home rates. Additional-property and non-resident surcharges are excluded.</p>
    {error && <p className="error-summary" role="alert">Scenario forecast unavailable: {error}</p>}
    <div className="scenario-actions"><button className="secondary-button" onClick={onReset} disabled={!dirty}>Reset to current plan</button>
      <button className="primary-button" onClick={onSave} disabled={!dirty || Boolean(error)}>Save changes to {base.name}</button></div>
  </section>
}
