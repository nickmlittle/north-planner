import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { BudgetDocument } from '../../domain/budgetDocument'
import type { BudgetImpact } from '../../domain/budgetImpact'
import { personProgress, setStepTick } from '../../domain/transferTicks'
import { EmptyState, Section, Segmented, useStepCopy } from '../../components/ui'
import { formatGBP } from '../../formatting/money'
import { readTransferPerson, rememberTransferPerson, resolveTransferPerson } from '../../state/transferPerson'
import type { StepsReturn } from '../../state/navigation'
import type { MonthBudget } from '../budget/useMonthBudget'
import { AccountFundingNote } from '../TransferCalculationNotes'
import { PaydaySteps } from '../PaydaySteps'
import { TransferTable } from '../TransferTable'
import './PaydaySection.css'

const pounds = (pence: number) => formatGBP(pence / 100)

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  month: string
  budget: MonthBudget
  mobilePresentation: boolean
  /** Steps, or the Funding by account table (a toggle on desktop, Month's ⋯ on phones). */
  byAccount: boolean
  onByAccount: (byAccount: boolean) => void
  affectedTransfers?: BudgetImpact | null
  stepsReturn?: StepsReturn | null
  onSeeItems?: (accountId: string) => void
  onEditIncome: () => void
  onReviewPerson: (personId: string) => void
  onOpenPlan?: () => void
}

/**
 * Month › Payday: each person's steps to fund the month, ticked off as the money moves. Desktop shows everyone side
 * by side with a Steps | By account switch; phones show one person at a time (remembered on this device) or Both.
 */
export function PaydaySection({ document, setDocument, month, budget, mobilePresentation, byAccount, onByAccount, affectedTransfers, stepsReturn, onSeeItems, onEditIncome, onReviewPerson, onOpenPlan }: Props) {
  const { adults, transfers, instructions, unfundedItems, shortLabels, transferAccounts, personPlans } = budget
  const ticks = document.ticks?.[month]
  const [stored, setStored] = useState(readTransferPerson)
  // Phones default to Both until someone picks; desktop always shows everyone.
  const selection = mobilePresentation ? resolveTransferPerson(stored, adults.map(person => person.id)) ?? 'both' : 'both'
  const choose = (value: string) => { rememberTransferPerson(value); setStored(value) }
  const tick = (key: string, amountPence: number | null) => setDocument(current => setStepTick(current, month, key, amountPence))
  const { copy, hintSeen, status: copied } = useStepCopy()
  const progress = new Map(personPlans.people.map(plan => [plan.personId, personProgress(plan, ticks)]))
  const counted = [...progress.entries()].filter(([personId]) => selection === 'both' || personId === selection).map(([, row]) => row)
  const done = counted.reduce((sum, row) => sum + row.done, 0), total = counted.reduce((sum, row) => sum + row.total, 0)
  const potName = (potId: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
  const ownerLabel = (accountId: string) => {
    const owners = document.budget.accounts.find(account => account.id === accountId)?.ownerPersonIds ?? []
    return owners.length > 1 ? 'Joint' : owners.length ? `${adults.find(adult => adult.id === owners[0])?.name ?? 'Person'}’s` : 'Needs an owner'
  }
  const affectedAccounts = affectedTransfers?.accounts.map(row => row.accountId)

  // Back from "26 items": land on the same account's link, once per visit.
  const restored = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!stepsReturn || restored.current === stepsReturn.key) return
    restored.current = stepsReturn.key
    const target = [...window.document.querySelectorAll<HTMLButtonElement>('[data-see-items]')].find(button => button.dataset.seeItems === stepsReturn.accountId)
    target?.focus({ preventScroll: true }); target?.scrollIntoView?.({ block: 'center' })
  }, [stepsReturn])
  // After an edit on phones, bring the first changed account's step into view.
  const affectedKey = mobilePresentation && affectedTransfers ? `${affectedTransfers.month}:${affectedAccounts!.join(',')}` : null
  const shownAffected = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!affectedKey || shownAffected.current === affectedKey) return
    shownAffected.current = affectedKey
    const ids = affectedTransfers?.accounts.map(row => row.accountId) ?? []
    ;[...window.document.querySelectorAll<HTMLElement>('.payday [data-payday-account]')].find(step => ids.includes(step.dataset.paydayAccount ?? ''))?.scrollIntoView?.({ block: 'center' })
  }, [affectedKey, affectedTransfers])

  const hasSteps = transferAccounts.length > 0
  const personSwitch = adults.length > 1 && <Segmented label="Whose steps" value={selection} onChange={choose} options={[
    ...adults.map(person => { const row = progress.get(person.id); return { value: person.id, label: person.name, detail: !row?.total ? '' : row.complete ? '✓' : `${row.done}/${row.total}` } }),
    { value: 'both', label: 'Both' },
  ]}/>
  const aside = !hasSteps ? undefined : mobilePresentation ? personSwitch || undefined : <>
    {!hintSeen && !byAccount && <span className="payday-hint">Click an amount to copy it</span>}
    <Segmented label="Payday view" value={byAccount ? 'accounts' : 'steps'} onChange={value => onByAccount(value === 'accounts')} options={[{ value: 'steps', label: 'Steps' }, { value: 'accounts', label: 'By account' }]}/>
  </>

  return <Section title="Payday" id="month-payday" count={hasSteps && total ? `${done} of ${total}${mobilePresentation ? '' : ' done'}` : undefined} aside={aside}>
    <div className="payday-section" id="budget-transfers-panel">
      {copied}
      {affectedTransfers && <div className="budget-affected-banner" role="status"><strong>Changed by recent edit</strong>{affectedTransfers.accounts.map(account => <p key={account.accountId}>{shortLabels.get(account.accountId) ?? 'Account'}: {pounds(account.beforePence)} → {pounds(account.afterPence)}</p>)}</div>}
      {unfundedItems.length > 0 && <div className="budget-v3-transfer-warning" role="status"><p><strong>{unfundedItems.length} {unfundedItems.length === 1 ? 'item' : 'items'} can’t be funded yet.</strong> <button type="button" onClick={onEditIncome}>Edit income</button></p><details><summary>Show items</summary><ul>{unfundedItems.map(item => <li key={item.id}>{item.name}</li>)}</ul></details></div>}
      {!instructions && <p className="budget-v3-transfer-warning" role="alert">Can’t work out funding. Check the plan before moving money.</p>}
      {!hasSteps ? <EmptyState title="Nothing to fund yet" action={onOpenPlan && <button type="button" className="secondary-button" onClick={onOpenPlan}>Open Plan</button>}>Add items on the Plan and each person’s payday steps appear here.</EmptyState>
        : byAccount ? <div className="payday-by-account">
          <h3 className="payday-by-account-title">Funding by account{instructions?.incomplete && <span> · * Needs review</span>}</h3>
          <TransferTable accounts={transferAccounts} people={transfers.people} adults={adults} labels={shortLabels} potName={potName} affectedAccounts={affectedAccounts} incomplete={instructions?.incomplete}/>
          {transferAccounts.some(account => account.hasPots) && <p className="payday-footnote">Each account’s funding already includes its moves.</p>}
        </div>
        : <PaydaySteps plans={personPlans} selection={selection} labels={shortLabels} itemCounts={new Map(transferAccounts.map(account => [account.accountId, account.items.length]))} adults={adults} potName={potName}
          onSeeItems={onSeeItems} affectedAccounts={affectedAccounts} ticks={ticks} onTick={tick} onCopy={pence => void copy(pence)}
          availableByPerson={new Map(transfers.people.map(person => [person.personId, person.availablePence]))} accountOwnerLabel={ownerLabel} onReview={onReviewPerson}/>}
      {hasSteps && unfundedItems.length === 0 && instructions && <AccountFundingNote/>}
    </div>
  </Section>
}
