import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import './Tabs.css'

export type TabItem = { id: string; label: string; count?: ReactNode; badge?: ReactNode }

/**
 * ARIA tabs with an underline: ← → move between tabs (and select them), Home and End jump to the ends.
 * With children, they're the selected tab's panel.
 */
export function Tabs({ tabs, current, onSelect, label, children }: { tabs: TabItem[]; current: string; onSelect: (id: string) => void; label: string; children?: ReactNode }) {
  const prefix = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const tabId = (id: string) => `${prefix}-tab-${id}`, panelId = `${prefix}-panel`
  const onKeyDown = (event: KeyboardEvent) => {
    const ids = tabs.map(tab => tab.id), index = ids.indexOf(current)
    const next = { ArrowRight: ids[(index + 1) % ids.length], ArrowLeft: ids[(index + ids.length - 1) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[event.key]
    if (!next) return
    event.preventDefault()
    onSelect(next)
    refs.current[next]?.focus()
  }
  return <>
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map(tab => <button key={tab.id} ref={element => { refs.current[tab.id] = element }} type="button" role="tab" id={tabId(tab.id)} aria-selected={tab.id === current} aria-controls={children === undefined ? undefined : panelId} tabIndex={tab.id === current ? 0 : -1} className="tab" onClick={() => onSelect(tab.id)}>
        {tab.label}{tab.count !== undefined && <span className="tab-count">{tab.count}</span>}{tab.badge}
      </button>)}
    </div>
    {children !== undefined && <div role="tabpanel" id={panelId} aria-labelledby={tabId(current)} className="tab-panel">{children}</div>}
  </>
}
