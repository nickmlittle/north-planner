import { Fragment, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, Ellipsis, Lock, Pencil } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { moneyPence } from '../domain/budgetItemDrafts'
import { updateBudgetAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { GroupedTable, GroupedTableBandRow, GroupedTableDisclosure, type GroupedTableGroup } from '../components/GroupedTable'
import { Kbd } from '../components/ui'
import { balanceLabel, formatGBP } from '../formatting/money'
import type { PlanDestination } from '../state/navigation'
import type { PlanGroup, PlanGrouping, PlanItemLabels, PlanSubgroup } from './planRows'

const pounds = (pence: number) => formatGBP(pence / 100)
const withAmount = (document: BudgetDocument, month: string, itemId: string, pence: number) => ({ ...document, budget: updateBudgetAtMonth(document.budget, month, old => old.map(row => row.id === itemId ? { ...row, entryAmountPence: pence, amountPence: pence } : row)) })
const sumOf = (items: readonly BudgetItem[]) => items.reduce((sum, item) => sum + item.amountPence, 0)
const itemCount = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`
const percent = (value: number) => `${value.toFixed(1)}%`
const delta = (pence: number) => `${pence < 0 ? '−' : '+'}${pounds(Math.abs(pence))}`

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
  /** Groups opened or closed while browsing; a group with no entry takes `groupsOpenByDefault`. A destination view starts them open and keeps its own. */
  openGroups: Readonly<Record<string, boolean>>
  /** Desktop opens groups by default; phones keep them closed (D4). */
  groupsOpenByDefault: boolean
  onOpenGroupsChange: Dispatch<SetStateAction<Record<string, boolean>>>
  /** Bands by category or by destination; each keeps its own open groups. */
  grouping: PlanGrouping
  /** The toolbar above the table, given the count ("40 items", or with the total while narrowed) and Expand all when there are bands. */
  renderToolbar?: (controls: { count: string; expand?: { anyOpen: boolean; toggle: () => void } }) => ReactNode
  /** The month's whole plan, for each group's share of it. */
  planTotalPence: number
  /** Changes when the Owner or Category filter does; closes the quick edit like a search would. */
  filterKey: string
  /** Opening the full editor closes the quick edit. */
  editorOpen: boolean
  /** Shown instead of the table, which keeps its open groups meanwhile. */
  empty?: ReactNode
  /** Opens the full editor; `amountPence` carries an amount typed inline (⇧↵). */
  onEdit: (item: BudgetItem, amountPence?: number) => void
  onRemove: (item: BudgetItem, menu: HTMLElement | null) => void
  /** Desktop row menu: a new item prefilled from this one. Phones duplicate from the editor. */
  onDuplicate: (item: BudgetItem) => void
  onQuickEditOpen: () => void
  onAmountSaved: (itemName: string, impact: BudgetImpact | null) => void
  focusFallback: () => void
}

/** The Plan's items in one card: collapsible groups with their share of the plan, a Total row, the row menu and the quick amount edit. */
export function PlanTable({ document, setDocument, month, editScopeLabel, groups, labels, query, planDestination, view, mobilePresentation, scoped, openGroups, onOpenGroupsChange, groupsOpenByDefault, grouping, renderToolbar, planTotalPence, filterKey, editorOpen, empty, onEdit, onRemove, onDuplicate, onQuickEditOpen, onAmountSaved, focusFallback }: Props) {
  const [destinationClosed, setDestinationClosed] = useState<Record<string, boolean>>({})
  const [inlineId, setInlineId] = useState<string | null>(null), [inlineValue, setInlineValue] = useState(''), [formError, setFormError] = useState('')
  const [, setImpactRetry] = useState(0)
  // The impact line follows the typed amount after a short pause, not on every keystroke.
  const [settledValue, setSettledValue] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setSettledValue(inlineValue), 150); return () => window.clearTimeout(timer) }, [inlineValue])
  const inlineTrigger = useRef<HTMLButtonElement | null>(null)
  if (editorOpen && (inlineId || formError)) { setInlineId(null); setFormError('') }
  // Keep the impact line (and so Save) in view.
  useEffect(() => { if (inlineId) window.document.getElementById(`inline-form-${inlineId}`)?.scrollIntoView?.({ block: 'nearest' }) }, [inlineId])
  useEffect(() => { const timer = window.setTimeout(() => { setInlineId(null); setFormError('') }, 0); return () => window.clearTimeout(timer) }, [month, view, planDestination, filterKey, query])

  const searchMode = !!query.trim()
  const desktop = !mobilePresentation
  const singleScope = scoped && groups.length === 1
  const banded = !searchMode && !singleScope
  // Phones: Item and Amount only. The whole row opens the editor, which holds Duplicate and Remove.
  const colSpan = desktop ? 4 : 2

  const destinationGroupKey = (key: string) => `${month}:${planDestination?.kind}:${planDestination?.id}:${key}`
  const isOpen = (key: string) => !banded || (planDestination ? !destinationClosed[destinationGroupKey(key)] : openGroups[key] ?? groupsOpenByDefault)
  const setGroupOpen = (key: string, open: boolean) => {
    if (planDestination) setDestinationClosed(value => ({ ...value, [destinationGroupKey(key)]: !open }))
    else onOpenGroupsChange(value => ({ ...value, [key]: open }))
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
  const edit = (item: BudgetItem, amountPence?: number) => { closeInline(); onEdit(item, amountPence) }
  const quickImpact = (item: BudgetItem, value = settledValue) => {
    const pence = moneyPence(value)
    if (pence === undefined || pence === item.amountPence) return undefined
    return budgetImpact(document, withAmount(document, month, item.id, pence), month, [item.id])
  }
  const commitInline = (item: BudgetItem) => {
    if (inlineId !== item.id) return
    const pence = moneyPence(inlineValue)
    if (pence === undefined) { setFormError('Enter £0 or more, with up to two decimal places.'); return }
    if (pence !== item.amountPence) {
      const preview = quickImpact(item, inlineValue)
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

  /** The second level inside an open group: whose account, or Direct / a pot. A heading with its subtotal, not another disclosure. */
  const subgroupRow = (subgroup: PlanSubgroup) => {
    const total = sumOf(subgroup.items)
    return <tr key={subgroup.key} className="plan-subgroup">
      <th scope="rowgroup" colSpan={1}><span className="plan-subgroup-name">{subgroup.name}</span></th>
      {desktop && <td className="plan-share-cell"><span className="plan-share">{percent(shareOf(total))}</span></td>}
      <td className="plan-amount-cell">{pounds(total)}</td>
      {desktop && <td className="plan-actions-cell"/>}
    </tr>
  }

  /** One line under the row being edited: scope, the plan balance before → after, and each person's change. */
  const impactLine = (item: BudgetItem, impact: ReturnType<typeof quickImpact>) => {
    const people = impact && 'impact' in impact ? impact.impact.people.filter(person => person.beforePence !== person.afterPence) : []
    return <span className="plan-inline-impact">
      <span id={`inline-scope-${item.id}`}>Changes {editScopeLabel}</span>
      {impact && 'impact' in impact && <>
        <span> · Plan <strong className={impact.impact.afterBalancePence < 0 ? 'is-over' : undefined}>{balanceLabel(impact.impact.beforeBalancePence)} → {balanceLabel(impact.impact.afterBalancePence)}</strong></span>
        {people.map(person => <span key={person.personId}> · {document.household.adults.find(adult => adult.id === person.personId)?.name ?? 'Person'} {delta(person.afterPence - person.beforePence)}</span>)}
        {impact.impact.incomplete && <span> · Some items can’t be funded yet</span>}
      </>}
    </span>
  }
  /** Leaving the amount and its line without Enter cancels. */
  const blurInline = (item: BudgetItem, next: EventTarget | null) => { if (!(next instanceof Element && next.closest(`[data-inline-edit="${item.id}"]`))) cancelInline() }
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault()

  const itemRows = (item: BudgetItem, nested = false) => {
    const editing = inlineId === item.id
    const impact = editing ? quickImpact(item) : undefined
    const category = labels.categoryName(item) ?? 'Uncategorised'
    // Destination bands, or a pot or direct-to-account view, already name the destination, so the line says the category instead.
    const sameDestination = !searchMode && (grouping === 'destination' || (!!planDestination && planDestination.kind !== 'account'))
    const inlineEditable = item.frequency === 'monthly' && item.funding !== 'fixed'
    return <Fragment key={item.id}><tr className={`budget-v3-item${nested ? ' is-nested' : ''}${editing ? ' is-editing' : ''}`} data-inline-edit={editing ? item.id : undefined} onClick={event => { if ((event.target as HTMLElement).closest('button,a,input,select,summary,details,label,form')) return; edit(item) }}>
      <th scope="row">
        <button type="button" className="budget-v3-item-name" title={`Edit details for ${item.name}`} data-budget-item-id={item.id} onClick={() => edit(item)}><span>{item.name}</span></button>
        <span className="budget-v3-item-meta"><span className="visually-hidden">Funding: </span>{labels.fundingLabel(item)}<span aria-hidden="true"> · </span>{sameDestination
          ? <><span className="visually-hidden">Category: </span>{category}</>
          : <><span className="visually-hidden">Destination: </span>{labels.destinationLabel(item)}</>}</span>
        {searchMode && <span className="budget-v3-result-context">{labels.ownerGroup(item)} · {category}</span>}
      </th>
      {desktop && <td className="plan-share-cell">{!searchMode && <span className="plan-share">{percent(shareOf(item.amountPence))}</span>}</td>}
      <td className="plan-amount-cell">{editing
        ? <span className="plan-inline-field"><span aria-hidden="true">£</span><input id={`inline-amount-${item.id}`} form={`inline-form-${item.id}`} aria-label={`Monthly amount for ${item.name}`} aria-describedby={`inline-scope-${item.id}${formError ? ` inline-error-${item.id}` : ''}`} className="budget-v3-inline-amount" autoFocus onFocus={event => event.currentTarget.select()} inputMode="decimal" value={inlineValue}
            onChange={event => { setInlineValue(event.target.value); setFormError('') }}
            onBlur={event => blurInline(item, event.relatedTarget)}
            onKeyDown={event => {
              if (event.key === 'Escape') { event.preventDefault(); cancelInline() }
              else if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); const pence = moneyPence(inlineValue); edit(item, pence === undefined || pence === item.amountPence ? undefined : pence) }
            }}/></span>
        : inlineEditable
          ? <button type="button" data-amount-trigger={item.id} className="budget-v3-amount" aria-label={`Edit amount for ${item.name}`} aria-expanded={editing} onClick={event => { inlineTrigger.current = event.currentTarget; setInlineId(item.id); setInlineValue((item.amountPence / 100).toFixed(2)); setSettledValue((item.amountPence / 100).toFixed(2)); setFormError(''); onQuickEditOpen() }}><span>{pounds(item.amountPence)}</span><Pencil aria-hidden="true" className="budget-v3-amount-icon"/></button>
          : <span className="budget-v3-amount is-static" title={item.funding === 'fixed' ? 'Fixed amounts: edit in the item' : 'Edit this amount in the item'}><span>{pounds(item.amountPence)}</span>{item.funding === 'fixed' ? <Lock aria-hidden="true" className="budget-v3-amount-icon"/> : <span aria-hidden="true" className="budget-v3-amount-icon"/>}</span>}</td>
      {desktop && <td className="plan-actions-cell"><details className="budget-v3-row-menu" onToggle={event => {
        const menu = event.currentTarget
        if (!menu.open) return
        const wrap = menu.closest<HTMLElement>('.budget-v3-table-wrap')
        const bottom = wrap && getComputedStyle(wrap).overflowY !== 'visible' ? Math.min(wrap.getBoundingClientRect().bottom, window.innerHeight) : window.innerHeight
        menu.dataset.openUp = bottom - menu.getBoundingClientRect().bottom < 120 ? 'true' : 'false'
      }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector<HTMLElement>('summary')?.focus() } }}>
        <summary aria-label={`More actions for ${item.name}`}><Ellipsis aria-hidden="true"/></summary>
        <div className="budget-v3-menu-actions"><button type="button" onClick={event => { event.currentTarget.closest('details')!.open = false; closeInline(); onDuplicate(item) }}>Duplicate</button><button type="button" onClick={event => { const menu = event.currentTarget.closest('details')!; menu.open = false; onRemove(item, menu.querySelector('summary')) }}>Remove</button></div>
      </details></td>}
    </tr>{editing && <tr className="budget-v3-inline-row" data-inline-edit={item.id}><td colSpan={colSpan}><form id={`inline-form-${item.id}`} className="plan-inline-form" aria-label={`Quick edit amount for ${item.name}`} onSubmit={event => { event.preventDefault(); commitInline(item) }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancelInline() } }}>
      {impactLine(item, impact)}
      {impact && 'error' in impact && <span className="plan-inline-error" role="alert">{impact.error} <button type="button" className="text-button" onMouseDown={keepFocus} onClick={() => setImpactRetry(value => value + 1)}>Retry</button></span>}
      {formError && <span id={`inline-error-${item.id}`} className="plan-inline-error" role="alert">{formError}</span>}
      <span className="plan-inline-keys">
        <button type="submit" className="text-button" onMouseDown={keepFocus} disabled={!!impact && 'error' in impact}>{desktop && <Kbd>↵</Kbd>}Save</button>
        <button type="button" className="text-button" onMouseDown={keepFocus} onClick={cancelInline}>{desktop && <Kbd>Esc</Kbd>}Cancel</button>
        {desktop && <button type="button" className="text-button" onMouseDown={keepFocus} onClick={() => { const pence = moneyPence(inlineValue); edit(item, pence === undefined || pence === item.amountPence ? undefined : pence) }}><Kbd>⇧↵</Kbd>Open editor</button>}
      </span>
    </form></td></tr>}</Fragment>
  }

  const count = `${itemCount(shown.length)}${searchMode || planDestination ? ` · ${pounds(sumOf(shown))}` : ''}`
  const toolbar = renderToolbar?.({ count, expand: banded ? { anyOpen, toggle: () => { if (anyOpen) closeInline(); groups.forEach(group => setGroupOpen(group.key, !anyOpen)) } } : undefined })
  if (empty) return <>{toolbar}{empty}</>
  return <>{toolbar}<section className="plan-card" aria-label="Budget items">
    <GroupedTable
      wrapClassName={`budget-v3-table-wrap${desktop ? ' is-flat' : ''}`} className="budget-v3-table"
      regionLabel="Plan table" caption={searchMode ? 'Matching budget items' : `Budget items by ${grouping}`}
      columns={desktop ? [
        { key: 'item', label: 'Item' }, { key: 'share', label: 'Share of plan' },
        { key: 'amount', label: 'Monthly' }, { key: 'actions', label: 'Actions', hiddenLabel: true },
      ] : [
        { key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount' },
      ]}
      groups={tableGroups} renderStickyGroup={renderStickyGroup} focusFallback={focusFallback}
      footer={!searchMode && shown.length ? <tr className="plan-total"><th scope="row">Total <span className="plan-total-count">{itemCount(shown.length)}</span></th>{desktop && <td className="plan-share-cell"/>}<td className="plan-amount-cell">{pounds(sumOf(shown))}</td>{desktop && <td className="plan-actions-cell"/>}</tr> : undefined}>
      {groups.map(group => <Fragment key={group.key}>
        {banded && <GroupedTableBandRow group={{ key: group.key, level: 0 }} colSpan={desktop ? 1 : colSpan} className={`plan-group${isOpen(group.key) ? ' is-open' : ''}`} dataGroup={grouping}
          cells={desktop ? groupFigures(group, 'td') : undefined} onClick={() => toggleGroup(group)}>{groupButton(group)}</GroupedTableBandRow>}
        {isOpen(group.key) && (banded && group.subgroups.length
          ? group.subgroups.map(subgroup => <Fragment key={subgroup.key}>{subgroupRow(subgroup)}{subgroup.items.map(item => itemRows(item, true))}</Fragment>)
          : group.items.map(item => itemRows(item)))}
      </Fragment>)}
    </GroupedTable>
  </section></>
}
