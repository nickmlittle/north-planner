import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { itemDraft, moneyPence, newItemDraft, readItemDraft, type BatchError, type BudgetItemBatch, type BudgetItemDraft, type DestinationSelection } from '../domain/budgetItemDrafts'
import { monthlyContributionPence, type BudgetItem, type FundingRule } from '../domain/monthlyBudget'
import { formatGBP } from '../formatting/money'
import { DestinationPicker } from './DestinationPicker'

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

export function BudgetItemEditor({ document, month, item, onSave, onClose }: Props) {
  const adults = document.household.adults
  const [rows, setRows] = useState<BudgetItemDraft[]>(() => [item ? itemDraft(item) : newItemDraft(crypto.randomUUID(), adults[0]?.id ?? '')])
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? document.budget.categories[0]?.id ?? '__new__')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryId] = useState(() => crypto.randomUUID())
  const [destination, setDestination] = useState<DestinationSelection>(item ? { destination: item.destination } : {})
  const [destinationTouched, setDestinationTouched] = useState(false)
  const [error, setError] = useState<BatchError>()
  const [initial] = useState(() => JSON.stringify({ rows, categoryId, destination }))
  const formRef = useRef<HTMLFormElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const dirty = destinationTouched || !!newCategoryName || initial !== JSON.stringify({ rows, categoryId, destination })
  const includedRows = rows.filter(row => row.touched || row.name.trim() || row.amount.trim())
  const total = includedRows.reduce((sum, row) => sum + monthlyContributionPence(moneyPence(row.amount) ?? 0, row.frequency), 0)
  const close = () => { if (!dirty || window.confirm('Discard unsaved budget items?')) onClose() }

  useEffect(() => {
    triggerRef.current = globalThis.document.activeElement as HTMLElement | null
    const previousOverflow = globalThis.document.body.style.overflow
    globalThis.document.body.style.overflow = 'hidden'
    formRef.current?.querySelector<HTMLElement>('[data-error-key="category"]')?.focus()
    return () => { globalThis.document.body.style.overflow = previousOverflow; triggerRef.current?.focus() }
  }, [])

  useLayoutEffect(() => {
    if (pendingFocus.current) {
      formRef.current?.querySelector<HTMLElement>(`[data-error-key="${pendingFocus.current}"]`)?.focus()
      pendingFocus.current = null
    }
  }, [rows])

  const update = (id: string, patch: Partial<BudgetItemDraft>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch, touched: true } : row))
    setError(undefined)
  }
  const addRow = () => {
    const row = newItemDraft(crypto.randomUUID(), adults[0]?.id ?? '')
    pendingFocus.current = `${row.id}:name`
    setRows(current => [...current, row])
    setError(undefined)
  }
  const removeRow = (id: string) => {
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
    const failure = onSave(batch)
    setError(failure)
    if (failure) formRef.current?.querySelector<HTMLElement>(`[data-error-key="${failure.rowId ? `${failure.rowId}:` : ''}${failure.field}"]`)?.focus()
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
  const title = item ? 'Edit budget item' : 'Add budget items'
  const monthText = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return <div className="budget-v3-overlay budget-batch-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <section className="budget-batch-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-batch-title">
      <form ref={formRef} className="budget-v3-panel budget-batch-panel" aria-label={item ? 'Edit budget item' : 'Add budget item'} noValidate onSubmit={save} onKeyDown={onKeyDown}>
        <header className="budget-batch-header"><h2 id="budget-batch-title">{title}</h2><p>{monthText} · {item ? 'Update this item’s category, destination and funding.' : 'Choose a category and destination, then add one or more items.'}</p></header>
        <div className="budget-batch-body">
          <div className="budget-batch-shared">
            <div className="budget-batch-category"><label>Category<select data-error-key="category" value={categoryId} aria-invalid={error?.field === 'category'} aria-describedby={error?.field === 'category' ? 'budget-category-error' : undefined} onChange={event => { setCategoryId(event.target.value); setError(undefined) }}><option value="">Choose a category</option>{document.budget.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="__new__">Create a category…</option></select></label>
              {categoryId === '__new__' && <label>New category<input value={newCategoryName} onChange={event => { setNewCategoryName(event.target.value); setError(undefined) }}/></label>}
              {error?.field === 'category' && <p id="budget-category-error" className="budget-batch-error" role="alert">{error.message}</p>}
              <p>All rows use this category and destination.</p>
            </div>
            <div className="budget-batch-destination" data-error-key="destination" tabIndex={-1}><DestinationPicker budget={document.budget} adults={adults} value={destination} onChange={value => { setDestination(value); setDestinationTouched(true); setError(undefined) }} onDraftChange={() => setDestinationTouched(true)}/>{error?.field === 'destination' && <p className="budget-batch-error" role="alert">{error.message}</p>}</div>
          </div>
          <table className="budget-batch-table" aria-label="Budget items to save">
            <thead><tr><th>Item name</th><th>Amount</th><th>Frequency</th><th>Funding type</th><th>Funding amounts <small>Monthly, by person</small></th>{!item && <th><span className="budget-batch-sr-only">Actions</span></th>}</tr></thead>
            <tbody>{rows.map((row, index) => {
              const read = readItemDraft({ ...row, name: row.name || 'Preview' }, categoryId, destination.destination ?? { kind: 'account', accountId: 'preview' }, adults.map(person => person.id))
              const preview = 'item' in read ? budgetTransfers(previewBudget, adults.map(person => person.id), month, [read.item]) : undefined
              const amountPence = moneyPence(row.amount)
              const monthly = amountPence === undefined ? undefined : monthlyContributionPence(amountPence, row.frequency)
              const fixedTotal = adults.reduce((sum, person) => sum + (moneyPence(row.contributions[person.id] ?? '') ?? 0), 0)
              return <tr key={row.id} aria-label={`Item ${index + 1}`}>
                <td><span className="budget-batch-row-number">Item {index + 1}</span><label><span className="budget-batch-field-label">Item name</span><input data-error-key={`${row.id}:name`} value={row.name} aria-invalid={fieldError(row, 'name')} aria-describedby={descriptionId(row, 'name')} onChange={event => update(row.id, { name: event.target.value })}/></label>{errorText(row, 'name')}</td>
                <td><label><span className="budget-batch-field-label">{row.frequency === 'annually' ? 'Annual amount' : 'Amount'}</span><input inputMode="decimal" data-error-key={`${row.id}:amount`} value={row.amount} aria-invalid={fieldError(row, 'amount')} aria-describedby={descriptionId(row, 'amount')} onChange={event => update(row.id, { amount: event.target.value })}/></label><small>{row.frequency === 'annually' ? monthly !== undefined ? `Monthly equivalent: ${pounds(monthly)}` : 'Enter the annual amount' : 'Per month'}</small>{errorText(row, 'amount')}</td>
                <td><label><span className="budget-batch-field-label">Frequency</span><select data-error-key={`${row.id}:frequency`} value={row.frequency} onChange={event => update(row.id, { frequency: event.target.value as BudgetItemDraft['frequency'] })}><option value="monthly">Monthly</option><option value="annually">Annually</option></select></label>{errorText(row, 'frequency')}</td>
                <td><label><span className="budget-batch-field-label">Funding type</span><select data-error-key={`${row.id}:funding`} value={row.funding} onChange={event => update(row.id, { funding: event.target.value as FundingRule })}>{fundingOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>{errorText(row, 'funding')}</td>
                <td className="budget-batch-funding"><span className="budget-batch-mobile-heading">Funding amounts <small>Monthly, by person</small></span>
                  {row.funding === 'single' && <label>Person<select data-error-key={`${row.id}:singleFunderId`} value={row.singleFunderId} aria-invalid={fieldError(row, 'singleFunderId')} aria-describedby={descriptionId(row, 'singleFunderId')} onChange={event => update(row.id, { singleFunderId: event.target.value })}><option value="">Choose a person</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
                  {row.funding === 'fixed' ? <><div className="budget-batch-person-inputs">{adults.map(person => <label key={person.id}>{person.name} monthly contribution<input inputMode="decimal" data-error-key={`${row.id}:contributions`} value={row.contributions[person.id] ?? ''} aria-invalid={fieldError(row, 'contributions')} aria-describedby={descriptionId(row, 'contributions')} onChange={event => update(row.id, { contributions: { ...row.contributions, [person.id]: event.target.value } })}/></label>)}</div>{monthly !== undefined && <p className="budget-batch-allocation">{fixedTotal > monthly ? `${pounds(fixedTotal - monthly)} over allocated` : `${pounds(monthly - fixedTotal)} left to allocate`}</p>}</> : <>
                    {row.funding === 'custom' && <div className="budget-batch-person-inputs">{adults.map(person => <label key={person.id}>{person.name} relative weight<input inputMode="decimal" data-error-key={`${row.id}:customShares`} value={row.customShares[person.id] ?? ''} aria-invalid={fieldError(row, 'customShares')} aria-describedby={descriptionId(row, 'customShares')} onChange={event => update(row.id, { customShares: { ...row.customShares, [person.id]: event.target.value } })}/></label>)}</div>}
                    {preview?.unresolvedItemIds.length ? <p className="budget-batch-allocation">Add employment income to calculate</p> : <dl className="budget-batch-preview">{adults.map(person => <div key={person.id}><dt>{person.name}</dt><dd>{preview ? pounds(preview.people.find(row => row.personId === person.id)?.plannedPence ?? 0) : '—'}</dd></div>)}</dl>}
                  </>}
                  {errorText(row, 'singleFunderId')}{errorText(row, 'contributions')}{errorText(row, 'customShares')}
                </td>
                {!item && <td className="budget-batch-remove"><button type="button" className="text-button" aria-label={`Remove item ${index + 1}`} onClick={() => removeRow(row.id)}>Remove</button></td>}
              </tr>
            })}</tbody>
          </table>
          {!rows.length && <p className="budget-batch-empty">No items yet. Add a row to get started.</p>}
          {!item && <button className="secondary-button budget-batch-add" type="button" data-error-key="rows" onClick={addRow}>Add another item</button>}
          {error?.field === 'rows' && <p className="budget-batch-error" role="alert">{error.message}</p>}
        </div>
        <footer className="budget-batch-footer"><div aria-live="polite"><strong>{includedRows.length} {includedRows.length === 1 ? 'item' : 'items'}</strong><span>Monthly total {pounds(total)}</span></div><div><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button">{item ? 'Save item' : `Save ${includedRows.length} ${includedRows.length === 1 ? 'item' : 'items'}`}</button></div></footer>
      </form>
    </section>
  </div>
}
