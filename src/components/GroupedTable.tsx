import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface GroupedTableGroup {
  key: string
  level: number
  parentKey?: string
}

export interface GroupedTableColumn {
  key: string
  label: string
  compactLabel?: string
  wideOnly?: boolean
  /** Named for screen readers only, e.g. a column of row menus. */
  hiddenLabel?: boolean
}

const ActiveGroups = createContext<readonly string[]>([])

export function GroupedTableDisclosure({ groupKey, sticky = false, stickable = true, expanded, label, onClick, children }: {
  groupKey: string
  sticky?: boolean
  /** False when the caller draws no sticky copy for this group, so the in-table control never hands over to one. */
  stickable?: boolean
  expanded: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  const active = useContext(ActiveGroups).includes(groupKey) && stickable
  const hidden = sticky ? !active : active
  return <button type="button" data-group-control={groupKey} data-sticky={sticky ? 'true' : undefined}
    tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined} aria-label={label}
    aria-expanded={expanded} onClick={onClick}>{children}</button>
}

export function GroupedTableBandRow({ group, colSpan, className, dataGroup, cells, onClick, children }: {
  group: GroupedTableGroup
  colSpan: number
  className: string
  dataGroup?: string
  /** Cells after the heading, for bands that line their figures up with the columns. */
  cells?: ReactNode
  /** A pointer convenience for the whole band; the heading's own control stays the accessible one. */
  onClick?: () => void
  children: ReactNode
}) {
  return <tr className={className} data-group-level={group.level} data-group-key={group.key}
    data-parent-key={group.parentKey} data-budget-group={dataGroup}
    onClick={onClick && (event => { if (!(event.target as HTMLElement).closest('button,a,input,select,summary')) onClick() })}><th scope="row" colSpan={colSpan}>{children}</th>{cells}</tr>
}

/** Presentation and scroll behavior only; callers own their rows and actions. */
export function GroupedTable({ columns, groups, renderStickyGroup, focusFallback, onOverflowChange, ariaDescribedBy, caption, regionLabel, className, wrapClassName, rowGroups = false, horizontalScrollStep = 120, footer, children }: {
  columns: readonly GroupedTableColumn[]
  groups: readonly GroupedTableGroup[]
  renderStickyGroup: (group: GroupedTableGroup) => ReactNode
  focusFallback?: () => void
  onOverflowChange?: (overflow: boolean) => void
  ariaDescribedBy?: string
  caption: string
  regionLabel: string
  className?: string
  wrapClassName?: string
  /** Callers may supply one tbody per top-level group to bound sticky financial rows. */
  rowGroups?: boolean
  /** Small steps let narrow comparison views reveal amounts beside a frozen column. */
  horizontalScrollStep?: number
  footer?: ReactNode
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const focusedGroup = useRef<string | null>(null)
  const [activeKeys, setActiveKeys] = useState<readonly string[]>([])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = wrap.getBoundingClientRect()
        const overflow = getComputedStyle(wrap).overflowY
        const bounded = overflow !== 'visible' && overflow !== 'clip'
        const top = bounded ? rect.top : 0
        const bottom = bounded ? rect.bottom : window.innerHeight
        const header = wrap.querySelector('thead') as HTMLElement | null
        const headerHeight = header && getComputedStyle(header).display !== 'none' ? header.getBoundingClientRect().height : 0
        wrap.style.setProperty('--grouped-viewport-top', `${bounded ? 0 : top}px`)
        wrap.style.setProperty('--grouped-wrap-left', `${Math.max(0, rect.left)}px`)
        wrap.style.setProperty('--grouped-wrap-width', `${Math.min(rect.width, (window.visualViewport?.width ?? window.innerWidth) - Math.max(0, rect.left))}px`)
        wrap.style.setProperty('--grouped-header-height', `${headerHeight}px`)
        const cells = header ? Array.from(header.querySelectorAll('th')) : []
        if (cells.length) wrap.style.setProperty('--grouped-column-widths', cells.map(cell => `${cell.getBoundingClientRect().width}px`).join(' '))
        wrap.style.setProperty('--grouped-scroll-left', `${wrap.scrollLeft}px`)
        wrap.style.setProperty('--grouped-table-width', `${wrap.querySelector('table')?.getBoundingClientRect().width ?? rect.width}px`)
        wrap.dataset.pageScroll = bounded ? 'false' : 'true'
        onOverflowChange?.(wrap.scrollWidth > wrap.clientWidth + 1)

        const keys: string[] = []
        if (rect.bottom > top && rect.top < bottom) {
          const rows = Array.from(wrap.querySelectorAll<HTMLElement>('[data-group-level]'))
          // Page-scrolled tables stick below whatever the page pins to the top (the phone header bar).
        const pinned = bounded ? 0 : parseFloat(getComputedStyle(wrap).getPropertyValue('--page-sticky-top')) || 0
        let line = top + pinned + headerHeight
          const maxLevel = groups.reduce((max, group) => Math.max(max, group.level), -1)
          for (let level = 0; level <= maxLevel; level++) {
            let current: HTMLElement | undefined
            for (const row of rows) {
              if (Number(row.dataset.groupLevel) !== level || row.getBoundingClientRect().top > line + 0.5) continue
              if (level > 0 && row.dataset.parentKey !== keys[level - 1]) continue
              const group = groups.find(candidate => candidate.key === row.dataset.groupKey)
              if (!group) continue
              current = row
            }
            if (!current) break
            keys.push(current.dataset.groupKey!)
            const height = current.getBoundingClientRect().height || 32
            wrap.style.setProperty(`--grouped-level-${level}-height`, `${height}px`)
            line += height
          }
        }
        setActiveKeys(previous => previous.length === keys.length && previous.every((key, index) => key === keys[index]) ? previous : keys)
      })
    }
    update()
    wrap.addEventListener('scroll', update, { passive: true })
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(wrap)
    const table = wrap.querySelector('table')
    if (table) observer?.observe(table)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      wrap.removeEventListener('scroll', update)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [groups, onOverflowChange])

  useLayoutEffect(() => {
    // Rows scrolled into view must clear the band actually drawn, which can be taller than its source row.
    const wrap = wrapRef.current
    const height = wrap?.querySelector('.grouped-table-sticky-context')?.getBoundingClientRect().height ?? 0
    if (wrap && height > 0) wrap.style.setProperty('--grouped-sticky-height', `${height}px`)
  }, [activeKeys])

  useLayoutEffect(() => {
    const key = focusedGroup.current
    const wrap = wrapRef.current
    if (!key || !wrap) return
    const controls = Array.from(wrap.querySelectorAll<HTMLButtonElement>('[data-group-control]'))
    const find = (targetKey: string) => controls.find(button => button.dataset.groupControl === targetKey && Boolean(button.dataset.sticky) === activeKeys.includes(button.dataset.groupActiveKey ?? targetKey))
    const target = find(key) ?? (groups.find(group => group.key === key)?.parentKey ? find(groups.find(group => group.key === key)!.parentKey!) : undefined)
    if (!target) { focusedGroup.current = null; focusFallback?.(); return }
    if (window.document.activeElement !== target) {
      target.focus({ preventScroll: true })
      focusedGroup.current = target.dataset.groupControl!
    }
  }, [activeKeys, groups, focusFallback])

  return <ActiveGroups.Provider value={activeKeys}>
    <div ref={wrapRef} className={`grouped-table-wrap ${wrapClassName ?? ''}`} role="region" aria-label={regionLabel} aria-describedby={ariaDescribedBy} tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        event.currentTarget.scrollLeft += event.key === 'ArrowRight' ? horizontalScrollStep : -horizontalScrollStep
      }}
      onFocusCapture={event => {
        const wrap = event.currentTarget
        const target = event.target as HTMLElement
        const control = target.closest<HTMLButtonElement>('[data-group-control]')
        focusedGroup.current = control?.dataset.groupControl ?? null
        const sticky = wrap.querySelector<HTMLElement>('.grouped-table-sticky-context')
        if (!sticky || sticky.contains(target) || !activeKeys.length) return
        const overlap = sticky.getBoundingClientRect().bottom - target.getBoundingClientRect().top
        if (overlap > 0) {
          if (wrap.dataset.pageScroll === 'true') window.scrollBy(0, -overlap - 8)
          else wrap.scrollTop -= overlap + 8
        }
      }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focusedGroup.current = null }}>
      <div className="grouped-table-sticky-anchor"><div className="grouped-table-sticky-context budget-v3-sticky-context">
        {activeKeys.map(key => {
          const group = groups.find(row => row.key === key)
          return group ? renderStickyGroup(group) : null
        })}
      </div></div>
      <table className={`grouped-table ${className ?? ''}`}>
        <caption className="visually-hidden">{caption}</caption>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={column.wideOnly ? 'grouped-table-wide-only' : undefined}>
          {column.hiddenLabel ? <span className="visually-hidden">{column.label}</span> : column.compactLabel ? <><span className="grouped-table-wide-label">{column.label}</span><span className="grouped-table-compact-label">{column.compactLabel}</span></> : column.label}
        </th>)}</tr></thead>
        {rowGroups ? children : <tbody>{children}</tbody>}
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  </ActiveGroups.Provider>
}
