import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { moneyPence } from '../domain/budgetItemDrafts'
import { updateBudgetAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { GroupedTable, GroupedTableBandRow, GroupedTableDisclosure, type GroupedTableGroup } from '../components/GroupedTable'
import { ImpactPreview } from '../components/ImpactPreview'
import { formatGBP } from '../formatting/money'
import type { PlanDestination } from '../state/navigation'
import type { PlanGroup, PlanItemLabels, PlanOwnerGroup } from './planRows'

const pounds = (pence: number) => formatGBP(pence / 100)
const PLAN_COLLAPSED_KEY = 'north.plan.collapsed'
const readPlanCollapsed = (): Record<string, boolean> => { try { const value: unknown = JSON.parse(window.sessionStorage.getItem(PLAN_COLLAPSED_KEY) ?? '{}'); return value && typeof value === 'object' ? value as Record<string, boolean> : {} } catch { return {} } }
const withAmount = (document: BudgetDocument, month: string, itemId: string, pence: number) => ({ ...document, budget: updateBudgetAtMonth(document.budget, month, old => old.map(row => row.id === itemId ? { ...row, entryAmountPence: pence, amountPence: pence } : row)) })

type ShownGroup = PlanGroup & { collapsed: boolean }
type ShownOwner = ShownGroup & { categories: ShownGroup[] }

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  month: string
  editScopeLabel: string
  /** Search- and filter-matched rows from `groupPlanItems`. */
  owners: PlanOwnerGroup[]
  labels: PlanItemLabels
  query: string
  planDestination?: PlanDestination | null
  view: 'plan' | 'transfers'
  mobilePresentation: boolean
  /** Phone Plan narrowed to one destination from Transfers. */
  scoped: boolean
  /** Changes when the Owner or Category filter does; closes the quick edit like a search would. */
  filterKey: string
  /** Opening the full editor closes the quick edit. */
  editorOpen: boolean
  /** Shown instead of the table, which keeps its collapse state meanwhile. */
  empty?: ReactNode
  onEdit: (item: BudgetItem) => void
  onRemove: (item: BudgetItem, menu: HTMLElement | null) => void
  onQuickEditOpen: () => void
  onAmountSaved: (itemName: string, impact: BudgetImpact | null) => void
  focusFallback: () => void
}

/** The Plan's grouped item table, with group collapse, the row menu and the quick amount edit. */
export function PlanTable({ document, setDocument, month, editScopeLabel, owners, labels, query, planDestination, view, mobilePresentation, scoped, filterKey, editorOpen, empty, onEdit, onRemove, onQuickEditOpen, onAmountSaved, focusFallback }: Props) {
  const [planCollapsed, setPlanCollapsed] = useState<Record<string, boolean>>(readPlanCollapsed)
  useEffect(() => { try { window.sessionStorage.setItem(PLAN_COLLAPSED_KEY, JSON.stringify(planCollapsed)) } catch { /* storage unavailable */ } }, [planCollapsed])
  const [destinationCollapsed, setDestinationCollapsed] = useState<Record<string, boolean>>({})
  // Search collapse belongs to one search: any edit to the text starts it afresh.
  const [searchCollapsed, setSearchCollapsed] = useState<Record<string, boolean>>({})
  const [collapsedForQuery, setCollapsedForQuery] = useState(query)
  if (collapsedForQuery !== query) { setCollapsedForQuery(query); setSearchCollapsed({}) }

  const [inlineId, setInlineId] = useState<string | null>(null), [inlineValue, setInlineValue] = useState(''), [formError, setFormError] = useState('')
  const [impactRetry, setImpactRetry] = useState(0)
  const inlineTrigger = useRef<HTMLButtonElement | null>(null)
  if (editorOpen && (inlineId || formError)) { setInlineId(null); setFormError('') }
  // The consequence sits above Save; keep the whole quick-edit form (and so Save) in view as it grows.
  useEffect(() => { if (inlineId) window.document.getElementById(`inline-form-${inlineId}`)?.scrollIntoView?.({ block: 'nearest' }) }, [inlineId, inlineValue])
  useEffect(() => { const timer = window.setTimeout(() => { setInlineId(null); setFormError('') }, 0); return () => window.clearTimeout(timer) }, [month, view, planDestination, filterKey, query])

  const searchMode = !!query.trim()
  const flatPlan = !mobilePresentation
  const compactPlan = mobilePresentation && view === 'plan' && !!window.matchMedia
  const omitOwner = flatPlan || (scoped && owners.length === 1)
  const singleScope = scoped && owners.length === 1 && owners[0]!.categories.length === 1
  const colSpan = mobilePresentation ? 3 : 5

  const destinationGroupKey = (key: string) => `${month}:${planDestination?.kind}:${planDestination?.id}:${key}`
  const isCollapsed = (key: string) => query ? !!searchCollapsed[key] : planDestination ? !!destinationCollapsed[destinationGroupKey(key)] : !!planCollapsed[key]
  const visibleOwners: ShownOwner[] = owners.map(owner => ({
    ...owner,
    collapsed: flatPlan ? false : isCollapsed(owner.key),
    categories: owner.categories.map(category => ({ ...category, collapsed: isCollapsed(category.key) })),
  }))

  const closeInline = () => { setInlineId(null); setFormError('') }
  const cancelInline = () => {
    const id = inlineId
    closeInline()
    window.requestAnimationFrame(() => {
      const trigger = inlineTrigger.current?.isConnected ? inlineTrigger.current : id ? window.document.querySelector<HTMLButtonElement>(`[data-amount-trigger="${id}"]`) : null
      trigger?.focus({ preventScroll: true })
    })
  }
  const edit = (item: BudgetItem) => { closeInline(); onEdit(item) }
  const quickImpact = (item: BudgetItem) => {
    const pence = moneyPence(inlineValue)
    if (pence === undefined || pence === item.amountPence) return undefined
    return budgetImpact(document, withAmount(document, month, item.id, pence), month, [item.id])
  }
  const commitInline = (item: BudgetItem) => {
    if (inlineId !== item.id) return
    const pence = moneyPence(inlineValue)
    if (pence === undefined) { setFormError('Enter £0 or more, with up to two decimal places.'); return }
    if (pence !== item.amountPence) {
      const preview = quickImpact(item)
      if (preview && 'error' in preview) { setFormError(preview.error); return }
      setDocument(current => withAmount(current, month, item.id, pence))
      onAmountSaved(item.name, preview && 'impact' in preview ? preview.impact : null)
    }
    cancelInline()
  }

  const groupLabel = (group: { items: BudgetItem[] }) => `${group.items.length} ${group.items.length === 1 ? 'item' : 'items'} · ${query || planDestination ? 'Matching total ' : ''}${pounds(group.items.reduce((sum, item) => sum + item.amountPence, 0))}`
  const groupButton = (group: ShownGroup, sticky = false) => {
    const Icon = group.collapsed ? ChevronRight : ChevronDown
    return <GroupedTableDisclosure groupKey={group.key} sticky={sticky} expanded={!group.collapsed} label={`${group.name}, ${groupLabel(group)}`} onClick={() => {
      if (!group.collapsed) closeInline()
      if (query) setSearchCollapsed(value => ({ ...value, [group.key]: !group.collapsed }))
      else if (planDestination) setDestinationCollapsed(value => ({ ...value, [destinationGroupKey(group.key)]: !group.collapsed }))
      else setPlanCollapsed(value => ({ ...value, [group.key]: !group.collapsed }))
    }}><span className="budget-v3-group-title"><Icon aria-hidden="true" focusable="false"/><span>{group.name}</span></span><span className="budget-v3-group-total">{groupLabel(group)}</span></GroupedTableDisclosure>
  }
  const groups: GroupedTableGroup[] = searchMode ? [] : compactPlan ? visibleOwners.flatMap(owner => owner.categories.map(category => ({ key: category.key, level: 0 }))) : singleScope ? [] : visibleOwners.flatMap(owner => [
    ...(!omitOwner ? [{ key: owner.key, level: 0 }] : []),
    ...(omitOwner || !owner.collapsed ? owner.categories.map(category => ({ key: category.key, level: omitOwner ? 0 : 1, parentKey: omitOwner ? undefined : owner.key })) : []),
  ])
  const renderStickyGroup = (group: GroupedTableGroup) => {
    if (compactPlan) {
      const owner = visibleOwners.find(row => row.categories.some(category => category.key === group.key))
      const category = owner?.categories.find(row => row.key === group.key)
      return owner && category ? <div key={group.key} className="grouped-table-sticky-band budget-v3-sticky-category budget-v3-compact-group"><span>{owner.name} · {category.name}</span><span>{groupLabel(category)}</span></div> : null
    }
    const owner = visibleOwners.find(row => row.key === group.key)
    if (owner) return <div key={group.key} className="grouped-table-sticky-band budget-v3-sticky-owner">{groupButton(owner, true)}</div>
    const category = visibleOwners.flatMap(row => row.categories).find(row => row.key === group.key)
    return category ? <div key={group.key} className="grouped-table-sticky-band budget-v3-sticky-category">{groupButton(category, true)}</div> : null
  }

  const itemRows = (item: BudgetItem, category: PlanGroup) => {
    const editing = inlineId === item.id
    const impact = editing ? quickImpact(item) : undefined
    return <Fragment key={item.id}><tr className="budget-v3-item" onClick={event => { if ((event.target as HTMLElement).closest('button,a,input,select,summary,details,label,form')) return; edit(item) }}>
      <th scope="row" data-label="Item">
        <button type="button" className="budget-v3-item-name" title={`Edit details for ${item.name}`} data-budget-item-id={item.id} onClick={() => edit(item)}><span>{item.name}</span></button>
        {searchMode && <span className="budget-v3-result-context">{labels.ownerGroup(item)} · {category.name}</span>}
        <span className="budget-v3-mobile-item-meta"><span className="visually-hidden">Funding: </span>{labels.fundingLabel(item)}{(!scoped || planDestination?.kind === 'account') && <><span aria-hidden="true"> · </span><span className="visually-hidden">Destination: </span><span className="budget-v3-compact-destination">{labels.shortDestinationLabel(item)}</span></>}</span>
      </th>
      <td data-label="Monthly amount">{editing
        ? <span className="budget-v3-inline-cell budget-money-field"><input id={`inline-amount-${item.id}`} form={`inline-form-${item.id}`} aria-describedby={`inline-scope-${item.id}${formError ? ` inline-error-${item.id}` : ''}`} className="budget-v3-inline-amount" autoFocus inputMode="decimal" value={inlineValue} onChange={event => { setInlineValue(event.target.value); setFormError('') }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelInline() } }}/></span>
        : item.frequency === 'monthly' && item.funding !== 'fixed'
          ? <button type="button" data-amount-trigger={item.id} className="budget-v3-amount" aria-label={`Edit amount for ${item.name}`} aria-expanded={editing} onClick={event => { inlineTrigger.current = event.currentTarget; setInlineId(item.id); setInlineValue((item.amountPence / 100).toFixed(2)); setFormError(''); onQuickEditOpen() }}><span>{pounds(item.amountPence)}</span><Pencil aria-hidden="true" className="budget-v3-amount-icon"/></button>
          : <span className="budget-v3-amount is-static"><span>{pounds(item.amountPence)}</span><span aria-hidden="true" className="budget-v3-amount-icon"/></span>}</td>
      {!mobilePresentation && <><td data-label="Funding">{labels.fundingLabel(item)}</td><td data-label="Destination">{labels.destinationLabel(item)}</td></>}
      <td data-label="Actions"><button className="text-button budget-v3-wide-edit" onClick={() => edit(item)}>Edit</button><details className="budget-v3-row-menu" onToggle={event => {
        const menu = event.currentTarget
        if (!menu.open) return
        const wrap = menu.closest<HTMLElement>('.budget-v3-table-wrap')
        const bottom = wrap && getComputedStyle(wrap).overflowY !== 'visible' ? Math.min(wrap.getBoundingClientRect().bottom, window.innerHeight) : window.innerHeight
        menu.dataset.openUp = bottom - menu.getBoundingClientRect().bottom < 120 ? 'true' : 'false'
      }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector<HTMLElement>('summary')?.focus() } }}>
        <summary aria-label={`More actions for ${item.name}`}><span className="budget-v3-menu-label">More</span><span className="budget-v3-menu-icon" aria-hidden="true">⋯</span></summary>
        <div className="budget-v3-menu-actions"><button type="button" className="budget-v3-compact-edit" onClick={event => { event.currentTarget.closest('details')!.open = false; edit(item) }}>Edit</button><button type="button" onClick={event => { const menu = event.currentTarget.closest('details')!; menu.open = false; onRemove(item, menu.querySelector('summary')) }}>Remove</button></div>
      </details></td>
    </tr>{editing && <tr className="budget-v3-inline-row"><td colSpan={colSpan}><form id={`inline-form-${item.id}`} aria-label={`Quick edit amount for ${item.name}`} onSubmit={event => { event.preventDefault(); commitInline(item) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelInline() } }}>
      <label htmlFor={`inline-amount-${item.id}`} className="visually-hidden">Monthly amount for {item.name}</label>
      <ImpactPreview key={impactRetry} compact scopeId={`inline-scope-${item.id}`} scopeText={`Changes apply: ${editScopeLabel}.`} result={impact} document={document} onRetry={() => setImpactRetry(value => value + 1)}/>
      {formError && <p id={`inline-error-${item.id}`} role="alert">{formError}</p>}
      <div className="budget-v3-inline-controls"><button type="submit" className="primary-button" disabled={!!impact && 'error' in impact}>Save</button><button type="button" className="secondary-button" onClick={cancelInline}>Cancel</button></div>
    </form></td></tr>}</Fragment>
  }

  if (empty) return empty
  return <GroupedTable
    wrapClassName={`budget-v3-table-wrap${flatPlan ? ' is-flat' : ''}`} className="budget-v3-table"
    regionLabel="Plan table" caption={searchMode ? 'Matching budget items' : flatPlan ? 'Budget items by category' : 'Budget items by owner and category'}
    columns={mobilePresentation ? [
      { key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount' }, { key: 'actions', label: 'Actions' },
    ] : [
      { key: 'item', label: 'Item' }, { key: 'amount', label: 'Monthly amount' }, { key: 'funding', label: 'Funding' },
      { key: 'destination', label: 'Destination' }, { key: 'actions', label: 'Actions' },
    ]}
    groups={groups} renderStickyGroup={renderStickyGroup} focusFallback={focusFallback}>
    {visibleOwners.map(owner => <Fragment key={owner.key}>
      {!searchMode && !compactPlan && !omitOwner && <GroupedTableBandRow group={{ key: owner.key, level: 0 }} colSpan={colSpan} className="budget-v3-owner" dataGroup="owner">{groupButton(owner)}</GroupedTableBandRow>}
      {(searchMode || compactPlan || omitOwner || !owner.collapsed) && owner.categories.map(category => <Fragment key={category.key}>
        {!searchMode && (compactPlan
          ? <GroupedTableBandRow group={{ key: category.key, level: 0 }} colSpan={3} className="budget-v3-category budget-v3-compact-group" dataGroup="category"><span>{owner.name} · {category.name}</span><span>{groupLabel(category)}</span></GroupedTableBandRow>
          : !singleScope && <GroupedTableBandRow group={{ key: category.key, level: omitOwner ? 0 : 1, parentKey: omitOwner ? undefined : owner.key }} colSpan={colSpan} className="budget-v3-category" dataGroup="category">{groupButton(category)}</GroupedTableBandRow>)}
        {(searchMode || compactPlan || singleScope || !category.collapsed) && category.items.map(item => itemRows(item, category))}
      </Fragment>)}
    </Fragment>)}
  </GroupedTable>
}
