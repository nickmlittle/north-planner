import { useEffect, useId, useRef, useState } from 'react'
import { Ellipsis } from 'lucide-react'

export type BudgetOption = { label: string; onSelect: () => void }

/** The ⋯ beside Add item: the budget's less frequent actions. Items exist only while it is open. */
export function BudgetOptionsMenu({ options, label = 'More budget options' }: { options: BudgetOption[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div ref={root} className="budget-options-menu" onKeyDown={event => {
    if (!open) return
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }}>
    <button ref={trigger} type="button" className="secondary-button budget-options-trigger" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}><Ellipsis aria-hidden="true"/></button>
    {open && <div id={menuId} className="budget-options-list" role="menu" aria-label={label}>
      {options.map(option => <button key={option.label} type="button" role="menuitem" onClick={() => { setOpen(false); trigger.current?.focus(); option.onSelect() }}>{option.label}</button>)}
    </div>}
  </div>
}
