import { useId, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetAccount, BudgetCategory, BudgetPot } from '../domain/monthlyBudget'
import { accountTypeLabel, isAccountTypeId } from '../domain/accountTypes'
import { createPotsForAccounts, planPotCreation } from '../domain/bulkPots'
import { AccountFields, type AccountFieldsValue } from './AccountFields'
import { accountOptionLabels, accountOwnerGroups, accountOwnerLabel, sortPotsForManage } from './budgetLabels'

type Kind = 'account' | 'pot' | 'category'
type Draft = ({ kind: 'account'; id: string | null } & AccountFieldsValue)
  | { kind: 'pot'; id: string; name: string; accountId: string }
  | { kind: 'bulk-pot'; id: null; name: string; accountIds: string[] }
  | { kind: 'category'; id: string | null; name: string }
type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; onClose: () => void }
const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`
const tabs: Array<{ kind: Kind; label: string; count: (document: BudgetDocument) => number }> = [
  { kind: 'account', label: 'Accounts', count: document => document.budget.accounts.length },
  { kind: 'pot', label: 'Pots', count: document => document.budget.pots.length },
  { kind: 'category', label: 'Categories', count: document => document.budget.categories.length },
]

function draftFor(kind: Kind, record?: BudgetAccount | BudgetPot | BudgetCategory): Draft {
  if (kind === 'account') {
    const account = record as BudgetAccount | undefined
    const type = accountTypeLabel(account?.accountTypeId)
    return { kind, id: account?.id ?? null, name: type && account?.name === type ? '' : account?.name ?? '', provider: account?.provider ?? '', ownerPersonIds: account?.ownerPersonIds ?? [], accountTypeId: account?.accountTypeId ?? '' }
  }
  if (kind === 'pot') {
    const pot = record as BudgetPot | undefined
    return pot ? { kind, id: pot.id, name: pot.name, accountId: pot.accountId } : { kind: 'bulk-pot', id: null, name: '', accountIds: [] }
  }
  return { kind, id: record?.id ?? null, name: record?.name ?? '' }
}

export function BudgetManagement({ document, setDocument, onClose }: Props) {
  const prefix = useId()
  const [tab, setTab] = useState<Kind>('account')
  const tabRefs = useRef<Partial<Record<Kind, HTMLButtonElement | null>>>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const adults = document.household.adults
  const { accounts, pots, categories } = document.budget
  const optionLabels = accountOptionLabels(accounts, adults)
  const rowLabels = accountOptionLabels(accounts, adults, false)
  const groups = accountOwnerGroups(accounts, adults)
  const isDirty = !!draft && JSON.stringify(draft) !== original
  const draftKind = draft?.kind === 'bulk-pot' ? 'pot' : draft?.kind
  const formId = (kind: string, recordId: string | null) => `${prefix}-${kind}-${recordId ?? 'new'}`

  function canLeave() {
    if (isDirty) { setError('Save or Cancel your current edits first.'); return false }
    return true
  }
  function clearDraft() { setDraft(null); setOriginal(''); setError('') }
  function selectTab(kind: Kind) {
    if (kind === tab) return true
    if (!canLeave()) return false
    clearDraft(); setTab(kind); setStatus('')
    return true
  }
  function onTabKey(event: KeyboardEvent) {
    const kinds = tabs.map(item => item.kind)
    const index = kinds.indexOf(tab)
    const next = { ArrowRight: kinds[(index + 1) % kinds.length], ArrowLeft: kinds[(index + kinds.length - 1) % kinds.length], Home: kinds[0], End: kinds[kinds.length - 1] }[event.key]
    if (!next) return
    event.preventDefault()
    if (selectTab(next)) tabRefs.current[next]?.focus()
  }
  function begin(kind: Kind, record?: BudgetAccount | BudgetPot | BudgetCategory) {
    if (!canLeave()) return
    const next = draftFor(kind, record)
    if (draft?.kind === next.kind && draft.id === next.id) { clearDraft(); return }
    setDraft(next); setOriginal(JSON.stringify(next)); setError(''); setStatus(''); setTab(kind)
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setError('')
    if (draft.kind === 'account') {
      if (!draft.ownerPersonIds.length || !draft.provider.trim() || !isAccountTypeId(draft.accountTypeId)) {
        setError('Choose an owner and account type, and enter a bank / provider.'); return
      }
      const account: BudgetAccount = { id: draft.id ?? crypto.randomUUID(), name: draft.name.trim() || accountTypeLabel(draft.accountTypeId), provider: draft.provider.trim(), ownerPersonIds: draft.ownerPersonIds, accountTypeId: draft.accountTypeId }
      setDocument(current => ({ ...current, budget: { ...current.budget, accounts: draft.id
        ? current.budget.accounts.map(row => row.id === draft.id ? { ...row, ...account, legacyOwner: undefined } : row)
        : [...current.budget.accounts, account] } }))
    } else if (draft.kind === 'bulk-pot') {
      const preview = planPotCreation(document.budget, draft.name, draft.accountIds)
      if (!draft.name.trim() || !preview.create.length) return
      const newIds = new Map(draft.accountIds.map(accountId => [accountId, crypto.randomUUID()]))
      setDocument(current => {
        const budget = createPotsForAccounts(current.budget, draft.name, draft.accountIds, newIds)
        return budget === current.budget ? current : { ...current, budget }
      })
      clearDraft()
      setStatus(`Created ${countLabel(preview.create.length, 'pot')}. Skipped ${preview.skip.length} existing ${preview.skip.length === 1 ? 'pot' : 'pots'}.`)
      return
    } else {
      const name = draft.name.trim()
      if (!name) { setError('Enter a name.'); return }
      if (draft.kind === 'pot') {
        const account = accounts.find(account => account.id === draft.accountId)
        if (!account) { setError('Choose an account for this pot.'); return }
        setDocument(current => ({ ...current, budget: { ...current.budget, pots: current.budget.pots.map(row => row.id === draft.id ? { ...row, name, accountId: draft.accountId } : row) } }))
      } else {
        if (categories.some(category => category.id !== draft.id && category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { setError('A category with this name already exists.'); return }
        const category = { id: draft.id ?? crypto.randomUUID(), name }
        setDocument(current => ({ ...current, budget: { ...current.budget, categories: draft.id ? current.budget.categories.map(row => row.id === draft.id ? { ...row, name } : row) : [...current.budget.categories, category] } }))
      }
    }
    clearDraft(); setStatus('Saved.')
  }

  function formFor(kind: Kind, recordId: string | null) {
    if (!draft || draftKind !== kind || draft.id !== recordId) return null
    const preview = draft.kind === 'bulk-pot' ? planPotCreation(document.budget, draft.name, draft.accountIds) : null
    return <form className="budget-manage-form" aria-label={`${recordId ? 'Edit' : 'Add'} ${kind}`} onSubmit={save}>
      {draft.kind === 'account' ? <AccountFields value={draft} adults={adults} onChange={value => setDraft({ ...draft, ...value })}/>
        : <label>{kind === 'pot' ? 'Pot name' : 'Category name'}<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>}
      {draft.kind === 'pot' && <><label>Parent account<select value={draft.accountId} onChange={event => setDraft({ ...draft, accountId: event.target.value })}><option value="">Choose an account</option>{groups.flatMap(group => group.accounts).map(account => <option key={account.id} value={account.id}>{optionLabels.get(account.id)}</option>)}</select></label>{draft.accountId !== pots.find(pot => pot.id === recordId)?.accountId && <p className="budget-manage-note">Changing this account updates transfer totals for budget items assigned to this pot in every month.</p>}</>}
      {draft.kind === 'bulk-pot' && preview && <>
        <p className="budget-manage-note">Choose accounts. Each new pot will be independent.</p>
        <button type="button" className="text-button" onClick={() => setDraft({ ...draft, accountIds: draft.accountIds.length === accounts.length ? [] : accounts.map(account => account.id) })}>{draft.accountIds.length === accounts.length ? 'Clear all accounts' : 'Select all accounts'}</button>
        {groups.map(group => {
          const allSelected = group.accounts.every(account => draft.accountIds.includes(account.id))
          return <fieldset key={group.key} className="budget-pot-account-picker"><legend>{group.label}</legend>
            <button type="button" className="text-button" onClick={() => setDraft({ ...draft, accountIds: allSelected ? draft.accountIds.filter(id => !group.accounts.some(account => account.id === id)) : [...new Set([...draft.accountIds, ...group.accounts.map(account => account.id)])] })}>{allSelected ? 'Clear all' : 'Select all'} {group.label} accounts</button>
            {group.accounts.map(account => <label key={account.id}><input type="checkbox" checked={draft.accountIds.includes(account.id)} onChange={event => setDraft({ ...draft, accountIds: event.target.checked ? [...draft.accountIds, account.id] : draft.accountIds.filter(id => id !== account.id) })}/><span>{rowLabels.get(account.id)}{draft.name.trim() && preview.skip.some(row => row.id === account.id) && <small>Already exists — will be skipped</small>}</span></label>)}
          </fieldset>
        })}
        <p className="budget-manage-note" role="status">Create {countLabel(preview.create.length, 'pot')}; skip {preview.skip.length} existing.</p>
        {draft.name.trim() && draft.accountIds.length > 0 && !preview.create.length && <p className="budget-manage-note">All selected accounts already have this pot.</p>}
        {!draft.accountIds.length && <p className="budget-manage-note">Select at least one account.</p>}
      </>}
      {error && <p className="budget-manage-message" role="alert">{error}</p>}
      <div className="budget-manage-actions"><button type="button" className="secondary-button" onClick={clearDraft}>Cancel</button><button type="submit" className="primary-button" disabled={draft.kind === 'bulk-pot' && (!draft.name.trim() || !preview?.create.length)}>{draft.kind === 'bulk-pot' ? `Create ${countLabel(preview?.create.length ?? 0, 'pot')}` : `Save ${kind}`}</button></div>
    </form>
  }

  function ownerChip(account: BudgetAccount | undefined) {
    const label = account ? accountOwnerLabel(account, adults) : 'Needs owner'
    return <span className={`budget-manage-chip${label === 'Needs owner' ? ' is-review' : ''}`}>{label}</span>
  }
  function row(kind: Kind, record: BudgetAccount | BudgetPot | BudgetCategory, summary: ReactNode, { owner, detail, label }: { owner?: BudgetAccount; detail?: ReactNode; label?: string } = {}) {
    const expanded = draftKind === kind && draft?.id === record.id
    const Chevron = expanded ? ChevronDown : ChevronRight
    return <div className="budget-manage-row" key={record.id}>
      <button type="button" aria-label={label} aria-expanded={expanded} aria-controls={formId(kind, record.id)} onClick={() => begin(kind, record)}>
        <Chevron className="budget-manage-chevron" aria-hidden="true"/>
        <span className="budget-manage-row-text"><span className="budget-manage-row-title"><strong>{summary}</strong>{owner && <>{' '}{ownerChip(owner)}</>}</span>{detail && <small>{' '}{detail}</small>}</span>
      </button>
      <div id={formId(kind, record.id)} hidden={!expanded}>{formFor(kind, record.id)}</div>
    </div>
  }
  function rows(kind: Kind) {
    if (kind === 'category') return categories.map(category => row('category', category, category.name))
    if (kind === 'account') return groups.flatMap(group => group.accounts).map(account => row('account', account, rowLabels.get(account.id), { owner: account,
      detail: <>{countLabel(pots.filter(pot => pot.accountId === account.id).length, 'pot')}{(!account.ownerPersonIds.length || !account.provider?.trim()) && ' · Needs details'}{!account.accountTypeId && ' · Needs account type'}</> }))
    return sortPotsForManage(pots, accounts, adults).map(pot => row('pot', pot, pot.name, { owner: accounts.find(account => account.id === pot.accountId), detail: rowLabels.get(pot.accountId), label: `${pot.name} · ${optionLabels.get(pot.accountId)}` }))
  }
  const tabId = (kind: Kind) => `${prefix}-tab-${kind}`
  const panelId = `${prefix}-panel`
  const active = tabs.find(item => item.kind === tab)!
  const close = () => { if (canLeave()) onClose() }
  return <div className="budget-v3-overlay"><div className="budget-v3-panel budget-manage-panel" role="dialog" aria-label="Manage accounts, pots & categories">
    <div className="budget-manage-header">
      <div className="budget-manage-titlebar"><h2>Manage accounts, pots &amp; categories</h2><button type="button" className="secondary-button" onClick={close}>Done</button><button type="button" className="budget-manage-close" aria-label="Close" onClick={close}><X aria-hidden="true"/></button></div>
      <div className="budget-manage-tabs" role="tablist" aria-label="Manage" onKeyDown={onTabKey}>{tabs.map(item => <button type="button" role="tab" key={item.kind} id={tabId(item.kind)} ref={element => { tabRefs.current[item.kind] = element }} aria-selected={tab === item.kind} aria-controls={panelId} tabIndex={tab === item.kind ? 0 : -1} onClick={() => selectTab(item.kind)}>
        <span>{item.label}</span>{' '}<small>{item.count(document)}</small>
      </button>)}</div>
    </div>
    <p className="budget-manage-note">Accounts, pots and categories are shared across all budget months. Changes here affect every month.</p>
    {status && <p className="budget-manage-message" role="status">{status}</p>}
    <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className="budget-manage-content">
      <button type="button" className="secondary-button" disabled={tab === 'pot' && !accounts.length} onClick={() => begin(tab)}>Add {tab}</button>{formFor(tab, null)}
      {!active.count(document) && <p>{tab === 'pot' && !accounts.length ? 'Add an account before creating a pot.' : `No ${active.label.toLowerCase()} yet.`}</p>}
      {rows(tab)}
    </div>
  </div></div>
}
