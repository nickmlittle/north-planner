import { useId, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetAccount, BudgetCategory, BudgetPot } from '../domain/monthlyBudget'
import { accountTypeLabel, isAccountTypeId } from '../domain/accountTypes'
import { createPotsForAccounts, planPotCreation } from '../domain/bulkPots'
import { AccountFields, type AccountFieldsValue } from './AccountFields'
import { accountOptionLabels, accountOwnerGroups, accountOwnerKey, budgetCollator } from './budgetLabels'

type Kind = 'account' | 'pot' | 'category'
type Draft = ({ kind: 'account'; id: string | null } & AccountFieldsValue)
  | { kind: 'pot'; id: string; name: string; accountId: string }
  | { kind: 'bulk-pot'; id: null; name: string; accountIds: string[] }
  | { kind: 'category'; id: string | null; name: string }
type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; onClose: () => void }
const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`

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

function Disclosure({ label, count, expanded, controls, onClick, level = 'section' }: { label: string; count?: number; expanded: boolean; controls: string; onClick: () => void; level?: 'section' | 'owner' }) {
  return <button type="button" className={`budget-manage-disclosure is-${level}`} aria-label={`${label}${count === undefined ? '' : ` ${count}`}`} aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
    <span aria-hidden="true">{expanded ? '▾' : '▸'}</span><span>{label}</span>{count !== undefined && <small> {count}</small>}
  </button>
}

export function BudgetManagement({ document, setDocument, onClose }: Props) {
  const prefix = useId()
  const [openSection, setOpenSection] = useState<Kind | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
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
  function toggleSection(kind: Kind) {
    if (!canLeave()) return
    clearDraft()
    setOpenSection(openSection === kind ? null : kind)
    setStatus('')
  }
  function toggleGroup(kind: Kind, key: string) {
    const groupId = `${kind}:${key}`
    const record = draft?.kind === 'account' ? accounts.find(account => account.id === draft.id)
      : draft?.kind === 'pot' ? accounts.find(account => account.id === pots.find(pot => pot.id === draft.id)?.accountId) : undefined
    if (expandedGroups.includes(groupId) && draftKind === kind && record && accountOwnerKey(record) === key) {
      if (!canLeave()) return
      clearDraft()
    }
    setExpandedGroups(current => current.includes(groupId) ? current.filter(value => value !== groupId) : [...current, groupId])
  }
  function begin(kind: Kind, record?: BudgetAccount | BudgetPot | BudgetCategory) {
    if (!canLeave()) return
    const next = draftFor(kind, record)
    if (draft?.kind === next.kind && draft.id === next.id) { clearDraft(); return }
    setDraft(next); setOriginal(JSON.stringify(next)); setError(''); setStatus(''); setOpenSection(kind)
  }
  function reveal(kind: Kind, account: BudgetAccount) {
    const key = `${kind}:${accountOwnerKey(account)}`
    setExpandedGroups(current => current.includes(key) ? current : [...current, key])
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
      reveal('account', account)
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
        reveal('pot', account)
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

  function row(kind: Kind, record: BudgetAccount | BudgetPot | BudgetCategory, summary: ReactNode, detail?: ReactNode) {
    const expanded = draftKind === kind && draft?.id === record.id
    return <div className="budget-manage-row" key={record.id}><button type="button" aria-label={kind === 'pot' ? `${record.name} · ${detail}` : undefined} aria-expanded={expanded} aria-controls={formId(kind, record.id)} onClick={() => begin(kind, record)}><strong><span aria-hidden="true">{expanded ? '▾' : '▸'} </span>{summary}</strong>{detail && <small> {detail}</small>}</button><div id={formId(kind, record.id)} hidden={!expanded}>{formFor(kind, record.id)}</div></div>
  }
  function ownerGroups(kind: 'account' | 'pot') {
    return groups.map(group => {
      const accountIds = new Set(group.accounts.map(account => account.id))
      const rows = kind === 'pot' ? pots.filter(pot => accountIds.has(pot.accountId)).sort((a, b) => budgetCollator.compare(a.name, b.name) || budgetCollator.compare(optionLabels.get(a.accountId) ?? '', optionLabels.get(b.accountId) ?? '') || a.id.localeCompare(b.id)) : group.accounts
      if (!rows.length) return null
      const expanded = expandedGroups.includes(`${kind}:${group.key}`)
      const controls = `${prefix}-${kind}-${group.key}`
      return <div className="budget-manage-group" key={group.key}>
        <h4><Disclosure level="owner" label={group.label} count={rows.length} expanded={expanded} controls={controls} onClick={() => toggleGroup(kind, group.key)}/></h4>
        <div id={controls} className="budget-manage-owner-content" hidden={!expanded}>{expanded && (kind === 'account'
          ? group.accounts.map(account => row('account', account, rowLabels.get(account.id), <>{countLabel(pots.filter(pot => pot.accountId === account.id).length, 'pot')}{(!account.ownerPersonIds.length || !account.provider?.trim()) && ' · Needs details'}{!account.accountTypeId && ' · Needs account type'}</>))
          : (rows as BudgetPot[]).map(pot => row('pot', pot, pot.name, optionLabels.get(pot.accountId))))}</div>
      </div>
    })
  }
  const sections: Array<{ kind: Kind; label: string; count: number }> = [{ kind: 'account', label: 'Accounts', count: accounts.length }, { kind: 'pot', label: 'Pots', count: pots.length }, { kind: 'category', label: 'Categories', count: categories.length }]
  return <div className="budget-v3-overlay"><div className="budget-v3-panel budget-manage-panel" role="dialog" aria-label="Manage accounts, pots and categories">
    <div className="budget-manage-header"><h2>Manage accounts, pots and categories</h2><button type="button" className="secondary-button" onClick={() => { if (canLeave()) onClose() }}>Done</button></div>
    <p className="budget-manage-note">Accounts, pots and categories are shared across all budget months. Changes here affect every month.</p>
    {status && <p className="budget-manage-message" role="status">{status}</p>}
    {sections.map(section => <section key={section.kind} className="budget-manage-section">
      <h3><Disclosure label={section.label} count={section.count} expanded={openSection === section.kind} controls={`${prefix}-${section.kind}`} onClick={() => toggleSection(section.kind)}/></h3>
      <div id={`${prefix}-${section.kind}`} className="budget-manage-content" hidden={openSection !== section.kind}>{openSection === section.kind && <>
        <button type="button" className="secondary-button" disabled={section.kind === 'pot' && !accounts.length} onClick={() => begin(section.kind)}>Add {section.kind}</button>{formFor(section.kind, null)}
        {!section.count && <p>{section.kind === 'pot' && !accounts.length ? 'Add an account before creating a pot.' : `No ${section.label.toLowerCase()} yet.`}</p>}
        {section.kind === 'category' ? categories.map(category => row('category', category, category.name)) : ownerGroups(section.kind)}
      </>}</div>
    </section>)}
  </div></div>
}
