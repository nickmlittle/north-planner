import { useEffect, useRef, useState } from 'react'
import type { BudgetAccount, BudgetDestination, BudgetPot, MonthlyBudget } from '../domain/monthlyBudget'
import { accountTypeLabel, isAccountTypeId } from '../domain/accountTypes'
import { AccountFields, type AccountFieldsValue } from './AccountFields'
import { accountOptionLabels, accountOwnerGroups, accountOwnerKey, budgetCollator } from './budgetLabels'
import type { DestinationSelection } from '../domain/budgetItemDrafts'

export type { DestinationSelection } from '../domain/budgetItemDrafts'

type Adult = { id: string; name: string }
type Step = 'owner' | 'account' | 'pot' | 'selected'
type Props = {
  budget: MonthlyBudget
  adults: Adult[]
  value: DestinationSelection
  onChange: (value: DestinationSelection) => void
  onDraftChange?: () => void
}

const newId = () => crypto.randomUUID()
const normalized = (name: string) => name.trim().toLocaleLowerCase('en-GB')

export function DestinationPicker({ budget, adults, value, onChange, onDraftChange }: Props) {
  const initialAccountId = value.destination?.kind === 'account'
    ? value.destination.accountId
    : budget.pots.find(pot => pot.id === (value.destination?.kind === 'pot' ? value.destination.potId : ''))?.accountId
  const initialAccount = budget.accounts.find(account => account.id === initialAccountId)
  const [step, setStep] = useState<Step>(value.destination ? 'selected' : 'owner')
  const [ownerKey, setOwnerKey] = useState(initialAccount ? accountOwnerKey(initialAccount) : '')
  const [accountId, setAccountId] = useState(initialAccountId ?? '')
  const [creation, setCreation] = useState<'account' | 'pot' | null>(null)
  const [accountDraft, setAccountDraft] = useState<AccountFieldsValue>({ name: '', provider: '', accountTypeId: '', ownerPersonIds: [] })
  const [potName, setPotName] = useState('')
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  useEffect(() => { if (moved.current) headingRef.current?.focus() }, [step, creation, ownerKey, accountId])
  const move = (next: Step) => { moved.current = true; setStep(next); setError('') }
  const accounts = value.stagedAccount ? [...budget.accounts, value.stagedAccount] : budget.accounts
  const pots = value.stagedPot ? [...budget.pots, value.stagedPot] : budget.pots
  const groups = accountOwnerGroups(accounts, adults)
  const group = groups.find(row => row.key === ownerKey)
  const account = accounts.find(row => row.id === accountId)
  const labels = accountOptionLabels(accounts, adults, false)
  const activePots = pots.filter(pot => pot.accountId === accountId).sort((a, b) => budgetCollator.compare(a.name, b.name) || a.id.localeCompare(b.id))
  const potTotals = new Map<string, number>()
  const potSeen = new Map<string, number>()
  activePots.forEach(pot => potTotals.set(normalized(pot.name), (potTotals.get(normalized(pot.name)) ?? 0) + 1))
  const potLabel = (pot: BudgetPot) => {
    const key = normalized(pot.name)
    const number = (potSeen.get(key) ?? 0) + 1
    potSeen.set(key, number)
    return potTotals.get(key)! > 1 ? `${pot.name} (Pot ${number})` : pot.name
  }
  const namedPots = activePots.map(pot => ({ pot, label: potLabel(pot) }))
  const selectedPotId = value.destination?.kind === 'pot' ? value.destination.potId : undefined
  const selectedPot = pots.find(pot => pot.id === selectedPotId)
  const selectedPotLabel = namedPots.find(row => row.pot.id === selectedPot?.id)?.label ?? selectedPot?.name
  const ownerLabel = group?.label ?? (account ? (accountOwnerKey(account) === 'joint' ? 'Joint' : adults.find(person => `person:${person.id}` === accountOwnerKey(account))?.name ?? 'Needs owner') : '')

  const chooseOwner = (key: string) => {
    setOwnerKey(key); setAccountId(''); setCreation(null); onChange({}); move('account')
  }
  const chooseAccount = (id: string) => {
    setAccountId(id); setCreation(null)
    onChange(value.stagedAccount?.id === id ? { stagedAccount: value.stagedAccount } : {})
    move('pot')
  }
  const selectDestination = (destination: BudgetDestination) => {
    onChange({ destination, ...(value.stagedAccount?.id === accountId ? { stagedAccount: value.stagedAccount } : {}), ...(value.stagedPot?.id === (destination.kind === 'pot' ? destination.potId : '') ? { stagedPot: value.stagedPot } : {}) })
    setCreation(null); move('selected')
  }
  const startAccount = () => {
    setAccountDraft({ name: '', provider: '', accountTypeId: '', ownerPersonIds: ownerKey === 'joint' ? adults.map(person => person.id) : ownerKey.startsWith('person:') ? [ownerKey.slice(7)] : [] })
    setCreation('account'); setError(''); moved.current = true
  }
  const continueAccount = () => {
    if (!accountDraft.ownerPersonIds.length || !accountDraft.provider.trim() || !isAccountTypeId(accountDraft.accountTypeId)) {
      setError('Choose at least one owner and an account type, and enter a bank / provider.'); return
    }
    const stagedAccount: BudgetAccount = {
      id: newId(), name: accountDraft.name.trim() || accountTypeLabel(accountDraft.accountTypeId),
      provider: accountDraft.provider.trim(), ownerPersonIds: accountDraft.ownerPersonIds,
      accountTypeId: accountDraft.accountTypeId,
    }
    onChange({ stagedAccount }); setAccountId(stagedAccount.id); setOwnerKey(accountOwnerKey(stagedAccount)); setCreation(null); move('pot')
  }
  const duplicate = activePots.find(pot => normalized(pot.name) === normalized(potName) && potName.trim())
  const useNewPot = () => {
    if (!potName.trim()) { setError('Enter a pot name.'); return }
    if (duplicate) { setError('This pot already exists in this account. Select it above.'); return }
    const stagedPot: BudgetPot = { id: newId(), name: potName.trim(), accountId }
    onChange({ destination: { kind: 'pot', potId: stagedPot.id }, stagedPot, ...(value.stagedAccount?.id === accountId ? { stagedAccount: value.stagedAccount } : {}) })
    setCreation(null); move('selected')
  }

  const ownerChoices = [
    ...(adults.length >= 2 ? [{ key: 'joint', label: 'Joint' }] : []),
    ...adults.map(person => ({ key: `person:${person.id}`, label: person.name })),
    ...(groups.some(row => row.key === 'unassigned') ? [{ key: 'unassigned', label: 'Needs owner' }] : []),
  ]

  return <section className="destination-picker" aria-label="Destination" onChangeCapture={onDraftChange}>
    <h3 ref={headingRef} tabIndex={-1}>{step === 'selected' ? 'Selected destination' : step === 'owner' ? 'Choose an owner' : step === 'account' ? 'Choose an account' : 'Choose an account or pot'}</h3>
    {step === 'selected' ? <div className="destination-picked"><strong>{ownerLabel} · {account ? labels.get(account.id) : 'Account'}{selectedPotLabel ? ` · ${selectedPotLabel}` : ' · Account directly'}</strong><button type="button" className="secondary-button" onClick={() => move('pot')}>Change</button></div> : <>
      {step !== 'owner' && <nav className="destination-crumbs" aria-label="Destination path"><button type="button" onClick={() => { onChange({}); setAccountId(''); setCreation(null); move('owner') }}>Owners</button><span aria-hidden="true">›</span>{step === 'account' ? <strong>{ownerLabel}</strong> : <><button type="button" onClick={() => { onChange({}); setAccountId(''); setCreation(null); move('account') }}>{ownerLabel}</button><span aria-hidden="true">›</span><strong>{account ? labels.get(account.id) : 'Account'}</strong></>}</nav>}
      {step === 'owner' && <div className="destination-bubbles">{ownerChoices.map(choice => <button type="button" className="destination-bubble" key={choice.key} onClick={() => chooseOwner(choice.key)}>{choice.label}</button>)}</div>}
      {step === 'account' && <>{!group?.accounts.length && <p>No accounts for this owner yet.</p>}<div className="destination-bubbles">{group?.accounts.map(row => <button type="button" className="destination-bubble" key={row.id} onClick={() => chooseAccount(row.id)}>{labels.get(row.id)}</button>)}</div>{creation === 'account' ? <div className="destination-create"><AccountFields adults={adults} value={accountDraft} onChange={setAccountDraft}/>{error && <p role="alert">{error}</p>}<div className="destination-create-actions"><button type="button" className="secondary-button" onClick={() => { setCreation(null); setError('') }}>Cancel</button><button type="button" className="primary-button" onClick={continueAccount}>Continue</button></div></div> : <button type="button" className="destination-bubble destination-add" onClick={startAccount}>+ Add account</button>}</>}
      {step === 'pot' && <><div className="destination-bubbles"><button type="button" className="destination-bubble destination-direct" onClick={() => selectDestination({ kind: 'account', accountId })}>Use account directly</button>{namedPots.map(({ pot, label }) => <button type="button" className="destination-bubble" key={pot.id} onClick={() => selectDestination({ kind: 'pot', potId: pot.id })}>{label}</button>)}</div>{!activePots.length && <p>No pots in this account yet.</p>}{creation === 'pot' ? <div className="destination-create"><label>Pot name<input value={potName} onChange={event => { setPotName(event.target.value); setError('') }}/></label>{duplicate && <p className="destination-duplicate">Already exists in this account. Select the existing pot above.</p>}{error && <p role="alert">{error}</p>}<div className="destination-create-actions"><button type="button" className="secondary-button" onClick={() => { setCreation(null); setPotName(''); setError('') }}>Cancel</button><button type="button" className="primary-button" disabled={!potName.trim() || !!duplicate} onClick={useNewPot}>Use new pot</button></div></div> : <button type="button" className="destination-bubble destination-add" onClick={() => { setPotName(''); setCreation('pot'); moved.current = true }}>+ Add pot</button>}</>}
    </>}
  </section>
}
