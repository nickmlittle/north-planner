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
  /** True while a saved destination is being changed but no replacement is confirmed yet. */
  onBrowsingChange?: (browsing: boolean) => void
}

const newId = () => crypto.randomUUID()
const normalized = (name: string) => name.trim().toLocaleLowerCase('en-GB')

export function DestinationPicker({ budget, adults, value, onChange, onDraftChange, onBrowsingChange }: Props) {
  // The saved selection (`value`) is only replaced when a new destination is confirmed.
  // Browsing owners/accounts, or staging a new account, is local until then.
  const [draftAccount, setDraftAccount] = useState<BudgetAccount | undefined>(value.stagedAccount)
  const accounts = [...budget.accounts, ...[value.stagedAccount, draftAccount].filter((row, index, list): row is BudgetAccount => !!row && list.findIndex(other => other?.id === row.id) === index)]
  const pots = value.stagedPot ? [...budget.pots, value.stagedPot] : budget.pots
  const currentPotId = value.destination?.kind === 'pot' ? value.destination.potId : undefined
  const currentAccountId = value.destination?.kind === 'account' ? value.destination.accountId : pots.find(pot => pot.id === currentPotId)?.accountId
  const currentAccount = accounts.find(row => row.id === currentAccountId)
  const currentOwnerKey = currentAccount ? accountOwnerKey(currentAccount) : ''
  const [step, setStep] = useState<Step>(value.destination ? 'selected' : 'owner')
  const [ownerKey, setOwnerKey] = useState(currentOwnerKey)
  const [accountId, setAccountId] = useState(currentAccountId ?? '')
  const [creation, setCreation] = useState<'account' | 'pot' | null>(null)
  const [accountDraft, setAccountDraft] = useState<AccountFieldsValue>({ name: '', provider: '', accountTypeId: '', ownerPersonIds: [] })
  const [potName, setPotName] = useState('')
  const [error, setError] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  useEffect(() => { if (moved.current) headingRef.current?.focus() }, [step, creation, ownerKey, accountId])
  const browsing = !!value.destination && step !== 'selected'
  useEffect(() => { onBrowsingChange?.(browsing) }, [browsing, onBrowsingChange])
  const move = (next: Step) => { moved.current = true; setStep(next); setError('') }
  const groups = accountOwnerGroups(accounts, adults)
  const group = groups.find(row => row.key === ownerKey)
  const account = accounts.find(row => row.id === accountId)
  const labels = accountOptionLabels(accounts, adults, false)
  const namedPotsFor = (id: string | undefined) => {
    const rows = pots.filter(pot => pot.accountId === id).sort((a, b) => budgetCollator.compare(a.name, b.name) || a.id.localeCompare(b.id))
    const totals = new Map<string, number>()
    const seen = new Map<string, number>()
    rows.forEach(pot => totals.set(normalized(pot.name), (totals.get(normalized(pot.name)) ?? 0) + 1))
    return rows.map(pot => {
      const key = normalized(pot.name)
      const number = (seen.get(key) ?? 0) + 1
      seen.set(key, number)
      return { pot, label: totals.get(key)! > 1 ? `${pot.name} (Pot ${number})` : pot.name }
    })
  }
  const namedPots = namedPotsFor(accountId)
  const activePots = namedPots.map(row => row.pot)
  const ownerName = (key: string) => key === 'joint' ? 'Joint' : adults.find(person => `person:${person.id}` === key)?.name ?? 'Needs owner'
  const ownerLabel = group?.label ?? (account ? ownerName(accountOwnerKey(account)) : '')
  const currentPot = pots.find(pot => pot.id === currentPotId)
  const currentPotLabel = namedPotsFor(currentAccountId).find(row => row.pot.id === currentPotId)?.label ?? currentPot?.name
  const currentLabel = value.destination ? `${currentAccount ? ownerName(currentOwnerKey) : ''} · ${currentAccount ? labels.get(currentAccount.id) : 'Account'}${currentPotLabel ? ` · ${currentPotLabel}` : ' · Account directly'}` : ''
  const isCurrent = (destination: BudgetDestination) => !!value.destination && (destination.kind === 'pot' ? currentPotId === destination.potId : value.destination.kind === 'account' && value.destination.accountId === destination.accountId)
  const currentMark = (current: boolean) => current ? { 'aria-current': 'true' as const, className: 'destination-bubble destination-current' } : { className: 'destination-bubble' }

  const chooseOwner = (key: string) => {
    setOwnerKey(key); setAccountId(''); setCreation(null); move('account')
  }
  const chooseAccount = (id: string) => {
    setAccountId(id); setCreation(null); move('pot')
  }
  const stagedAccountFor = (id: string) => [draftAccount, value.stagedAccount].find(row => row?.id === id)
  const selectDestination = (destination: BudgetDestination) => {
    const stagedAccount = stagedAccountFor(accountId)
    onChange({ destination, ...(stagedAccount ? { stagedAccount } : {}), ...(value.stagedPot?.id === (destination.kind === 'pot' ? destination.potId : '') ? { stagedPot: value.stagedPot } : {}) })
    setCreation(null); move('selected')
  }
  const keepCurrent = () => {
    setOwnerKey(currentOwnerKey); setAccountId(currentAccountId ?? ''); setCreation(null); setPotName(''); move('selected')
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
    setDraftAccount(stagedAccount); setAccountId(stagedAccount.id); setOwnerKey(accountOwnerKey(stagedAccount)); setCreation(null); move('pot')
  }
  const duplicate = activePots.find(pot => normalized(pot.name) === normalized(potName) && potName.trim())
  const useNewPot = () => {
    if (!potName.trim()) { setError('Enter a pot name.'); return }
    if (duplicate) { setError('This pot already exists in this account. Select it above.'); return }
    const stagedPot: BudgetPot = { id: newId(), name: potName.trim(), accountId }
    const stagedAccount = stagedAccountFor(accountId)
    onChange({ destination: { kind: 'pot', potId: stagedPot.id }, stagedPot, ...(stagedAccount ? { stagedAccount } : {}) })
    setCreation(null); move('selected')
  }

  const ownerChoices = [
    ...(adults.length >= 2 ? [{ key: 'joint', label: 'Joint' }] : []),
    ...adults.map(person => ({ key: `person:${person.id}`, label: person.name })),
    ...(groups.some(row => row.key === 'unassigned') ? [{ key: 'unassigned', label: 'Needs owner' }] : []),
  ]

  return <section className={`destination-picker${step === 'selected' ? ' destination-picker-selected' : ''}`} aria-label="Destination" onChangeCapture={onDraftChange}>
    <h3 ref={headingRef} tabIndex={-1}>{step === 'selected' ? 'Destination' : step === 'owner' ? 'Choose an owner' : step === 'account' ? 'Choose an account' : 'Choose an account or pot'}</h3>
    {step === 'selected' ? <div className="destination-picked"><strong>{currentLabel}</strong><button type="button" className="secondary-button" onClick={() => { setOwnerKey(currentOwnerKey); setAccountId(currentAccountId ?? ''); move('pot') }}>Change</button></div> : <>
      {value.destination && <div className="destination-keep"><button type="button" className="text-button" onClick={keepCurrent}>← Keep current</button><span>{currentLabel}</span></div>}
      {step !== 'owner' && <nav className="destination-crumbs" aria-label="Destination path"><button type="button" onClick={() => { setAccountId(''); setCreation(null); move('owner') }}>Owners</button><span aria-hidden="true">›</span>{step === 'account' ? <strong>{ownerLabel}</strong> : <><button type="button" onClick={() => { setAccountId(''); setCreation(null); move('account') }}>{ownerLabel}</button><span aria-hidden="true">›</span><strong>{account ? labels.get(account.id) : 'Account'}</strong></>}</nav>}
      {step === 'owner' && <div className="destination-bubbles">{ownerChoices.map(choice => <button type="button" {...currentMark(!!value.destination && choice.key === currentOwnerKey)} key={choice.key} onClick={() => chooseOwner(choice.key)}>{choice.label}</button>)}</div>}
      {step === 'account' && <>{!group?.accounts.length && <p>No accounts for this owner yet.</p>}<div className="destination-bubbles">{group?.accounts.map(row => <button type="button" {...currentMark(!!value.destination && row.id === currentAccountId)} key={row.id} onClick={() => chooseAccount(row.id)}>{labels.get(row.id)}</button>)}{creation !== 'account' && <button type="button" className="destination-bubble destination-add" onClick={startAccount}>+ Add account</button>}</div>{creation === 'account' && <div className="destination-create"><AccountFields adults={adults} value={accountDraft} onChange={setAccountDraft}/>{error && <p role="alert">{error}</p>}<div className="destination-create-actions"><button type="button" className="secondary-button" onClick={() => { setCreation(null); setError('') }}>Cancel</button><button type="button" className="primary-button" onClick={continueAccount}>Continue</button></div></div>}</>}
      {step === 'pot' && <><div className="destination-bubbles"><button type="button" {...(isCurrent({ kind: 'account', accountId }) ? { 'aria-current': 'true' as const } : {})} className={`destination-bubble destination-direct${isCurrent({ kind: 'account', accountId }) ? ' destination-current' : ''}`} onClick={() => selectDestination({ kind: 'account', accountId })}>Use account directly</button>{namedPots.map(({ pot, label }) => <button type="button" {...currentMark(isCurrent({ kind: 'pot', potId: pot.id }))} key={pot.id} onClick={() => selectDestination({ kind: 'pot', potId: pot.id })}>{label}</button>)}{creation !== 'pot' && <button type="button" className="destination-bubble destination-add" onClick={() => { setPotName(''); setCreation('pot'); moved.current = true }}>+ Add pot</button>}</div>{!activePots.length && <p>No pots in this account yet.</p>}{creation === 'pot' && <div className="destination-create"><label>Pot name<input value={potName} onChange={event => { setPotName(event.target.value); setError('') }}/></label>{duplicate && <p className="destination-duplicate">Already exists in this account. Select the existing pot above.</p>}{error && <p role="alert">{error}</p>}<div className="destination-create-actions"><button type="button" className="secondary-button" onClick={() => { setCreation(null); setPotName(''); setError('') }}>Cancel</button><button type="button" className="primary-button" disabled={!potName.trim() || !!duplicate} onClick={useNewPot}>Use new pot</button></div></div>}</>}
    </>}
  </section>
}
