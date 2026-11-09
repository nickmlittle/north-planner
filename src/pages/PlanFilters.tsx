import type { RefObject } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'

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
}

/** Search, Owner and Category controls above the Plan table. */
export function PlanFilters({ query, onQueryChange, onSearchStart, inputRef, owner, onOwnerChange, ownerOrder, category, onCategoryChange, categories }: Props) {
  const clear = () => { onQueryChange(''); window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true })) }
  return <div className="budget-v3-controls">
    <div className="budget-v3-search-field">
      <label className="budget-v3-search"><span className="budget-v3-search-label">Search</span><input ref={inputRef} value={query} onPointerDownCapture={onSearchStart} onFocus={onSearchStart} onChange={event => onQueryChange(event.target.value)} placeholder="Search budget"/></label>
      {!!query.trim() && <button type="button" className="budget-v3-search-clear" onClick={clear}>Clear search</button>}
    </div>
    <label className="budget-v3-filter budget-v3-owner-filter">Owner<select className="budget-v3-filter-select" value={owner} onChange={event => onOwnerChange(event.target.value)}>
      <option>All</option>
      {ownerOrder.filter(name => name !== 'Needs owner').map(name => <option key={name}>{name}</option>)}
      {ownerOrder.includes('Needs owner') && <option>Needs owner</option>}
    </select></label>
    <label className="budget-v3-filter budget-v3-category-filter">Category<select className="budget-v3-filter-select" value={category} onChange={event => onCategoryChange(event.target.value)}>
      <option value="All">All</option>
      {categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
  </div>
}
