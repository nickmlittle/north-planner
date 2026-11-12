import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Landmark, Plus } from 'lucide-react'
import { EmptyState, ListRow, Sheet, StatusChip } from '../../components/ui'
import type { BudgetDocument } from '../../domain/budgetDocument'
import type { BudgetAccount, BudgetPot } from '../../domain/monthlyBudget'
import { accountTypeLabel, isAccountTypeId } from '../../domain/accountTypes'
import { createPotsForAccounts, planPotCreation } from '../../domain/bulkPots'
import { potSettings, savePotSettings } from '../../domain/cardSpending'
import { potBalance } from '../../domain/potBalances'
import { cardTracker } from '../../domain/cardTracker'
import { formatGBP } from '../../formatting/money'
import { AccountFields, type AccountFieldsValue } from '../AccountFields'
import { BudgetOptionsMenu } from '../BudgetOptionsMenu'
import { accountOptionLabels, accountOwnerGroups, accountOwnerLabel, budgetCollator, shortAccountLabels } from '../budgetLabels'
import { statementName } from '../spendingFormat'
import './settings.css'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; notify: (message: string) => void }
type Editing = { kind: 'account'; account?: BudgetAccount } | { kind: 'pot'; pot: BudgetPot } | { kind: 'add-pot' }
const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`

/** Owners, provider, type and nickname. Owner, provider and type are required. */
function AccountForm({ document, account, formId, onSave }: { document: BudgetDocument; account?: BudgetAccount; formId: string; onSave: (account: BudgetAccount) => void }) {
  const type = accountTypeLabel(account?.accountTypeId)
  const [value, setValue] = useState<AccountFieldsValue>({ name: type && account?.name === type ? '' : account?.name ?? '', provider: account?.provider ?? '', ownerPersonIds: account?.ownerPersonIds ?? [], accountTypeId: account?.accountTypeId ?? '' })
  const [error, setError] = useState('')
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!value.ownerPersonIds.length || !value.provider.trim() || !isAccountTypeId(value.accountTypeId)) { setError('Choose an owner and account type, and enter a bank / provider.'); return }
    onSave({ id: account?.id ?? crypto.randomUUID(), name: value.name.trim() || accountTypeLabel(value.accountTypeId), provider: value.provider.trim(), ownerPersonIds: value.ownerPersonIds, accountTypeId: value.accountTypeId })
  }
  return <form id={formId} className="settings-form" aria-label={account ? 'Edit account' : 'Add account'} onSubmit={save} noValidate>
    <AccountFields value={value} adults={document.household.adults} onChange={next => { setValue(next); setError('') }}/>
    {error && <p className="input-error" role="alert">{error}</p>}
  </form>
}

/** A pot's name, account and spending settings (carries over, pace, build-up). */
function PotForm({ document, pot, formId, onSave }: { document: BudgetDocument; pot: BudgetPot; formId: string; onSave: (next: { name: string; accountId: string; carriesOver: boolean; pace: boolean; buildUpLimit: number }) => void }) {
  const settings = potSettings(document, pot.id)
  const [name, setName] = useState(pot.name)
  const [accountId, setAccountId] = useState(pot.accountId)
  const [carriesOver, setCarriesOver] = useState(settings.carriesOver)
  const [pace, setPace] = useState(settings.pace === 'steady')
  const [buildUpLimit, setBuildUpLimit] = useState(String(settings.buildUpLimit))
  const [error, setError] = useState('')
  const { accounts } = document.budget
  const optionLabels = accountOptionLabels(accounts, document.household.adults)
  const groups = accountOwnerGroups(accounts, document.household.adults)
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) { setError('Enter a name.'); return }
    if (!accounts.some(account => account.id === accountId)) { setError('Choose an account for this pot.'); return }
    // Carry-over pots aren't flagged for building up, so their limit isn't asked for.
    const typed = Number(buildUpLimit)
    if (!carriesOver && (!buildUpLimit.trim() || !Number.isFinite(typed) || typed <= 0)) { setError('Enter how many months’ worth can build up, like 2.'); return }
    onSave({ name: name.trim(), accountId, carriesOver, pace, buildUpLimit: carriesOver ? settings.buildUpLimit : typed })
  }
  return <form id={formId} className="settings-form" aria-label="Edit pot" onSubmit={save} noValidate>
    <label>Pot name<input data-autofocus value={name} onChange={event => setName(event.target.value)}/></label>
    <label>Parent account<select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Choose an account</option>{groups.flatMap(group => group.accounts).map(account => <option key={account.id} value={account.id}>{optionLabels.get(account.id)}</option>)}</select></label>
    {accountId !== pot.accountId && <p className="settings-form-note">Updates funding for this pot’s items in every month.</p>}
    <fieldset className="settings-form-group"><legend>Spending</legend>
      <label className="settings-form-check"><input type="checkbox" checked={carriesOver} onChange={event => { setCarriesOver(event.target.checked); if (event.target.checked) setPace(false) }}/>Carries over from month to month</label>
      <label className="settings-form-check"><input type="checkbox" checked={pace} disabled={carriesOver} onChange={event => setPace(event.target.checked)}/>Show pace (for steady spending like groceries)</label>
      {!carriesOver && <label>Flag a build-up over (months’ worth)<input inputMode="decimal" value={buildUpLimit} onChange={event => setBuildUpLimit(event.target.value)}/></label>}
    </fieldset>
    {error && <p className="input-error" role="alert">{error}</p>}
  </form>
}

/** Add a pot to one or several accounts at once; an account that already has it is skipped. */
function AddPotForm({ document, formId, onSave, onPlanChange }: { document: BudgetDocument; formId: string; onSave: (name: string, accountIds: string[]) => void; onPlanChange: (creates: number) => void }) {
  const [name, setName] = useState('')
  const [accountIds, setAccountIds] = useState<string[]>([])
  const { accounts } = document.budget
  const adults = document.household.adults
  const rowLabels = accountOptionLabels(accounts, adults, false)
  const groups = accountOwnerGroups(accounts, adults)
  const preview = planPotCreation(document.budget, name, accountIds)
  const update = (nextName: string, nextIds: string[]) => { setName(nextName); setAccountIds(nextIds); onPlanChange(nextName.trim() ? planPotCreation(document.budget, nextName, nextIds).create.length : 0) }
  return <form id={formId} className="settings-form" aria-label="Add pot" onSubmit={event => { event.preventDefault(); if (name.trim() && preview.create.length) onSave(name, accountIds) }}>
    <label>Pot name<input data-autofocus value={name} onChange={event => update(event.target.value, accountIds)}/></label>
    <button type="button" className="text-button settings-form-link" onClick={() => update(name, accountIds.length === accounts.length ? [] : accounts.map(account => account.id))}>{accountIds.length === accounts.length ? 'Clear all accounts' : 'Select all accounts'}</button>
    {groups.map(group => {
      const allSelected = group.accounts.every(account => accountIds.includes(account.id))
      return <fieldset key={group.key} className="settings-form-group"><legend>{group.label}</legend>
        <button type="button" className="text-button settings-form-link" onClick={() => update(name, allSelected ? accountIds.filter(id => !group.accounts.some(account => account.id === id)) : [...new Set([...accountIds, ...group.accounts.map(account => account.id)])])}>{allSelected ? 'Clear all' : 'Select all'} {group.label} accounts</button>
        {group.accounts.map(account => <label key={account.id} className="settings-form-check"><input type="checkbox" checked={accountIds.includes(account.id)} onChange={event => update(name, event.target.checked ? [...accountIds, account.id] : accountIds.filter(id => id !== account.id))}/><span>{rowLabels.get(account.id)}{name.trim() && preview.skip.some(row => row.id === account.id) && <small> Already exists — will be skipped</small>}</span></label>)}
      </fieldset>
    })}
    {name.trim() && accountIds.length > 0 && !preview.create.length && <p className="settings-form-note">All selected accounts already have this pot.</p>}
    {!accountIds.length && <p className="settings-form-note">Select at least one account.</p>}
  </form>
}

/**
 * Settings › Accounts & pots: one list, ordered by owner (Joint, then each adult, then any needing an owner), with
 * each account's pots under it and their spending settings in words. Editors open in a Sheet.
 */
export function AccountsAndPots({ document, setDocument, notify }: Props) {
  const formId = useId()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [creates, setCreates] = useState(0)
  const adults = document.household.adults
  const { accounts, pots } = document.budget
  const names = shortAccountLabels(accounts, adults)
  const ordered = accountOwnerGroups(accounts, adults).flatMap(group => group.accounts)
  const tracker = cardTracker(document)
  const potsOf = (accountId: string) => pots.filter(pot => pot.accountId === accountId).sort((a, b) => budgetCollator.compare(a.name, b.name))

  const potMeta = (pot: BudgetPot) => {
    const card = tracker.cards.find(row => row.setAside?.potId === pot.id)
    if (card) return `Set-aside pot · pays ${card.name} from the ${statementName(card.setAside!.fromCloseDate)}`
    const settings = potSettings(document, pot.id)
    if (settings.carriesOver) return 'Carries over'
    return ['Monthly', settings.pace === 'steady' ? 'shows pace' : '', `flags over ${settings.buildUpLimit} months’ worth`].filter(Boolean).join(' · ')
  }
  const potTrailing = (pot: BudgetPot) => {
    const balance = potBalance(document, pot.id).balancePence
    const account = accounts.find(row => row.id === pot.accountId)
    return balance === undefined ? undefined : `${formatGBP(balance / 100)}${account?.provider ? ` in ${account.provider}` : ''}`
  }
  const accountMeta = (account: BudgetAccount) => [account.provider?.trim(), accountTypeLabel(account.accountTypeId), account.ownerPersonIds.length ? accountOwnerLabel(account, adults) : ''].filter(Boolean).join(' · ')

  const close = () => { setEditing(null); setCreates(0) }
  const sheetTitle = !editing ? '' : editing.kind === 'account' ? editing.account ? `Edit ${names.get(editing.account.id)}` : 'Add account' : editing.kind === 'pot' ? `Edit ${editing.pot.name}` : 'Add pot'
  const submitLabel = !editing ? '' : editing.kind === 'add-pot' ? `Create ${countLabel(creates, 'pot')}` : editing.kind === 'account' ? editing.account ? 'Save account' : 'Add account' : 'Save pot'

  return <div className="settings-accounts">
    <div className="settings-toolbar">
      <p className="settings-lead">Shared by every month.</p>
      <div className="settings-toolbar-actions">
        <button type="button" className="secondary-button" onClick={() => setEditing({ kind: 'account' })}><Plus aria-hidden="true"/>Add account</button>
        <button type="button" className="secondary-button" disabled={!accounts.length} onClick={() => setEditing({ kind: 'add-pot' })}><Plus aria-hidden="true"/>Add pot</button>
      </div>
    </div>
    {!accounts.length ? <EmptyState title="No accounts yet" action={<button type="button" className="primary-button" onClick={() => setEditing({ kind: 'account' })}>Add account</button>}>Add the accounts your money moves between. Pots sit inside them.</EmptyState>
      : <ul className="settings-list" aria-label="Accounts and pots">{ordered.flatMap(account => [
        <li key={account.id}>
          <ListRow icon={<Landmark/>} title={names.get(account.id)} meta={<>{accountMeta(account)}{!account.ownerPersonIds.length && <> <StatusChip tone="warning">Needs owner</StatusChip></>}</>}
            trailing={<span className="settings-row-end"><span className="settings-row-note">{countLabel(potsOf(account.id).length, 'pot')}</span><BudgetOptionsMenu row label={`More actions for ${names.get(account.id)}`} options={[{ label: 'Edit', onSelect: () => setEditing({ kind: 'account', account }) }]}/></span>}/>
        </li>,
        ...potsOf(account.id).map(pot => <li key={pot.id} className="settings-pot-row">
          <ListRow title={pot.name} meta={potMeta(pot)} trailing={<span className="settings-row-end">{potTrailing(pot) && <span className="settings-row-note">{potTrailing(pot)}</span>}<BudgetOptionsMenu row label={`More actions for ${pot.name} · ${names.get(account.id)}`} options={[{ label: 'Edit', onSelect: () => setEditing({ kind: 'pot', pot }) }]}/></span>}/>
        </li>),
      ])}</ul>}
    {editing && <Sheet title={sheetTitle} onClose={close} footer={<>
      <button type="button" className="secondary-button" onClick={close}>Cancel</button>
      <button type="submit" form={formId} className="primary-button" disabled={editing.kind === 'add-pot' && !creates}>{submitLabel}</button>
    </>}>
      {editing.kind === 'account' ? <AccountForm document={document} account={editing.account} formId={formId} onSave={account => {
        setDocument(current => ({ ...current, budget: { ...current.budget, accounts: editing.account
          ? current.budget.accounts.map(row => row.id === account.id ? { ...row, ...account, legacyOwner: undefined } : row)
          : [...current.budget.accounts, account] } }))
        close(); notify(editing.account ? 'Account saved.' : 'Account added.')
      }}/>
        : editing.kind === 'pot' ? <PotForm document={document} pot={editing.pot} formId={formId} onSave={next => {
          setDocument(current => savePotSettings({ ...current, budget: { ...current.budget, pots: current.budget.pots.map(row => row.id === editing.pot.id ? { ...row, name: next.name, accountId: next.accountId } : row) } }, editing.pot.id, { carriesOver: next.carriesOver, pace: next.pace ? 'steady' : 'none', buildUpLimit: next.buildUpLimit }))
          close(); notify('Pot saved.')
        }}/>
        : <AddPotForm document={document} formId={formId} onPlanChange={setCreates} onSave={(name, accountIds) => {
          const preview = planPotCreation(document.budget, name, accountIds)
          const newIds = new Map(accountIds.map(accountId => [accountId, crypto.randomUUID()]))
          setDocument(current => { const budget = createPotsForAccounts(current.budget, name, accountIds, newIds); return budget === current.budget ? current : { ...current, budget } })
          close(); notify(`Created ${countLabel(preview.create.length, 'pot')}.${preview.skip.length ? ` Skipped ${preview.skip.length} existing ${preview.skip.length === 1 ? 'pot' : 'pots'}.` : ''}`)
        }}/>}
    </Sheet>}
  </div>
}
