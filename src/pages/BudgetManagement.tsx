import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetAccount, BudgetCategory, BudgetPot } from '../domain/monthlyBudget'
import { accountOptionLabels } from './budgetLabels'

type Kind = 'account' | 'pot' | 'category'
type Draft = { kind: 'account'; id: string | null; name: string; provider: string; ownerPersonIds: string[] }
  | { kind: 'pot'; id: string | null; name: string; accountId: string }
  | { kind: 'category'; id: string | null; name: string }
type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; onClose: () => void }

const id = () => crypto.randomUUID()
const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`

function draftFor(kind: Kind, record?: BudgetAccount | BudgetPot | BudgetCategory): Draft {
  if (kind === 'account') {
    const account = record as BudgetAccount | undefined
    return { kind, id: account?.id ?? null, name: account?.name ?? '', provider: account?.provider ?? '', ownerPersonIds: account?.ownerPersonIds ?? [] }
  }
  if (kind === 'pot') {
    const pot = record as BudgetPot | undefined
    return { kind, id: pot?.id ?? null, name: pot?.name ?? '', accountId: pot?.accountId ?? '' }
  }
  return { kind, id: record?.id ?? null, name: record?.name ?? '' }
}

export function BudgetManagement({ document, setDocument, onClose }: Props) {
  const [openSection, setOpenSection] = useState<Kind>('account')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [original, setOriginal] = useState('')
  const [message, setMessage] = useState('')
  const adults = document.household.adults
  const { accounts, pots, categories } = document.budget
  const optionLabels = accountOptionLabels(accounts, adults)
  const isDirty = !!draft && JSON.stringify(draft) !== original

  function switchTo(next: Draft | null, section?: Kind) {
    if (isDirty) { setMessage('Save or Cancel your current edits first.'); return }
    setDraft(next)
    setOriginal(next ? JSON.stringify(next) : '')
    if (section) setOpenSection(section)
    setMessage('')
  }

  function toggleSection(kind: Kind) {
    if (kind === openSection) {
      if (isDirty) { setMessage('Save or Cancel your current edits first.'); return }
      setDraft(null)
      setVisible(!visible)
      setMessage('')
    } else {
      switchTo(null, kind)
      if (!isDirty) setVisible(true)
    }
  }
  const [visible, setVisible] = useState(true)

  function begin(kind: Kind, record?: BudgetAccount | BudgetPot | BudgetCategory) {
    const next = draftFor(kind, record)
    if (draft?.kind === kind && draft.id === next.id) { switchTo(null); return }
    switchTo(next, kind)
    if (!isDirty) setVisible(true)
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    if (!name) { setMessage('Enter a name.'); return }
    if (draft.kind === 'account') {
      const provider = draft.provider.trim()
      if (!provider || !draft.ownerPersonIds.length) { setMessage('Choose an owner and enter a bank / provider.'); return }
      setDocument(current => ({ ...current, budget: { ...current.budget, accounts: draft.id
        ? current.budget.accounts.map(row => row.id === draft.id ? { ...row, name, provider, ownerPersonIds: draft.ownerPersonIds, legacyOwner: undefined } : row)
        : [...current.budget.accounts, { id: id(), name, provider, ownerPersonIds: draft.ownerPersonIds }] } }))
    } else if (draft.kind === 'pot') {
      if (!accounts.some(account => account.id === draft.accountId)) { setMessage('Choose an account for this pot.'); return }
      setDocument(current => ({ ...current, budget: { ...current.budget, pots: draft.id
        ? current.budget.pots.map(row => row.id === draft.id ? { ...row, name, accountId: draft.accountId } : row)
        : [...current.budget.pots, { id: id(), name, accountId: draft.accountId }] } }))
    } else {
      if (categories.some(category => category.id !== draft.id && category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { setMessage('A category with this name already exists.'); return }
      setDocument(current => ({ ...current, budget: { ...current.budget, categories: draft.id
        ? current.budget.categories.map(row => row.id === draft.id ? { ...row, name } : row)
        : [...current.budget.categories, { id: id(), name }] } }))
    }
    setDraft(null)
    setOriginal('')
    setMessage('Saved.')
  }

  function close() {
    if (isDirty) { setMessage('Save or Cancel your current edits first.'); return }
    onClose()
  }

  function formFor(kind: Kind, recordId: string | null) {
    if (!draft || draft.kind !== kind || draft.id !== recordId) return null
    const title = `${recordId ? 'Edit' : 'Add'} ${kind}`
    return <form className="budget-manage-form" aria-label={title} onSubmit={save}>
      {draft.kind === 'account' && <><fieldset><legend>Owners</legend>{adults.map(person => <label key={person.id}><input type="checkbox" checked={draft.ownerPersonIds.includes(person.id)} onChange={event => setDraft({ ...draft, ownerPersonIds: event.target.checked ? [...draft.ownerPersonIds, person.id] : draft.ownerPersonIds.filter(personId => personId !== person.id) })}/>{person.name}</label>)}</fieldset><label>Bank / provider<input value={draft.provider} onChange={event => setDraft({ ...draft, provider: event.target.value })}/></label></>}
      <label>{kind === 'account' ? 'Account name' : kind === 'pot' ? 'Pot name' : 'Category name'}<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
      {draft.kind === 'pot' && <><label>Parent account<select value={draft.accountId} onChange={event => setDraft({ ...draft, accountId: event.target.value })}><option value="">Choose an account</option>{accounts.map(account => <option key={account.id} value={account.id}>{optionLabels.get(account.id)}</option>)}</select></label>{recordId && draft.accountId !== pots.find(pot => pot.id === recordId)?.accountId && <p className="budget-manage-note">Changing this account updates transfer totals for budget items assigned to this pot in every month.</p>}</>}
      {message && message !== 'Saved.' && <p className="budget-manage-message" role="alert">{message}</p>}
      <div className="budget-manage-actions"><button type="button" className="secondary-button" onClick={() => { setDraft(null); setOriginal(''); setMessage('') }}>Cancel</button><button type="submit" className="primary-button">Save {kind}</button></div>
    </form>
  }

  return <div className="budget-v3-overlay"><div className="budget-v3-panel budget-manage-panel" role="dialog" aria-label="Manage accounts, pots and categories">
    <div className="budget-manage-header"><h2>Manage accounts, pots and categories</h2><button type="button" className="secondary-button" onClick={close}>Done</button></div>
    <p className="budget-manage-note">Accounts, pots and categories are shared across all budget months. Changes here affect every month.</p>
    {message === 'Saved.' && <p className="budget-manage-message" role="status">Saved.</p>}
    <section className="budget-manage-section"><h3><button type="button" aria-expanded={visible && openSection === 'account'} onClick={() => toggleSection('account')}>Accounts <span>{accounts.length}</span></button></h3>{visible && openSection === 'account' && <div className="budget-manage-content">
      <button type="button" className="secondary-button" onClick={() => begin('account')}>Add account</button>{formFor('account', null)}
      {!accounts.length && <p>No accounts yet.</p>}
      {accounts.map(account => <div className="budget-manage-row" key={account.id}><button type="button" aria-expanded={draft?.kind === 'account' && draft.id === account.id} onClick={() => begin('account', account)}><strong>{optionLabels.get(account.id)}</strong><small>{countLabel(pots.filter(pot => pot.accountId === account.id).length, 'pot')}{(!account.ownerPersonIds.length || !account.provider?.trim()) && ' · Needs details'}</small></button>{formFor('account', account.id)}</div>)}
    </div>}</section>
    <section className="budget-manage-section"><h3><button type="button" aria-expanded={visible && openSection === 'pot'} onClick={() => toggleSection('pot')}>Pots <span>{pots.length}</span></button></h3>{visible && openSection === 'pot' && <div className="budget-manage-content">
      <button type="button" className="secondary-button" disabled={!accounts.length} onClick={() => begin('pot')}>Add pot</button>{!accounts.length && <p>Add an account before creating a pot.</p>}{formFor('pot', null)}
      {!pots.length && <p>No pots yet.</p>}
      {accounts.filter(account => pots.some(pot => pot.accountId === account.id)).map(account => <div className="budget-manage-group" key={account.id}><h4>{optionLabels.get(account.id)}</h4>{pots.filter(pot => pot.accountId === account.id).map(pot => <div className="budget-manage-row" key={pot.id}><button type="button" aria-expanded={draft?.kind === 'pot' && draft.id === pot.id} onClick={() => begin('pot', pot)}><strong>{pot.name}</strong><small>{optionLabels.get(account.id)}</small></button>{formFor('pot', pot.id)}</div>)}</div>)}
    </div>}</section>
    <section className="budget-manage-section"><h3><button type="button" aria-expanded={visible && openSection === 'category'} onClick={() => toggleSection('category')}>Categories <span>{categories.length}</span></button></h3>{visible && openSection === 'category' && <div className="budget-manage-content">
      <button type="button" className="secondary-button" onClick={() => begin('category')}>Add category</button>{formFor('category', null)}
      {!categories.length && <p>No categories yet.</p>}
      {categories.map(category => <div className="budget-manage-row" key={category.id}><button type="button" aria-expanded={draft?.kind === 'category' && draft.id === category.id} onClick={() => begin('category', category)}><strong>{category.name}</strong></button>{formFor('category', category.id)}</div>)}
    </div>}</section>
  </div></div>
}
