import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, Ellipsis, Pencil } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { moneyPence } from '../domain/budgetItemDrafts'
import { updateBudgetAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { GroupedTable, GroupedTableBandRow, GroupedTableDisclosure, type GroupedTableGroup } from '../components/GroupedTable'
import { ImpactPreview } from '../components/ImpactPreview'
import { formatGBP } from '../formatting/money'
import type { PlanDestination } from '../state/navigation'
import type { PlanGroup, PlanItemLabels } from './planRows'

const pounds = (pence: number) => formatGBP(pence / 100)
const withAmount = (document: BudgetDocument, month: string, itemId: string, pence: number) => ({ ...document, budget: updateBudgetAtMonth(document.budget, month, old => old.map(row => row.id === itemId ? { ...row, entryAmountPence: pence, amountPence: pence } : row)) })
const sumOf = (items: readonly BudgetItem[]) => items.reduce((sum, item) => sum + item.amountPence, 0)
const itemCount = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`
const percent = (value: number) => `${value.toFixed(1)}%`

/** A group's share of the whole month's plan: decoration beside the percentage, which carries the value. */
function ShareBar({ share }: { share: number }) {
  return <span className="plan-share-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, share))}%` }}/></span>
}

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  month: string
  editScopeLabel: string
  /** Search- and filter-matched rows from `groupPlanItems`. */
  groups: PlanGroup[]
  labels: PlanItemLabels
  query: string
  planDestination?: PlanDestination | null
  view: 'plan' | 'transfers'
  mobilePresentation: boolean
  /** Phone Plan narrowed to one destination from Transfers. */
  scoped: boolean
  /** Groups opened while browsing. Groups start closed; Transfers' destination view starts them open and keeps its own. */
  openGroups: Readonly<Record<string, boolean>>
  onOpenGroupsChange: Dispatch<SetStateAction<Record<string, boolean>>>
  /** The month's whole plan, for each group's share of it. */
  planTotalPence: number
  /** Changes when the Owner or Category filter does; closes the quick edit like a search would. */
  filterKey: string
  /** Opening the full editor closes the quick edit. */
  editorOpen: boolean
  /** Shown instead of the table, which keeps its open groups meanwhile. */
  empty?: ReactNode
  onEdit: (item: BudgetItem) => void
  onRemove: (item: BudgetItem, menu: HTMLElement | null) => void
  onQuickEditOpen: () => void
  onAmountSaved: (itemName: string, impact: BudgetImpact | null) => void
  focusFallback: () => void
}

/** The Plan's items in one card: collapsible groups with their share of the plan, a Total row, the row menu and the quick amount edit. */
export function PlanTable({ document, setDocument, month, editScopeLabel, groups, labels, query, planDestination, view, mobilePresentation, scoped, openGroups, onOpenGroupsChange, planTotalPence, filterKey, editorOpen, empty, onEdit, onRemove, onQuickEditOpen, onAmountSaved, focusFallback }: Props) {
  const [destinationClosed, setDestinationClosed] = useState<Record<string, boolean>>({})
  const [inlineId, setInlineId] = useState<string | null>(null), [inlineValue, setInlineValue] = useState(''), [formError, setFormError] = useState('')
  const [impactRetry, setImpactRetry] = useState(0)
  const inlineTrigger = useRef<HTMLButtonElement | null>(null)
  if (editorOpen && (inlineId || formError)) { setInlineId(null); setFormError('') }
  // The consequence sits above Save; keep the whole quick-edit form (and so Save) in view as it grows.
  useEffect(() => { if (inlineId) window.document.getElementById(`inline-form-${inlineId}`)?.scrollIntoView?.({ block: 'nearest' }) }, [inlineId, inlineValue])
  useEffect(() => { const timer = window.setTimeout(() => { setInlineId(null); setFormError('') }, 0); return () => window.clearTimeout(timer) }, [month, view, planDestination, filterKey, query])

  const searchMode = !!query.trim()
  const desktop = !mobilePresentation
  const singleScope = scoped && groups.length === 1
  const banded = !searchMode && !singleScope
  const colSpan = 3 + (desktop ? 1 : 0)

  const destinationGroupKey = (key: string) => `${month}:${planDestination?.kind}:${planDestination?.id}:${key}`
  const isOpen = (key: string) => !banded || (planDestination ? !destinationClosed[destinationGroupKey(key)] : !!openGroups[key])
  const setGroupOpen = (key: string, open: boolean) => {
    if (planDestination) setDestinationClosed(value => ({ ...value, [destinationGroupKey(key)]: !open }))
    else onOpenGroupsChange(value => { const next = { ...value }; if (open) next[key] = true; else delete next[key]; return next })
  }
  const anyOpen = banded && groups.some(group => isOpen(group.key))
  const shareOf = (pence: number) => planTotalPence > 0 ? pence / planTotalPence * 100 : 0
  const shown = groups.flatMap(group => group.items)

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

  const toggleGroup = (group: PlanGroup) => { const open = isOpen(group.key); if (open) closeInline(); setGroupOpen(group.key, !open) }
  const groupButton = (group: PlanGroup, sticky = false) => {
    const open = isOpen(group.key), total = sumOf(group.items), share = shareOf(total)
    const Icon = open ? ChevronDown : ChevronRight
    return <GroupedTableDisclosure groupKey={group.key} sticky={sticky} stickable={open} expanded={open}
      label={`${group.name}, ${itemCount(group.items.length)}, ${pounds(total)}, ${percent(share)} of plan`} onClick={() => toggleGroup(group)}>
      {desktop
        ? <span className="plan-group-line"><Icon aria-hidden="true" focusable="false"/><span className="plan-group-name">{group.name}</span><span className="plan-group-count">{itemCount(group.items.length)}</span></span>
        : <><span className="plan-group-line"><Icon aria-hidden="true" focusable="false"/><span className="plan-group-name">{group.name}</span><span className="plan-group-total">{pounds(total)}</span></span>
          <span className="plan-group-meta"><span className="plan-group-count">{itemCount(group.items.length)}</span><ShareBar share={share}/><span className="plan-group-share">{percent(share)}</span></span></>}
    </GroupedTableDisclosure>
  }
  /** Desktop bands line their share and total up with the item columns. */
  const groupFigures = (group: PlanGroup, Cell: 'td' | 'div') => {
    const total = sumOf(group.items), share = shareOf(total)
    return <>
      <Cell className="plan-share-cell"><span className="plan-share"><ShareBar share={share}/><span>{percent(share)}</span></span></Cell>
      <Cell className="plan-amount-cell plan-group-total">{pounds(total)}</Cell>
      <Cell className="plan-actions-cell"/>
    </>
  }
  const tableGroups: GroupedTableGroup[] = banded ? groups.map(group => ({ key: group.key, level: 0 })) : []
  const renderStickyGroup = (row: GroupedTableGroup) => {
    const group = groups.find(candidate => candidate.key === row.key)
    // Only an open group's heading stays in view; a closed one is a single row.
    if (!group || !isOpen(group.key)) return null
    return <div key={group.key} className={`grouped-table-sticky-band plan-sticky-band${desktop ? ' is-desktop' : ''}`}
      onClick={event => { if (!(event.target as HTMLElement).closest('button')) toggleGroup(group) }}>
      {desktop ? <><div className="plan-sticky-heading">{groupButton(group, true)}</div>{groupFigures(group, 'div')}</> : groupButton(group, true)}
    </div>
  }

  const itemRows = (item: BudgetItem) => {
    const editing = inlineId === item.id
    const impact = editing ? quickImpact(item) : undefined
    const category = labels.categoryName(item) ?? 'Uncategorised'
    // A pot or direct-to-account view already names the destination, so the line says the category instead.
    const sameDestination = !!planDestination && planDestination.kind !== 'account'
    return <Fragment key={item.id}><tr className="budget-v3-item" onClick={event => { if ((event.target as HTMLElement).closest('button,a,input,select,summary,details,label,form')) return; edit(item) }}>
      <th scope="row">
        <button type="button" className="budget-v3-item-name" title={`Edit details for ${item.name}`} data-budget-item-id={item.id} onClick={() => edit(item)}><span>{item.name}</span></button>
        <span className="budget-v3-item-meta"><span className="visually-hidden">Funding: </span>{labels.fundingLabel(item)}<span aria-hidden="true"> · </span>{sameDestination
          ? <><span className="visually-hidden">Category: </span>{category}</>
          : <><span className="visually-hidden">Destination: </span>{labels.destinationLabel(item)}</>}</span>
        {searchMode && <span className="budget-v3-result-context">{labels.ownerGroup(item)} · {category}</span>}
      </th>
      {desktop && <td className="plan-share-cell"/>}
      <td className="plan-amount-cell">{editing
        ? <span className="budget-v3-inline-cell budget-money-field"><input id={`inline-amount-${item.id}`} form={`inline-form-${item.id}`} aria-describedby={`inline-scope-${item.id}${formError ? ` inline-error-${item.id}` : ''}`} className="budget-v3-inline-amount" autoFocus inputMode="decimal" value={inlineValue} onChange={event => { setInlineValue(event.target.value); setFormError('') }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelInline() } }}/></span>
        : item.frequency === 'monthly' && item.funding !== 'fixed'
          ? <button type="button" data-amount-trigger={item.id} className="budget-v3-amount" aria-label={`Edit amount for ${item.name}`} aria-expanded={editing} onClick={event => { inlineTrigger.current = event.currentTarget; setInlineId(item.id); setInlineValue((item.amountPence / 100).toFixed(2)); setFormError(''); onQuickEditOpen() }}><span>{pounds(item.amountPence)}</span><Pencil aria-hidden="true" className="budget-v3-amount-icon"/></button>
          : <span className="budget-v3-amount is-static"><span>{pounds(item.amountPence)}</span><span aria-hidden="true" className="budget-v3-amount-icon"/></span>}</td>
      <td className="plan-actions-cell"><details className="budget-v3-row-menu" onToggle={event => {
        const menu = event.currentTarget
        if (!menu.open) return
        const wrap = menu.closest<HTMLElement>('.budget-v3-table-wrap')
        const bottom = wrap && getComputedStyle(wrap).overflowY !== 'visible' ? Math.min(wrap.getBoundingClientRect().bottom, window.innerHeight) : window.innerHeight
        menu.dataset.openUp = bottom - menu.getBoundingClientRect().bottom < 120 ? 'true' : 'false'
      }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector<HTMLElement>('summary')?.focus() } }}>
        <summary aria-label={`More actions for ${item.name}`}><Ellipsis aria-hidden="true"/></summary>
        <div className="budget-v3-menu-actions"><button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; edit(item) }}>Edit</button><button type="button" onClick={event => { const menu = event.currentTarget.closest('details')!; menu.open = false; onRemove(item, menu.querySelector('summary')) }}>Remove</button></div>
      </details></td>
    </tr>{editing && <tr className="budget-v3-inline-row"><td colSpan={colSpan}><form id={`inline-form-${item.id}`} aria-label={`Quick edit amount for ${item.name}`} onSubmit={event => { event.preventDefault(); commitInline(item) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelInline() } }}>
      <label htmlFor={`inline-amount-${item.id}`} className="visually-hidden">Monthly amount for {item.name}</label>
      <ImpactPreview key={impactRetry} compact scopeId={`inline-scope-${item.id}`} scopeText={`Changes apply: ${editScopeLabel}.`} result={impact} document={document} onRetry={() => setImpactRetry(value => value + 1)}/>
      {formError && <p id={`inline-error-${item.id}`} role="alert">{formError}</p>}
      <div className="budget-v3-inline-controls"><button type="submit" className="primary-button" disabled={!!impact && 'error' in impact}>Save</button><button type="button" className="secondary-button" onClick={cancelInline}>Cancel</button></div>
    </form></td></tr>}</Fragment>
  }

  if (empty) return empty
  return <section className="plan-card" aria-labelledby="plan-card-title">
    <div className="plan-card-header">
      <div className="plan-card-heading">
        <h2 id="plan-card-title">Budget items<span className="plan-card-count" aria-hidden="true"> · {shown.length}</span></h2>
        <p className="plan-card-summary">{banded ? `${groups.length} ${groups.length === 1 ? 'category' : 'categories'} · ` : ''}{itemCount(shown.length)}</p>
      </div>
      {banded && <button type="button" className="plan-expand-all" onClick={() => { if (anyOpen) closeInline(); groups.forEach(group => setGroupOpen(group.key, !anyOpen)) }}>{anyOpen ? 'Collapse all' : 'Expand all'}</button>}
    </div>
    <GroupedTable
      wrapClassName={`budget-v3-table-wrap${desktop ? ' is-flat' : ''}`} className="budget-v3-table"
      regionLabel="Plan table" caption={searchMode ? 'Matching budget items' : 'Budget items by category'}
      columns={desktop ? [
        { key: 'item', label: banded ? 'Category' : 'Item' }, { key: 'share', label: 'Share of plan' },
        { key: 'amount', label: 'Monthly' }, { key: 'actions', label: 'Actions', hiddenLabel: true },
      ] : [
        { key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount' }, { key: 'actions', label: 'Actions' },
      ]}
      groups={tableGroups} renderStickyGroup={renderStickyGroup} focusFallback={focusFallback}
      footer={!searchMode && shown.length ? <tr className="plan-total"><th scope="row">Total <span className="plan-total-count">{itemCount(shown.length)}</span></th>{desktop && <td className="plan-share-cell"/>}<td className="plan-amount-cell">{pounds(sumOf(shown))}</td><td className="plan-actions-cell"/></tr> : undefined}>
      {groups.map(group => <Fragment key={group.key}>
        {banded && <GroupedTableBandRow group={{ key: group.key, level: 0 }} colSpan={desktop ? 1 : colSpan} className={`plan-group${isOpen(group.key) ? ' is-open' : ''}`} dataGroup="category"
          cells={desktop ? groupFigures(group, 'td') : undefined} onClick={() => toggleGroup(group)}>{groupButton(group)}</GroupedTableBandRow>}
        {isOpen(group.key) && group.items.map(itemRows)}
      </Fragment>)}
    </GroupedTable>
  </section>
}
