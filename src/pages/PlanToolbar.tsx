import { useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import { ArrowLeft, Plus, SlidersHorizontal, X } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { Kbd, Segmented, Sheet } from '../components/ui'
import { ownerAccountsLabel, type PlanGrouping } from './planRows'
import './plan.css'

type Props = {
  query: string
  onQueryChange: (value: string) => void
  /** Called before the search box takes focus, so clearing the search can restore the browse position. */
  onSearchStart: () => void
  inputRef: RefObject<HTMLInputElement | null>
  /** Search and Filter appear once the month has enough items to need them. */
  showFilters: boolean
  owner: string
  onOwnerChange: (value: string) => void
  ownerOrder: string[]
  category: string
  onCategoryChange: (value: string) => void
  categories: BudgetDocument['budget']['categories']
  /** Category | Destination bands; absent while searching. */
  grouping?: { value: PlanGrouping; onChange: (value: PlanGrouping) => void }
  /** "40 items", or "26 items · £3,767.72" while searching or narrowed to a destination. */
  count: string
  /** The table's keys ("J K move · ↵ edit"), desktop only. */
  keys?: ReactNode
  /** Expand all / Collapse all; absent when there are no bands. */
  expand?: { anyOpen: boolean; toggle: () => void }
  /** Arrived from Month's "26 items ›": a removable chip and a way back. */
  destination?: { label: string; onClear?: () => void; onBack?: () => void; backLabel: string }
  /** Focused on arrival with a destination. */
  destinationRef?: Ref<HTMLDivElement>
  /** Phones: Filter is an icon button whose sheet also holds the grouping switch and Expand all, and + adds an item. */
  compact?: boolean
  onAdd?: () => void
}

/**
 * Plan's one toolbar: search (/), Category | Destination, Filter (Owner, Category) with removable chips and Clear,
 * then the count and Expand all. On phones: search, a Filter icon button and +.
 */
export function PlanToolbar({ query, onQueryChange, onSearchStart, inputRef, showFilters, owner, onOwnerChange, ownerOrder, category, onCategoryChange, categories, grouping, count, keys, expand, destination, destinationRef, compact = false, onAdd }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const filterButton = useRef<HTMLButtonElement>(null)
  const activeCount = (owner !== 'All' ? 1 : 0) + (category !== 'All' ? 1 : 0)
  const clearFilters = () => { onOwnerChange('All'); onCategoryChange('All') }
  const categoryName = categories.find(row => row.id === category)?.name ?? 'Category'
  const switcher = grouping && <Segmented label="Group items by" value={grouping.value} onChange={value => { if (value !== grouping.value) grouping.onChange(value as PlanGrouping) }} options={[{ value: 'category', label: 'Category' }, { value: 'destination', label: 'Destination' }, { value: 'dates', label: 'Dates' }]}/>
  const expandButton = expand && <button type="button" className="text-button plan-toolbar-expand" onClick={expand.toggle}>{expand.anyOpen ? 'Collapse all' : 'Expand all'}</button>
  const chip = (label: string, name: string, onRemove: () => void) => <button key={name} type="button" className="plan-toolbar-chip" aria-label={name} onClick={onRemove}>{label}<X aria-hidden="true"/></button>
  const chips: ReactNode[] = [
    ...owner !== 'All' ? [chip(ownerAccountsLabel(owner), `Remove filter: ${ownerAccountsLabel(owner)}`, () => onOwnerChange('All'))] : [],
    ...category !== 'All' ? [chip(categoryName, `Remove filter: ${categoryName}`, () => onCategoryChange('All'))] : [],
  ]
  const clearSearch = () => { onQueryChange(''); window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true })) }
  const search = showFilters && <label className="plan-toolbar-search">
    <span className="visually-hidden">Search items</span>
    <input ref={inputRef} data-shortcut="search" value={query} placeholder="Search items" onPointerDownCapture={onSearchStart} onFocus={onSearchStart} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); onQueryChange('') } }}/>
    {query ? <button type="button" className="plan-toolbar-clear-search" aria-label="Clear search" onClick={clearSearch}><X aria-hidden="true"/></button>
      : !compact && <span className="shortcut-hint" aria-hidden="true"><Kbd>/</Kbd></span>}
  </label>
  const filterLabel = activeCount ? `Filter · ${activeCount}` : 'Filter'
  const filter = (showFilters || compact) && <button ref={filterButton} type="button" className={`${compact ? 'icon-button' : 'secondary-button'} plan-toolbar-filter${activeCount ? ' is-active' : ''}`} aria-label={filterLabel} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}>
    <SlidersHorizontal aria-hidden="true"/>{!compact && <>Filter{activeCount > 0 && <span className="plan-toolbar-badge">{activeCount}</span>}</>}
  </button>
  const sheet = sheetOpen && <Sheet title="Filter" className="budget-filter-sheet" onClose={() => setSheetOpen(false)} returnFocusTo={() => filterButton.current} footer={<>
    <button type="button" className="text-button" disabled={!activeCount} onClick={clearFilters}>Clear filters</button>
    <button type="button" className="primary-button" onClick={() => setSheetOpen(false)}>Done</button>
  </>}>
    <div className="budget-filter-sheet-fields">
      {showFilters && <>
        <label className="budget-v3-filter"><span className="budget-v3-filter-label">Owner</span><select className="budget-v3-filter-select" value={owner} onChange={event => onOwnerChange(event.target.value)} data-autofocus>
          <option>All</option>
          {ownerOrder.filter(name => name !== 'Needs owner').map(name => <option key={name}>{name}</option>)}
          {ownerOrder.includes('Needs owner') && <option>Needs owner</option>}
        </select></label>
        <label className="budget-v3-filter"><span className="budget-v3-filter-label">Category</span><select className="budget-v3-filter-select" value={category} onChange={event => onCategoryChange(event.target.value)}>
          <option value="All">All</option>
          {categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
      </>}
      {compact && switcher && <div className="budget-v3-filter"><span className="budget-v3-filter-label">Group by</span>{switcher}</div>}
      {compact && expand && <button type="button" className="text-button plan-toolbar-expand" onClick={() => { expand.toggle(); setSheetOpen(false) }}>{expand.anyOpen ? 'Collapse all' : 'Expand all'}</button>}
    </div>
  </Sheet>
  const back = destination && <div ref={destinationRef} className="plan-toolbar-destination" role="region" aria-label="Plan destination filter" tabIndex={-1}>
    {destination.onBack && <button type="button" className="text-button plan-toolbar-back" onClick={destination.onBack}><ArrowLeft aria-hidden="true"/>{destination.backLabel}</button>}
    {destination.onClear ? chip(destination.label, 'Clear destination filter', destination.onClear) : <span className="plan-toolbar-chip is-static">{destination.label}</span>}
  </div>
  const countLine = <p className="plan-toolbar-count" role="status">{count}</p>

  if (compact) return <div className="plan-toolbar is-compact">
    {back}
    <div className="plan-toolbar-row">{search}{filter}{onAdd && <button type="button" className="primary-button plan-toolbar-add" aria-label="Add item" title="Add item" onClick={onAdd}><Plus aria-hidden="true"/></button>}</div>
    {chips.length > 0 && <div className="plan-toolbar-chips" role="group" aria-label="Active filters">{chips}</div>}
    {(query.trim() || destination) && countLine}
    {sheet}
  </div>
  return <div className="plan-toolbar">
    {back}
    <div className="plan-toolbar-row">
      {search}{switcher}{filter}
      {chips.length > 0 && <div className="plan-toolbar-chips" role="group" aria-label="Active filters">{chips}{<button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}
      <span className="plan-toolbar-spacer"/>
      {keys}{countLine}{expandButton}
    </div>
    {sheet}
  </div>
}
