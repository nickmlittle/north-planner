import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import './StatTile.css'

/** A key figure: "Plan · £1,141.87 over · £7,641.87 of £6,500.00". Tone colours only the value. Tiles in a row are ruled apart. */
export function StatTile({ label, value, detail, tone = 'neutral', onOpen, openLabel }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'neutral' | 'critical' | 'warning'; onOpen?: () => void; openLabel?: string }) {
  return <div className={`stat-tile is-${tone}`}>
    <p className="stat-tile-label">{label}</p>
    <p className="stat-tile-value">{value}</p>
    {detail && <p className="stat-tile-detail">{detail}</p>}
    {onOpen && <button type="button" className="text-button stat-tile-open" onClick={onOpen}>{openLabel ?? `Open ${label}`}<ChevronRight aria-hidden="true"/></button>}
  </div>
}

/** Stat tiles side by side, with 1px rules between them. */
export function StatStrip({ label, children }: { label: string; children: ReactNode }) {
  return <section className="stat-strip" aria-label={label}>{children}</section>
}
