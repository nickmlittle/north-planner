import type { ReactNode } from 'react'

export function SummaryTiles({ label, className = '', children }: {
  label: string
  className?: string
  children: ReactNode
}) {
  return <div className={`summary-tiles ${className}`.trim()} aria-label={label}>{children}</div>
}

export function SummaryTile({ label, value, className = '', children }: {
  label: string
  value: ReactNode
  className?: string
  children?: ReactNode
}) {
  return <article className={`summary-tile ${className}`.trim()}>
    <h2>{label}</h2>
    <p>{value}</p>
    {children}
  </article>
}
