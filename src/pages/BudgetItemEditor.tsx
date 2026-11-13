import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { commitItemBatch, itemDraft, moneyPence, newItemDraft, readItemDraft, type BatchError, type BudgetItemBatch, type BudgetItemDraft, type DestinationSelection } from '../domain/budgetItemDrafts'
import { budgetEditScope, monthlyContributionPence, resolveBudget, updateBudgetAtMonth, validDestination, type BudgetDestination, type BudgetItem, type FundingRule } from '../domain/monthlyBudget'
import { formatEditScope, formatMonth } from '../formatting/month'
import { formatGBP } from '../formatting/money'
import { DestinationPicker } from './DestinationPicker'
import { budgetImpact } from '../domain/budgetImpact'
import { ImpactPreview } from '../components/ImpactPreview'
import { PHONE_QUERY } from '../breakpoints'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Kbd, Sheet } from '../components/ui'
import { destinationLabel, shortAccountLabels } from './budgetLabels'
import './BudgetItemEditor.css'

type Props = {
  document: BudgetDocument
  month: string
  item?: BudgetItem
  /** Saves one item. `another` (⌘↵ on add) keeps the editor open for the next one. */
  onSave: (batch: BudgetItemBatch, options: { another: boolean }) => BatchError | undefined
  onClose: () => void
  /** Edit mode: remove the item after the editor's own confirm. */
  onRemove?: () => void
  /** Edit mode: start a new item from the saved one (after confirming any unsaved changes are dropped). */
  onDuplicate?: () => void
  /** Add mode: prefill the new item from this one ("Netflix (copy)"), keeping its funding when the destination changes. */
  template?: BudgetItem
}
const pounds = (pence: number) => formatGBP(pence / 100)
const fundingOptions: Array<{ value: FundingRule; label: string }> = [
  { value: 'proportional', label: 'Income ratio' }, { value: 'equal', label: 'Equal split' },
  { value: 'single', label: 'One person' }, { value: 'fixed', label: 'Fixed amounts' }, { value: 'custom', label: 'Custom split' },
]
const isFunding = (value: string | null): value is FundingRule => fundingOptions.some(option => option.value === value)

/** This device's last choices when adding, so a run of similar items needs fewer clicks. */
const LAST = { destination: 'north.lastDestination', category: 'north.lastCategory', funding: 'north.lastFunding' }
const readLast = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const rememberLast = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* A convenience only. */ } }
const destinationKey = (destination: BudgetDestination) => destination.kind === 'pot' ? `pot:${destination.potId}` : `account:${destination.accountId}`
const sameDestination = (a?: BudgetDestination, b?: BudgetDestination) => !!a && !!b && destinationKey(a) === destinationKey(b)

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

/** Up to five destinations this month's items use most, the device's last-used first. */
function frequentDestinations(document: BudgetDocument, month: string): BudgetDestination[] {
  const counts = new Map<string, { destination: BudgetDestination; count: number }>()
  for (const row of resolveBudget(document.budget, month).items) {
    const key = destinationKey(row.destination)
    counts.set(key, { destination: row.destination, count: (counts.get(key)?.count ?? 0) + 1 })
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count).map(row => row.destination)
  let last: BudgetDestination | undefined
  try { last = JSON.parse(readLast(LAST.destination) ?? 'null') ?? undefined } catch { last = undefined }
  const lastValid = last && validDestination(last, document.budget) ? [last] : []
  return [...lastValid, ...ranked.filter(row => !lastValid.some(first => sameDestination(first, row)))].slice(0, 5)
}

/**
 * One editor for adding and editing an item, in the order people think: name, amount and how often, where it goes
 * (the destinations used most as chips, then Other… for the full picker), then category and funding. Adding offers
 * ⌘↵ "Add and start another", which keeps where it goes, the category and the funding.
 */
export function BudgetItemEditor({ document, month, item, onSave, onClose, onRemove, onDuplicate, template }: Props) {
  const adults = document.household.adults
  const formId = useId()
  const source = item ?? template
  const firstDraft = () => {
    if (item) return itemDraft(item)
    if (template) return { ...itemDraft(template), id: crypto.randomUUID(), name: `${template.name} (copy)` }
    const funding = readLast(LAST.funding)
    return { ...newItemDraft(crypto.randomUUID(), adults[0]?.id ?? ''), ...isFunding(funding) ? { funding } : {} }
  }
  const [row, setRow] = useState<BudgetItemDraft>(firstDraft)
  const lastCategory = readLast(LAST.category)
  const [categoryId, setCategoryId] = useState(() => source?.categoryId ?? (document.budget.categories.some(category => category.id === lastCategory) ? lastCategory! : document.budget.categories[0]?.id ?? '__new__'))
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryId, setNewCategoryId] = useState(() => crypto.randomUUID())
  const [destination, setDestination] = useState<DestinationSelection>(source ? { destination: source.destination } : {})
  const [frequent] = useState(() => frequentDestinations(document, month))
  const [otherOpen, setOtherOpen] = useState(false)
  const [pickerSession, setPickerSession] = useState(0)
  const [destinationTouched, setDestinationTouched] = useState(false)
  const [destinationBrowsing, setDestinationBrowsing] = useState(false)
  const [error, setError] = useState<BatchError>()
  const [initial] = useState(() => JSON.stringify({ row, categoryId, destination }))
  const formRef = useRef<HTMLFormElement>(null)
  const fundingOverridden = useRef(!!template)
  const dirty = destinationTouched || !!newCategoryName || initial !== JSON.stringify({ row, categoryId, destination })
  const [discarding, setDiscarding] = useState<false | 'close' | 'duplicate'>(false)
  const [removing, setRemoving] = useState(false)
  const close = () => { if (dirty) setDiscarding('close'); else onClose() }
  const duplicate = () => { if (dirty) setDiscarding('duplicate'); else onDuplicate?.() }
  const pendingFocus = useRef<string | null>(null)

  // Phones: the sheet fills the visual viewport, so the footer stays above the keyboard.
  useEffect(() => {
    const viewport = window.visualViewport
    const sheet = formRef.current?.closest<HTMLElement>('.sheet')
    if (!viewport || !sheet) return
    const resize = () => {
      if (!window.matchMedia?.(PHONE_QUERY).matches) { sheet.style.removeProperty('height'); return }
      sheet.style.height = `${viewport.height}px`
    }
    resize()
    viewport.addEventListener('resize', resize)
    return () => viewport.removeEventListener('resize', resize)
  }, [])

  useLayoutEffect(() => {
    if (!pendingFocus.current) return
    formRef.current?.querySelector<HTMLElement>(`[data-error-key="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  })

  const update = (patch: Partial<BudgetItemDraft>) => {
    if ('funding' in patch || 'singleFunderId' in patch || 'contributions' in patch || 'customShares' in patch) fundingOverridden.current = true
    setRow(current => ({ ...current, ...patch, touched: true }))
    setError(undefined)
  }
  const changeDestination = (value: DestinationSelection) => {
    setDestination(value)
    setDestinationTouched(true)
    setError(undefined)
    if (!item && value.destination && !fundingOverridden.current) setRow(current => ({ ...current, ...destinationFunding(document, value) }))
  }
  const chooseChip = (value: BudgetDestination) => { setOtherOpen(false); changeDestination({ destination: value }) }
  const openOther = () => { setOtherOpen(true); setPickerSession(session => session + 1); pendingFocus.current = 'destination-picker' }

  const batchFor = (draft: BudgetItemDraft): BudgetItemBatch => ({
    rows: [draft], categoryId: categoryId === '__new__' ? '' : categoryId,
    ...(categoryId === '__new__' ? { newCategory: { id: newCategoryId, name: newCategoryName } } : {}),
    destination, ...(item ? { editingId: item.id } : {}),
  })
  const save = (another: boolean) => {
    if (draftImpact && 'error' in draftImpact) return
    const failure: BatchError | undefined = otherOpen && destinationBrowsing ? { field: 'destination', message: 'Finish choosing a destination, or keep the current one.' } : onSave(batchFor({ ...row, touched: true }), { another: another && !item })
    setError(failure)
    if (failure) { formRef.current?.querySelector<HTMLElement>(`[data-error-key="${failure.rowId ? `${failure.rowId}:` : ''}${failure.field}"]`)?.focus(); return }
    if (item) return
    if (destination.destination) rememberLast(LAST.destination, JSON.stringify(destination.destination))
    if (categoryId !== '__new__') rememberLast(LAST.category, categoryId)
    rememberLast(LAST.funding, row.funding)
    if (!another) return
    // Start the next one: keep where it goes, the category and the funding; clear the name and amount.
    const next = { ...row, id: crypto.randomUUID(), name: '', amount: '', touched: false }
    if (categoryId === '__new__') { setCategoryId(newCategoryId); setNewCategoryName(''); setNewCategoryId(crypto.randomUUID()) }
    setDestination(current => ({ destination: current.destination }))
    setOtherOpen(false)
    setRow(next)
    pendingFocus.current = `${next.id}:name`
  }
  const onSubmit = (event: FormEvent) => { event.preventDefault(); save(false) }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !item) { event.preventDefault(); save(true) }
  }

  const previewBudget = {
    ...document.budget,
    accounts: destination.stagedAccount ? [...document.budget.accounts, destination.stagedAccount] : document.budget.accounts,
    pots: destination.stagedPot ? [...document.budget.pots, destination.stagedPot] : document.budget.pots,
  }
  const accountLabels = shortAccountLabels(previewBudget.accounts, adults)
  const chipLabel = (value: BudgetDestination) => {
    const pot = value.kind === 'pot' ? previewBudget.pots.find(row => row.id === value.potId) : undefined
    const accountId = value.kind === 'account' ? value.accountId : pot?.accountId
    return destinationLabel(accountLabels.get(accountId ?? '') ?? 'Account', pot?.name)
  }
  const chips = destination.destination && !frequent.some(row => sameDestination(row, destination.destination)) ? [...frequent, destination.destination] : frequent
  const fieldError = (field: string) => error?.rowId === row.id && error.field === field
  const errorText = (field: string) => fieldError(field) ? <p id={`${row.id}-${field}-error`} className="item-editor-error" role="alert">{error!.message}</p> : null
  const describedBy = (field: string) => fieldError(field) ? `${row.id}-${field}-error` : undefined
  const read = readItemDraft({ ...row, name: row.name || 'Preview' }, categoryId, destination.destination ?? { kind: 'account', accountId: 'preview' }, adults.map(person => person.id))
  const preview = 'item' in read ? budgetTransfers(previewBudget, adults.map(person => person.id), month, [read.item]) : undefined
  const entered = row.touched || !!row.name.trim() || !!row.amount.trim()
  const financialChange = !item ? entered : moneyPence(row.amount) !== item.entryAmountPence || row.frequency !== item.frequency || row.funding !== item.funding || row.singleFunderId !== (item.singleFunderId ?? '') || JSON.stringify(row.contributions) !== JSON.stringify(itemDraft(item).contributions) || JSON.stringify(row.customShares) !== JSON.stringify(itemDraft(item).customShares) || !sameDestination(destination.destination, item.destination)
  const draftResult = financialChange ? commitItemBatch(document, month, batchFor({ ...row, touched: true })) : undefined
  const draftImpact = draftResult && 'document' in draftResult ? budgetImpact(document, draftResult.document, month, draftResult.items.map(saved => saved.id)) : undefined
  const monthly = monthlyContributionPence(moneyPence(row.amount) ?? 0, row.frequency)
  const fixedTotal = adults.reduce((sum, person) => sum + (moneyPence(row.contributions[person.id] ?? '') ?? 0), 0)
  const noAccounts = !document.budget.accounts.length

  const footer = <>
    <ImpactPreview compact scopeText={`Changes apply: ${formatEditScope(budgetEditScope(document.budget, month))}.`} result={draftImpact} document={draftResult && 'document' in draftResult ? draftResult.document : document} onRetry={() => setRow(current => ({ ...current }))}/>
    <div className="item-editor-actions">
      {item ? <span className="item-editor-secondary">{onDuplicate && <button type="button" className="text-button" onClick={duplicate}>Duplicate</button>}{onRemove && <button type="button" className="text-button item-editor-remove" onClick={() => setRemoving(true)}>Remove item</button>}</span>
        : <button type="button" className="text-button item-editor-another" disabled={!entered || (!!draftImpact && 'error' in draftImpact)} onClick={() => save(true)}><Kbd>⌘↵</Kbd>Add and start another</button>}
      <button type="button" className="secondary-button" onClick={close}>Cancel</button>
      <button type="submit" form={formId} className="primary-button" disabled={(!item && !entered) || (!!draftImpact && 'error' in draftImpact)}>{item ? 'Save item' : 'Add item'}</button>
    </div>
  </>

  return <>
    <Sheet title={item ? 'Edit item' : 'Add item'} description={formatMonth(month)} onClose={close} dismissOnScrim className="item-editor-sheet" footer={footer} returnFocusTo={() => globalThis.document.querySelector<HTMLElement>('.budget-v3-table-wrap')}>
      <form ref={formRef} id={formId} className="item-editor budget-v3-panel" aria-label={item ? 'Edit item' : 'Add item'} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown}>
        <label className="item-editor-field">Name<input data-autofocus data-error-key={`${row.id}:name`} value={row.name} aria-invalid={fieldError('name')} aria-describedby={describedBy('name')} onChange={event => update({ name: event.target.value })}/></label>{errorText('name')}
        <div className="item-editor-pair is-amount">
          <label className="item-editor-field">Amount<span className="budget-money-field"><input inputMode="decimal" data-error-key={`${row.id}:amount`} value={row.amount} aria-invalid={fieldError('amount')} aria-describedby={describedBy('amount')} onChange={event => update({ amount: event.target.value })}/></span></label>
          <label className="item-editor-field">Every<select data-error-key={`${row.id}:frequency`} value={row.frequency} onChange={event => update({ frequency: event.target.value as BudgetItemDraft['frequency'] })}><option value="monthly">Month</option><option value="annually">Year</option></select></label>
        </div>
        {row.frequency === 'annually' && <small className="item-editor-hint">{moneyPence(row.amount) !== undefined ? `Monthly equivalent: ${pounds(monthly)}` : 'Enter the yearly amount'}</small>}
        {errorText('amount')}{errorText('frequency')}

        <fieldset className="item-editor-goes" data-error-key="destination" tabIndex={-1}>
          <legend>Goes to</legend>
          <div className="item-editor-chips">
            {chips.map(value => { const selected = sameDestination(value, destination.destination); return <button key={destinationKey(value)} type="button" className="item-editor-chip" aria-pressed={selected} onClick={() => chooseChip(value)}>{chipLabel(value)}</button> })}
            <button type="button" className="item-editor-chip is-other" aria-expanded={otherOpen} onClick={() => otherOpen ? setOtherOpen(false) : openOther()}>{noAccounts ? 'Add an account…' : 'Other…'}</button>
          </div>
          {otherOpen && <div className="item-editor-picker" data-error-key="destination-picker" tabIndex={-1}><DestinationPicker key={pickerSession} budget={document.budget} adults={adults} value={destination} startBrowsing onChange={value => { changeDestination(value); setOtherOpen(false) }} onKeep={() => setOtherOpen(false)} onDraftChange={() => setDestinationTouched(true)} onBrowsingChange={setDestinationBrowsing}/></div>}
          {error?.field === 'destination' && <p className="item-editor-error" role="alert">{error.message}</p>}
        </fieldset>

        <div className="item-editor-pair">
          <div className="item-editor-category">
            <label className="item-editor-field">Category<select data-error-key="category" value={categoryId} aria-invalid={error?.field === 'category'} aria-describedby={error?.field === 'category' ? `${formId}-category-error` : undefined} onChange={event => { setCategoryId(event.target.value); setError(undefined) }}><option value="">Choose a category</option>{document.budget.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="__new__">Create a category…</option></select></label>
            {categoryId === '__new__' && <label className="item-editor-field">New category<input value={newCategoryName} onChange={event => { setNewCategoryName(event.target.value); setError(undefined) }}/></label>}
            {error?.field === 'category' && <p id={`${formId}-category-error`} className="item-editor-error" role="alert">{error.message}</p>}
          </div>
          <label className="item-editor-field">Funding<select data-error-key={`${row.id}:funding`} value={row.funding} onChange={event => update({ funding: event.target.value as FundingRule })}>{fundingOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        </div>
        {errorText('funding')}
        {row.funding === 'single' && <label className="item-editor-field">Person<select data-error-key={`${row.id}:singleFunderId`} value={row.singleFunderId} aria-invalid={fieldError('singleFunderId')} aria-describedby={describedBy('singleFunderId')} onChange={event => update({ singleFunderId: event.target.value })}><option value="">Choose a person</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
        {row.funding === 'fixed' && <div className="item-editor-allocation"><strong>Fixed amounts</strong>{adults.map(person => <label key={person.id}>{person.name}<input inputMode="decimal" aria-label={`${person.name} fixed amount`} data-error-key={`${row.id}:contributions`} value={row.contributions[person.id] ?? ''} aria-invalid={fieldError('contributions')} aria-describedby={describedBy('contributions')} onChange={event => update({ contributions: { ...row.contributions, [person.id]: event.target.value } })}/></label>)}<small>{fixedTotal > monthly ? `${pounds(fixedTotal - monthly)} over` : `${pounds(monthly - fixedTotal)} unassigned`}</small></div>}
        {row.funding === 'custom' && <div className="item-editor-allocation"><strong>Relative weights</strong>{adults.map(person => <label key={person.id}>{person.name}<input inputMode="decimal" aria-label={`${person.name} relative weight`} data-error-key={`${row.id}:customShares`} value={row.customShares[person.id] ?? ''} aria-invalid={fieldError('customShares')} aria-describedby={describedBy('customShares')} onChange={event => update({ customShares: { ...row.customShares, [person.id]: event.target.value } })}/></label>)}</div>}
        {errorText('singleFunderId')}{errorText('contributions')}{errorText('customShares')}
        <p className="item-editor-split">{preview?.unresolvedItemIds.length ? 'Add employment income to work out funding.' : adults.map((person, index) => <span key={person.id}>{index > 0 && ' · '}{person.name} <span>{preview ? pounds(preview.people.find(entry => entry.personId === person.id)?.plannedPence ?? 0) : '—'}</span></span>)}</p>
      </form>
    </Sheet>
    {discarding && <ConfirmDialog title={item ? 'Discard changes to this item?' : 'Discard this item?'} confirmLabel="Discard" cancelLabel="Keep editing" danger onCancel={() => setDiscarding(false)} onConfirm={() => { const next = discarding; setDiscarding(false); if (next === 'duplicate') onDuplicate?.(); else onClose() }}><p>{discarding === 'duplicate' ? 'Your changes haven’t been saved. The copy starts from the saved item.' : 'Your changes haven’t been saved.'}</p></ConfirmDialog>}
    {removing && item && onRemove && <RemoveConfirm document={document} month={month} item={item} onCancel={() => setRemoving(false)} onConfirm={onRemove}/>}
  </>
}

function RemoveConfirm({ document, month, item, onCancel, onConfirm }: { document: BudgetDocument; month: string; item: BudgetItem; onCancel: () => void; onConfirm: () => void }) {
  const next = { ...document, budget: updateBudgetAtMonth(document.budget, month, items => items.filter(row => row.id !== item.id)) }
  return <ConfirmDialog title={`Remove ${item.name}?`} confirmLabel="Remove item" danger onCancel={onCancel} onConfirm={onConfirm} returnFocusTo={() => globalThis.document.querySelector<HTMLElement>('.budget-v3-table-wrap')}>
    <ImpactPreview label="Before removing" scopeText={`Changes apply: ${formatEditScope(budgetEditScope(document.budget, month))}.`} result={budgetImpact(document, next, month, [])} document={next}/>
  </ConfirmDialog>
}
