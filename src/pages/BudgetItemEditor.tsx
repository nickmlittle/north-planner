import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { commitItemBatch, itemDraft, moneyPence, newItemDraft, readItemDraft, type BatchError, type BudgetItemBatch, type BudgetItemDraft, type DestinationSelection } from '../domain/budgetItemDrafts'
import { budgetEditScope, monthlyContributionPence, type BudgetItem, type FundingRule } from '../domain/monthlyBudget'
import { formatEditScope } from '../formatting/month'
import { formatGBP } from '../formatting/money'
import { DestinationPicker } from './DestinationPicker'
import { budgetImpact } from '../domain/budgetImpact'
import { BudgetImpactSummary } from './BudgetImpactSummary'

type Props = {
  document: BudgetDocument
  month: string
  item?: BudgetItem
  onSave: (batch: BudgetItemBatch) => BatchError | undefined
  onClose: () => void
}
const pounds = (pence: number) => formatGBP(pence / 100)
const fundingOptions: Array<{ value: FundingRule; label: string }> = [
  { value: 'proportional', label: 'Income ratio' }, { value: 'equal', label: 'Equal split' },
  { value: 'single', label: 'One person' }, { value: 'fixed', label: 'Fixed contributions' }, { value: 'custom', label: 'Custom split' },
]

function destinationFunding(document: BudgetDocument, selection: DestinationSelection): Pick<BudgetItemDraft, 'funding' | 'singleFunderId'> {
  const destination = selection.destination
  const potId = destination?.kind === 'pot' ? destination.potId : undefined
  const pot = selection.stagedPot?.id === potId ? selection.stagedPot : document.budget.pots.find(row => row.id === potId)
  const accountId = destination?.kind === 'account' ? destination.accountId : pot?.accountId
  const account = selection.stagedAccount?.id === accountId ? selection.stagedAccount : document.budget.accounts.find(row => row.id === accountId)
  const ownerId = account?.ownerPersonIds.length === 1 ? account.ownerPersonIds[0] : undefined
  const personalOwner = document.household.adults.find(person => person.id === ownerId)
  return personalOwner ? { funding: 'single', singleFunderId: personalOwner.id } : { funding: 'proportional', singleFunderId: document.household.adults[0]?.id ?? '' }
}

export function BudgetItemEditor({ document, month, item, onSave, onClose }: Props) {
  const adults = document.household.adults
  const [rows, setRows] = useState<BudgetItemDraft[]>(() => [item ? itemDraft(item) : newItemDraft(crypto.randomUUID(), adults[0]?.id ?? '')])
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? document.budget.categories[0]?.id ?? '__new__')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryId] = useState(() => crypto.randomUUID())
  const [destination, setDestination] = useState<DestinationSelection>(item ? { destination: item.destination } : {})
  const [destinationTouched, setDestinationTouched] = useState(false)
  const [destinationBrowsing, setDestinationBrowsing] = useState(false)
  const [error, setError] = useState<BatchError>()
  const [initial] = useState(() => JSON.stringify({ rows, categoryId, destination }))
  const formRef = useRef<HTMLFormElement>(null)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const fundingOverrides = useRef(new Set<string>())
  const triggerRef = useRef<HTMLElement | null>(null)
  const dirty = destinationTouched || !!newCategoryName || initial !== JSON.stringify({ rows, categoryId, destination })
  const includedRows = rows.filter(row => row.touched || row.name.trim() || row.amount.trim())
  const total = includedRows.reduce((sum, row) => sum + monthlyContributionPence(moneyPence(row.amount) ?? 0, row.frequency), 0)
  const close = () => { if (!dirty || window.confirm('Discard unsaved budget items?')) onClose() }

  useEffect(() => {
    triggerRef.current = globalThis.document.activeElement as HTMLElement | null
    const previousOverflow = globalThis.document.body.style.overflow
    globalThis.document.body.style.overflow = 'hidden'
    formRef.current?.querySelector<HTMLElement>('[data-editor-heading]')?.focus()
    return () => { globalThis.document.body.style.overflow = previousOverflow; triggerRef.current?.focus() }
  }, [])

  useEffect(() => {
    const viewport = window.visualViewport
    const overlay = overlayRef.current
    if (!viewport || !overlay) return
    const resize = () => {
      if (!window.matchMedia('(max-width: 640px)').matches) { overlay.style.removeProperty('height'); overlay.style.removeProperty('top'); return }
      overlay.style.height = `${viewport.height}px`
      overlay.style.top = `${viewport.offsetTop}px`
    }
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.matches('input, select, button')) return
      window.setTimeout(() => event.target instanceof HTMLElement && event.target.isConnected && event.target.scrollIntoView({ block: 'nearest' }), 100)
    }
    resize()
    viewport.addEventListener('resize', resize)
    viewport.addEventListener('scroll', resize)
    const form = formRef.current
    form?.addEventListener('focusin', focus)
    return () => { viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); form?.removeEventListener('focusin', focus) }
  }, [])

  useLayoutEffect(() => {
    if (pendingFocus.current) {
      formRef.current?.querySelector<HTMLElement>(`[data-error-key="${pendingFocus.current}"]`)?.focus()
      pendingFocus.current = null
    }
  }, [rows])

  const update = (id: string, patch: Partial<BudgetItemDraft>) => {
    if ('funding' in patch || 'singleFunderId' in patch || 'contributions' in patch || 'customShares' in patch) fundingOverrides.current.add(id)
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch, touched: true } : row))
    setError(undefined)
  }
  const changeDestination = (value: DestinationSelection) => {
    setDestination(value)
    setDestinationTouched(true)
    setError(undefined)
    if (!item && value.destination) {
      const defaults = destinationFunding(document, value)
      const overrides = new Set(fundingOverrides.current)
      setRows(current => current.map(row => overrides.has(row.id) ? row : { ...row, ...defaults }))
    }
  }
  const addRow = () => {
    const row = { ...newItemDraft(crypto.randomUUID(), adults[0]?.id ?? ''), ...destinationFunding(document, destination) }
    pendingFocus.current = `${row.id}:name`
    setRows(current => [...current, row])
    setError(undefined)
  }
  const removeRow = (id: string) => {
    fundingOverrides.current.delete(id)
    const index = rows.findIndex(row => row.id === id)
    const remaining = rows.filter(row => row.id !== id)
    const next = remaining[Math.min(index, remaining.length - 1)]
    pendingFocus.current = next ? `${next.id}:name` : 'rows'
    setRows(remaining)
    setError(undefined)
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    const batch: BudgetItemBatch = {
      rows, categoryId: categoryId === '__new__' ? '' : categoryId,
      ...(categoryId === '__new__' ? { newCategory: { id: newCategoryId, name: newCategoryName } } : {}),
      destination, ...(item ? { editingId: item.id } : {}),
    }
    if (draftImpact && 'error' in draftImpact) return
    const failure: BatchError | undefined = destinationBrowsing ? { field: 'destination', message: 'Finish choosing a destination, or keep the current one.' } : onSave(batch)
    setError(failure)
    if (failure) {
      if (item && failure.field === 'frequency') detailsRef.current!.open = true
      formRef.current?.querySelector<HTMLElement>(`[data-error-key="${failure.rowId ? `${failure.rowId}:` : ''}${failure.field}"]`)?.focus()
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close() }
    if (event.key === 'Tab') {
      const controls = [...(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && globalThis.document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && globalThis.document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }
  const previewBudget = {
    ...document.budget,
    accounts: destination.stagedAccount ? [...document.budget.accounts, destination.stagedAccount] : document.budget.accounts,
    pots: destination.stagedPot ? [...document.budget.pots, destination.stagedPot] : document.budget.pots,
  }
  const fieldError = (row: BudgetItemDraft, field: string) => error?.rowId === row.id && error.field === field
  const errorText = (row: BudgetItemDraft, field: string) => fieldError(row, field) ? <p id={`${row.id}-${field}-error`} className="budget-batch-error" role="alert">{error!.message}</p> : null
  const descriptionId = (row: BudgetItemDraft, field: string) => fieldError(row, field) ? `${row.id}-${field}-error` : undefined
  const title = item ? 'Edit budget item' : 'Add items'
  const monthText = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const editRow = item ? rows[0] : undefined
  const editRead = editRow ? readItemDraft({ ...editRow, name: editRow.name || 'Preview' }, categoryId, destination.destination ?? { kind: 'account', accountId: 'preview' }, adults.map(person => person.id)) : undefined
  const editPreview = editRead && 'item' in editRead ? budgetTransfers(previewBudget, adults.map(person => person.id), month, [editRead.item]) : undefined
  const originalPreview = item ? budgetTransfers(document.budget, adults.map(person => person.id), month, [item]) : undefined
  const splitChanged = !!editPreview && !!originalPreview && adults.some(person => editPreview.people.find(row => row.personId === person.id)?.plannedPence !== originalPreview.people.find(row => row.personId === person.id)?.plannedPence)
  const financialChange = !item || !!editRow && (moneyPence(editRow.amount) !== item.entryAmountPence || editRow.frequency !== item.frequency || editRow.funding !== item.funding || editRow.singleFunderId !== (item.singleFunderId ?? '') || JSON.stringify(editRow.contributions) !== JSON.stringify(itemDraft(item).contributions) || JSON.stringify(editRow.customShares) !== JSON.stringify(itemDraft(item).customShares) || JSON.stringify(destination.destination) !== JSON.stringify(item.destination))
  const draftBatch: BudgetItemBatch = { rows, categoryId: categoryId === '__new__' ? '' : categoryId, ...(categoryId === '__new__' ? { newCategory: { id: newCategoryId, name: newCategoryName } } : {}), destination, ...(item ? { editingId: item.id } : {}) }
  const draftResult = financialChange ? commitItemBatch(document, month, draftBatch) : undefined
  const draftImpact = draftResult && 'document' in draftResult ? budgetImpact(document, draftResult.document, month, draftResult.items.map(row => row.id)) : undefined

  return <div ref={overlayRef} className="budget-v3-overlay budget-batch-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="budget-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-batch-title">
      <form ref={formRef} className={`budget-v3-panel budget-batch-panel${item ? ' budget-single-panel' : ''}`} aria-label={item ? 'Edit budget item' : 'Add item'} noValidate onSubmit={save} onKeyDown={onKeyDown}>
        <header className="budget-batch-header"><h2 id="budget-batch-title" data-editor-heading tabIndex={-1}>{title}</h2><p>{monthText} · {item ? 'Update this item’s details.' : 'Choose a category and destination, then add one or more items.'}</p></header>
        <div className="budget-batch-body">
          <p className="budget-edit-scope">Changes apply: {formatEditScope(budgetEditScope(document.budget, month))}. Later saved budgets stay unchanged.</p>
          {item && editRow ? <div className="budget-single-fields">
            <label>Item name<input data-error-key={`${editRow.id}:name`} value={editRow.name} aria-invalid={fieldError(editRow, 'name')} aria-describedby={descriptionId(editRow, 'name')} onChange={event => update(editRow.id, { name: event.target.value })}/></label>{errorText(editRow, 'name')}
            <label>{editRow.frequency === 'annually' ? 'Annual amount' : 'Monthly amount'}<span className="budget-money-field"><input inputMode="decimal" data-error-key={`${editRow.id}:amount`} value={editRow.amount} aria-invalid={fieldError(editRow, 'amount')} aria-describedby={descriptionId(editRow, 'amount')} onChange={event => update(editRow.id, { amount: event.target.value })}/></span></label>{editRow.frequency === 'annually' && <small>Monthly equivalent: {pounds(monthlyContributionPence(moneyPence(editRow.amount) ?? 0, 'annually'))}</small>}{errorText(editRow, 'amount')}
            <div className="budget-single-destination" data-error-key="destination" tabIndex={-1}><DestinationPicker budget={document.budget} adults={adults} value={destination} onChange={changeDestination} onDraftChange={() => setDestinationTouched(true)} onBrowsingChange={setDestinationBrowsing}/>{error?.field === 'destination' && <p className="budget-batch-error" role="alert">{error.message}</p>}</div>
            <div className="budget-batch-category"><label>Category<select data-error-key="category" value={categoryId} aria-invalid={error?.field === 'category'} onChange={event => { setCategoryId(event.target.value); setError(undefined) }}><option value="">Choose a category</option>{document.budget.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="__new__">Create a category…</option></select></label>{categoryId === '__new__' && <label>New category<input value={newCategoryName} onChange={event => { setNewCategoryName(event.target.value); setError(undefined) }}/></label>}{error?.field === 'category' && <p className="budget-batch-error" role="alert">{error.message}</p>}</div>
            <label>Funding type<select data-error-key={`${editRow.id}:funding`} value={editRow.funding} onChange={event => update(editRow.id, { funding: event.target.value as FundingRule })}>{fundingOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>{errorText(editRow, 'funding')}
            {editRow.funding === 'single' && <label>Person<select data-error-key={`${editRow.id}:singleFunderId`} value={editRow.singleFunderId} onChange={event => update(editRow.id, { singleFunderId: event.target.value })}>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
            {editRow.funding === 'fixed' && <div className="budget-single-allocation"><strong>Monthly contributions</strong>{adults.map(person => <label key={person.id}>{person.name}<input inputMode="decimal" aria-label={`${person.name} monthly contribution`} data-error-key={`${editRow.id}:contributions`} value={editRow.contributions[person.id] ?? ''} onChange={event => update(editRow.id, { contributions: { ...editRow.contributions, [person.id]: event.target.value } })}/></label>)}{(()=>{const monthly=monthlyContributionPence(moneyPence(editRow.amount)??0,editRow.frequency),allocated=adults.reduce((sum,person)=>sum+(moneyPence(editRow.contributions[person.id]??'')??0),0);return <small>{allocated>monthly?`${pounds(allocated-monthly)} over allocated`:`${pounds(monthly-allocated)} left to allocate`}</small>})()}</div>}
            {editRow.funding === 'custom' && <div className="budget-single-allocation"><strong>Relative weights</strong>{adults.map(person => <label key={person.id}>{person.name}<input inputMode="decimal" aria-label={`${person.name} relative weight`} data-error-key={`${editRow.id}:customShares`} value={editRow.customShares[person.id] ?? ''} onChange={event => update(editRow.id, { customShares: { ...editRow.customShares, [person.id]: event.target.value } })}/></label>)}</div>}
            {errorText(editRow, 'singleFunderId')}{errorText(editRow, 'contributions')}{errorText(editRow, 'customShares')}
            <div className="budget-single-contributions"><strong>Monthly contributions</strong>{editPreview?.unresolvedItemIds.length ? <p>Add employment income to calculate contributions.</p> : <dl>{adults.map(person => <div key={person.id}><dt>{person.name}</dt><dd>{editPreview ? pounds(editPreview.people.find(row => row.personId === person.id)?.plannedPence ?? 0) : '—'}</dd></div>)}</dl>}{splitChanged && <p>Saving this change will update what household members contribute.</p>}</div>
            {draftImpact && ('impact' in draftImpact ? <BudgetImpactSummary impact={draftImpact.impact} document={draftResult && 'document' in draftResult ? draftResult.document : document}/> : <p role="alert" className="budget-batch-error">{draftImpact.error} <button type="button" onClick={() => setRows(current => [...current])}>Retry</button></p>)}
            <details ref={detailsRef} className="budget-single-details"><summary>More details · {editRow.frequency === 'annually' ? 'Annually' : 'Monthly'}</summary><label>Frequency<select data-error-key={`${editRow.id}:frequency`} value={editRow.frequency} onChange={event => update(editRow.id, { frequency: event.target.value as BudgetItemDraft['frequency'] })}><option value="monthly">Monthly</option><option value="annually">Annually</option></select></label>{errorText(editRow, 'frequency')}</details>
          </div> : <>
          <div className="budget-batch-shared">
            <div className="budget-batch-category"><label>Category<select data-error-key="category" value={categoryId} aria-invalid={error?.field === 'category'} aria-describedby={error?.field === 'category' ? 'budget-category-error' : undefined} onChange={event => { setCategoryId(event.target.value); setError(undefined) }}><option value="">Choose a category</option>{document.budget.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="__new__">Create a category…</option></select></label>
              {categoryId === '__new__' && <label>New category<input value={newCategoryName} onChange={event => { setNewCategoryName(event.target.value); setError(undefined) }}/></label>}
              {error?.field === 'category' && <p id="budget-category-error" className="budget-batch-error" role="alert">{error.message}</p>}
            </div>
            <div className="budget-batch-destination" data-error-key="destination" tabIndex={-1}><span className="budget-batch-shared-label">Destination</span><DestinationPicker budget={document.budget} adults={adults} value={destination} onChange={changeDestination} onDraftChange={() => setDestinationTouched(true)} onBrowsingChange={setDestinationBrowsing}/>{error?.field === 'destination' && <p className="budget-batch-error" role="alert">{error.message}</p>}</div>
          </div>
          <p className="budget-batch-shared-note">All items share this category and destination. Funding contributions are monthly.</p>
          <table className="budget-batch-table" aria-label="Budget items to save">
            <thead><tr><th>Item name</th><th>Amount</th><th>Frequency</th><th>Funding type</th><th>Funding amounts</th>{!item && <th>Actions</th>}</tr></thead>
            <tbody>{rows.map((row, index) => {
              const read = readItemDraft({ ...row, name: row.name || 'Preview' }, categoryId, destination.destination ?? { kind: 'account', accountId: 'preview' }, adults.map(person => person.id))
              const preview = 'item' in read ? budgetTransfers(previewBudget, adults.map(person => person.id), month, [read.item]) : undefined
              const amountPence = moneyPence(row.amount)
              const monthly = amountPence === undefined ? undefined : monthlyContributionPence(amountPence, row.frequency)
              const fixedTotal = adults.reduce((sum, person) => sum + (moneyPence(row.contributions[person.id] ?? '') ?? 0), 0)
              return <tr key={row.id} aria-label={`Item ${index + 1}`}>
                <td><span className="budget-batch-row-number">Item {index + 1}</span><label><span className="budget-batch-field-label">Item name</span><input data-error-key={`${row.id}:name`} value={row.name} aria-invalid={fieldError(row, 'name')} aria-describedby={descriptionId(row, 'name')} onChange={event => update(row.id, { name: event.target.value })}/></label>{errorText(row, 'name')}</td>
                <td><label><span className="budget-batch-field-label">{row.frequency === 'annually' ? 'Annual amount' : 'Monthly amount'}</span><span className="budget-money-field"><input inputMode="decimal" data-error-key={`${row.id}:amount`} value={row.amount} aria-invalid={fieldError(row, 'amount')} aria-describedby={descriptionId(row, 'amount')} onChange={event => update(row.id, { amount: event.target.value })}/></span></label><small>{row.frequency === 'annually' ? monthly !== undefined ? `Monthly equivalent: ${pounds(monthly)}` : 'Enter the annual amount' : 'Per month'}</small>{errorText(row, 'amount')}</td>
                <td><label><span className="budget-batch-field-label">Frequency</span><select data-error-key={`${row.id}:frequency`} value={row.frequency} onChange={event => update(row.id, { frequency: event.target.value as BudgetItemDraft['frequency'] })}><option value="monthly">Monthly</option><option value="annually">Annually</option></select></label>{errorText(row, 'frequency')}</td>
                <td><label><span className="budget-batch-field-label">Funding type</span><select data-error-key={`${row.id}:funding`} value={row.funding} onChange={event => update(row.id, { funding: event.target.value as FundingRule })}>{fundingOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>{errorText(row, 'funding')}</td>
                <td className="budget-batch-funding"><div className="budget-batch-funding-content"><span className="budget-batch-mobile-heading">Funding amounts</span>
                  {row.funding === 'single' && <label className="budget-batch-person-select"><span className="budget-batch-field-label">Person</span><select aria-label="Person" data-error-key={`${row.id}:singleFunderId`} value={row.singleFunderId} aria-invalid={fieldError(row, 'singleFunderId')} aria-describedby={descriptionId(row, 'singleFunderId')} onChange={event => update(row.id, { singleFunderId: event.target.value })}><option value="">Choose a person</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
                  {row.funding === 'fixed' ? <><div className="budget-batch-person-inputs">{adults.map(person => <label key={person.id}><span className="budget-batch-inline-person">{person.name}</span><input aria-label={`${person.name} monthly contribution`} inputMode="decimal" data-error-key={`${row.id}:contributions`} value={row.contributions[person.id] ?? ''} aria-invalid={fieldError(row, 'contributions')} aria-describedby={descriptionId(row, 'contributions')} onChange={event => update(row.id, { contributions: { ...row.contributions, [person.id]: event.target.value } })}/></label>)}</div>{monthly !== undefined && <p className="budget-batch-allocation">{fixedTotal > monthly ? `${pounds(fixedTotal - monthly)} over allocated` : `${pounds(monthly - fixedTotal)} left to allocate`}</p>}</> : <>
                    {row.funding === 'custom' && <div className="budget-batch-person-inputs">{adults.map(person => <label key={person.id}><span className="budget-batch-inline-person">{person.name}</span><input aria-label={`${person.name} relative weight`} inputMode="decimal" data-error-key={`${row.id}:customShares`} value={row.customShares[person.id] ?? ''} aria-invalid={fieldError(row, 'customShares')} aria-describedby={descriptionId(row, 'customShares')} onChange={event => update(row.id, { customShares: { ...row.customShares, [person.id]: event.target.value } })}/></label>)}</div>}
                    {preview?.unresolvedItemIds.length ? <p className="budget-batch-allocation">Add employment income to calculate</p> : <dl className="budget-batch-preview">{adults.map(person => <div key={person.id}><dt>{person.name}</dt><dd>{preview ? pounds(preview.people.find(row => row.personId === person.id)?.plannedPence ?? 0) : '—'}</dd></div>)}</dl>}
                  </>}
                  {errorText(row, 'singleFunderId')}{errorText(row, 'contributions')}{errorText(row, 'customShares')}
                </div>
                </td>
                {!item && <td className="budget-batch-remove"><button type="button" className="text-button" aria-label={`Remove item ${index + 1}`} onClick={() => removeRow(row.id)}>Remove</button></td>}
              </tr>
            })}</tbody>
          </table>
          {!rows.length && <p className="budget-batch-empty">No items yet. Add a row to get started.</p>}
          {!item && <button className="secondary-button budget-batch-add" type="button" data-error-key="rows" onClick={addRow}>Add another item</button>}
          {error?.field === 'rows' && <p className="budget-batch-error" role="alert">{error.message}</p>}
          {draftImpact && ('impact' in draftImpact ? <BudgetImpactSummary impact={draftImpact.impact} document={draftResult && 'document' in draftResult ? draftResult.document : document}/> : <p role="alert" className="budget-batch-error">{draftImpact.error} <button type="button" onClick={() => setRows(current => [...current])}>Retry</button></p>)}
          </>}
        </div>
        <footer className="budget-batch-footer"><div aria-live="polite"><strong>{includedRows.length} {includedRows.length === 1 ? 'item' : 'items'}</strong><span>Monthly total {pounds(total)}</span></div><div><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button" disabled={!!draftImpact && 'error' in draftImpact}>{item || rows.length < 2 ? 'Save item' : `Save ${includedRows.length} ${includedRows.length === 1 ? 'item' : 'items'}`}</button></div></footer>
      </form>
    </section>
  </div>
}
