import { useRef, useState, type RefObject } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { ModalDialog } from '../components/ModalDialog'

type Props = {
  query: string
  onQueryChange: (value: string) => void
  /** Called before the search box takes focus, so clearing the search can restore the browse position. */
  onSearchStart: () => void
  inputRef: RefObject<HTMLInputElement | null>
  owner: string
  onOwnerChange: (value: string) => void
  ownerOrder: string[]
  category: string
  onCategoryChange: (value: string) => void
  categories: BudgetDocument['budget']['categories']
  /** Phones: Owner and Category move into a Filter sheet, and Add item joins the row as +. */
  compact?: boolean
  onAdd?: () => void
}

/** Search plus Owner and Category above the Plan table: chips on desktop, one Filter button on phones. */
export function PlanFilters({ query, onQueryChange, onSearchStart, inputRef, owner, onOwnerChange, ownerOrder, category, onCategoryChange, categories, compact = false, onAdd }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const filterButton = useRef<HTMLButtonElement>(null)
  const clear = () => { onQueryChange(''); window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true })) }
  const activeCount = (owner !== 'All' ? 1 : 0) + (category !== 'All' ? 1 : 0)
  const clearFilters = () => { onOwnerChange('All'); onCategoryChange('All') }
  const selects = <>
    <label className={`budget-v3-filter budget-v3-owner-filter${owner !== 'All' ? ' is-active' : ''}`}><span className="budget-v3-filter-label">Owner</span><select className="budget-v3-filter-select" value={owner} onChange={event => onOwnerChange(event.target.value)} data-autofocus={compact || undefined}>
      <option>All</option>
      {ownerOrder.filter(name => name !== 'Needs owner').map(name => <option key={name}>{name}</option>)}
      {ownerOrder.includes('Needs owner') && <option>Needs owner</option>}
    </select></label>
    <label className={`budget-v3-filter budget-v3-category-filter${category !== 'All' ? ' is-active' : ''}`}><span className="budget-v3-filter-label">Category</span><select className="budget-v3-filter-select" value={category} onChange={event => onCategoryChange(event.target.value)}>
      <option value="All">All</option>
      {categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
  </>
  return <div className={`budget-v3-controls${compact ? ' is-compact' : ''}`}>
    <div className="budget-v3-search-field">
      <label className="budget-v3-search"><span className="budget-v3-search-label">Search</span><input ref={inputRef} value={query} onPointerDownCapture={onSearchStart} onFocus={onSearchStart} onChange={event => onQueryChange(event.target.value)} placeholder="Search budget"/></label>
      {!!query.trim() && <button type="button" className="budget-v3-search-clear" onClick={clear}>Clear search</button>}
    </div>
    {compact ? <>
      <button ref={filterButton} type="button" className={`secondary-button budget-filter-button${activeCount ? ' is-active' : ''}`} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}><SlidersHorizontal aria-hidden="true"/>{activeCount ? `Filter · ${activeCount}` : 'Filter'}</button>
      {onAdd && <button type="button" className="primary-button budget-add-button" aria-label="Add item" title="Add item" onClick={onAdd}><Plus aria-hidden="true"/></button>}
      {sheetOpen && <ModalDialog title="Filter" className="budget-filter-sheet" onClose={() => setSheetOpen(false)} returnFocusTo={() => filterButton.current}>
        <div className="budget-filter-sheet-fields">{selects}</div>
        <div className="budget-filter-sheet-actions">
          <button type="button" className="text-button" disabled={!activeCount} onClick={clearFilters}>Clear filters</button>
          <button type="button" className="primary-button" onClick={() => setSheetOpen(false)}>Done</button>
        </div>
      </ModalDialog>}
    </> : <>
      {selects}
      {activeCount > 0 && <button type="button" className="text-button budget-filter-clear" onClick={clearFilters}>Clear filters</button>}
    </>}
  </div>
}
