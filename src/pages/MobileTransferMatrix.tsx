import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react'
import type { MatrixAmounts, MatrixItemRow, TransferMatrixModel } from '../domain/transferMatrix'
import { formatGBP, formatGBPWhole } from '../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

function AmountCells({ amounts }: { amounts: MatrixAmounts }) {
  const rounded = (pence: number) => formatGBPWhole(pence / 100)
  return <>{amounts.byPerson.map(person => <td key={person.personId}>{rounded(person.amountPence)}</td>)}<td>{rounded(amounts.allocatedPence)}</td></>
}

function ItemRow({ item, context, accountId, id, hidden, onEditItem }: { item: MatrixItemRow; context: string; accountId: string; id: string; hidden: boolean; onEditItem?: (itemId: string, accountId: string) => void }) {
  return <tr id={id} hidden={hidden} className="transfer-matrix-item">
    <th scope="row" aria-label={`${context}: ${item.name}. Category: ${item.category.name}${item.incomplete ? ' Incomplete' : ''}`}>{item.name}<span className="transfer-matrix-purpose">{item.category.name}</span>{item.incomplete && <span className="transfer-matrix-incomplete">Incomplete</span>}{onEditItem && <button type="button" className="transfer-matrix-edit" aria-label={`Find ${item.name} in Plan for ${context}`} onClick={() => onEditItem(item.itemId, accountId)}>Find in Plan</button>}</th>
    <AmountCells amounts={item}/>
  </tr>
}

/** Read-only breakdown. Parent totals include every visible descendant amount. */
export function MobileTransferMatrix({ model, labels, onEditItem }: { model: TransferMatrixModel; labels: ReadonlyMap<string, string>; onEditItem?: (itemId: string, accountId: string) => void }) {
  const idPrefix = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(() => new Set(model.accounts.filter(account =>
    account.allocations.length === 1 && account.allocations[0]?.kind === 'direct-allocation' && account.allocations[0].items.length === 1,
  ).map(account => account.id)))
  const [expandedAllocations, setExpandedAllocations] = useState<Set<string>>(() => new Set())
  const toggle = (set: typeof setCollapsedAccounts, id: string) => set(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const update = () => setHasOverflow(element.scrollWidth > element.clientWidth + 1)
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    const table = element.querySelector('table')
    if (table) observer?.observe(table)
    window.addEventListener('resize', update)
    return () => { observer?.disconnect(); window.removeEventListener('resize', update) }
  }, [model])
  return <section className="transfer-matrix" aria-labelledby="transfer-matrix-title">
    <div className="transfer-matrix-intro">
      <h3 id="transfer-matrix-title">Planned contributions</h3>
      <p>Plans only; payment status is not tracked. Indented rows break down the total above; do not add them again.</p>
      <p>Rounded to whole pounds; displayed amounts may not add up exactly.</p>
      {model.totals.incomplete && <p className="transfer-matrix-warning" role="status"><strong>Incomplete allocation.</strong> {pounds(model.totals.plannedPence)} planned; {pounds(model.totals.unallocatedPence)} still unallocated. The table shows allocated amounts.</p>}
    </div>
    {model.accounts.length === 0 ? <p className="transfer-matrix-empty">No transfers planned. Add a budget item to an account or pot to see it here.</p> : <>
      {hasOverflow && <p className="transfer-matrix-scroll-hint" id="transfer-matrix-scroll-hint">Scroll sideways or use the arrow keys to see all columns.</p>}
      <div ref={scrollRef} className="transfer-matrix-scroll" role="region" aria-label="Transfer matrix" aria-describedby={hasOverflow ? 'transfer-matrix-scroll-hint' : undefined} tabIndex={0} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.currentTarget.scrollLeft += event.key === 'ArrowRight' ? 120 : -120
      }}>
        <table className="transfer-matrix-table">
          <caption className="visually-hidden">Planned contributions by receiving account, allocation and person. Allocated amounts are independently rounded to whole pounds.</caption>
          <thead><tr><th scope="col">Destination</th>{model.contributors.map(person => <th scope="col" key={person.personId}>{person.name}</th>)}<th scope="col">Total</th></tr></thead>
          {model.accounts.map((account, accountIndex) => {
            const label = labels.get(account.accountId) ?? account.name
            const onlyAllocation = account.allocations[0]
            const singleDirect = account.allocations.length === 1 && onlyAllocation?.kind === 'direct-allocation' && onlyAllocation.items.length === 1
            const accountExpanded = !collapsedAccounts.has(account.id)
            const accountRowId = `${idPrefix}-account-${accountIndex}`
            const accountControls = singleDirect ? `${accountRowId}-item` : account.allocations.map((_, index) => `${accountRowId}-allocation-${index}`).join(' ')
            return <tbody key={account.id}>
              <tr className="transfer-matrix-account"><th scope="row" aria-label={`${label}${account.incomplete ? ' Incomplete' : ''}`}><button type="button" className="transfer-matrix-disclosure" data-matrix-account-id={account.accountId} aria-label={`${accountExpanded ? 'Collapse' : 'Expand'} details for ${label}`} aria-expanded={accountExpanded} aria-controls={accountControls} onClick={() => toggle(setCollapsedAccounts, account.id)}><span className="transfer-matrix-chevron" aria-hidden="true">▾</span><span>{label}</span></button>{singleDirect && <span className="transfer-matrix-purpose">Direct · {onlyAllocation.items[0]!.name}</span>}{account.incomplete && <span className="transfer-matrix-incomplete">Incomplete</span>}</th><AmountCells amounts={account}/></tr>
              {singleDirect && <ItemRow item={onlyAllocation.items[0]!} context={`${label}: Direct to account`} accountId={account.accountId} id={`${accountRowId}-item`} hidden={!accountExpanded} onEditItem={onEditItem}/>}
              {!singleDirect && account.allocations.map((allocation, allocationIndex) => {
                const names = allocation.items.map(item => item.name)
                const detail = allocation.kind === 'pot'
                  ? names.length > 1 ? `${names.length} items` : names[0]?.trim().toLocaleLowerCase() !== allocation.name.trim().toLocaleLowerCase() ? names[0] : null
                  : names.length <= 2 ? names.join(' · ') : `${names.length} items`
                const allocationExpanded = expandedAllocations.has(allocation.id)
                const allocationLabel = allocation.kind === 'pot' ? allocation.name : 'Direct to account'
                const allocationRowId = `${accountRowId}-allocation-${allocationIndex}`
                return <Fragment key={allocation.id}><tr className="transfer-matrix-allocation" id={allocationRowId} hidden={!accountExpanded}>
                  <th scope="row" aria-label={`${label}: ${allocationLabel}${allocation.incomplete ? ' Incomplete' : ''}`}><button type="button" className="transfer-matrix-disclosure" aria-label={`${allocationExpanded ? 'Hide' : 'Show'} items in ${allocationLabel} for ${label}`} aria-expanded={allocationExpanded} aria-controls={allocation.items.map((_, index) => `${allocationRowId}-item-${index}`).join(' ')} onClick={() => toggle(setExpandedAllocations, allocation.id)}><span className="transfer-matrix-chevron" aria-hidden="true">▾</span><span className="transfer-matrix-allocation-name">{allocation.kind === 'pot' ? allocation.name : 'Direct'}</span></button>{detail && <span className="transfer-matrix-purpose">{detail}</span>}{allocation.incomplete && <span className="transfer-matrix-incomplete">Incomplete</span>}</th>
                  <AmountCells amounts={allocation}/>
                </tr>
                {allocation.items.map((item, itemIndex) => <ItemRow key={item.id} item={item} context={`${label}: ${allocationLabel}`} accountId={account.accountId} id={`${allocationRowId}-item-${itemIndex}`} hidden={!accountExpanded || !allocationExpanded} onEditItem={onEditItem}/>)}
                </Fragment>
              })}
            </tbody>
          })}
          <tfoot><tr><th scope="row">Allocated total{model.totals.incomplete && <span className="transfer-matrix-incomplete">Incomplete</span>}</th><AmountCells amounts={model.totals}/></tr></tfoot>
        </table>
      </div>
    </>}
  </section>
}
