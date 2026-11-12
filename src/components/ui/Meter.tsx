import type { CSSProperties } from 'react'
import './Meter.css'

/**
 * One bar for plan, pace and progress: value of max filled, any amount over max hatched at the end, and an
 * optional pace tick (0–1 along the bar). It's an image to assistive tech, so `label` must say it all.
 */
export function Meter({ value, max, over, pace, tone = 'neutral', label, width }: { value: number; max: number; over?: number; pace?: number; tone?: 'neutral' | 'warning' | 'critical'; label: string; width?: number | string }) {
  const overBy = over ?? Math.max(0, value - max)
  const scale = Math.max(max, value, 1)
  const share = (amount: number) => `${Math.max(0, Math.min(100, amount / scale * 100))}%`
  return <span className={`meter is-${tone}`} role="img" aria-label={label} style={width === undefined ? undefined : { width } as CSSProperties}>
    <span className="meter-fill" style={{ width: share(Math.min(value, max)) }}/>
    {overBy > 0 && <span className="meter-over" style={{ width: share(overBy) }}/>}
    {pace !== undefined && <span className="meter-pace" style={{ left: `${Math.max(0, Math.min(1, pace)) * 100}%` }}/>}
  </span>
}
