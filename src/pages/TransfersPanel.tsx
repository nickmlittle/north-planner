import { useLayoutEffect, useRef } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { budgetTransfers } from '../domain/budgetTransfers'
import type { BudgetImpact } from '../domain/budgetImpact'
import type { BudgetItem } from '../domain/monthlyBudget'
import type { PersonTransferPlans, TransferAccount } from '../domain/personTransfers'
import type { TransferInstructions } from '../domain/transferInstructions'
import type { StepsReturn } from '../state/navigation'
import { formatGBP } from '../formatting/money'
import { AccountFundingNote } from './TransferCalculationNotes'
import { PaydaySteps } from './PaydaySteps'
import { TransferTable } from './TransferTable'

const pounds = (pence: number) => formatGBP(pence / 100)
const signedPounds = (pence: number) => pence < 0 ? `−${pounds(Math.abs(pence))}` : pounds(pence)

type Props = {
  document: BudgetDocument
  transfers: ReturnType<typeof budgetTransfers>
  /** `transfers.accounts` in reading order (`orderTransferAccounts`). */
  accounts: TransferAccount[]
  instructions?: TransferInstructions
  unfundedItems: BudgetItem[]
  labels: Map<string, string>
  plans: PersonTransferPlans
  personSelection: string | 'both' | null
  view: 'plan' | 'transfers'
  mobilePresentation: boolean
  affectedTransfers?: BudgetImpact | null
  stepsReturn?: StepsReturn | null
  onSeeItems?: (accountId: string) => void
  onEditIncome: () => void
}

/** People & transfers: each person's plan, the destination table (desktop) and the payday steps (phone). */
export function TransfersPanel({ document, transfers, accounts, instructions, unfundedItems, labels, plans, personSelection, view, mobilePresentation, affectedTransfers, stepsReturn, onSeeItems, onEditIncome }: Props) {
  const adults = document.household.adults
  const potName = (potId: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
  const itemCounts = new Map(accounts.map(account => [account.accountId, account.items.length]))
  const affectedAccounts = affectedTransfers?.accounts.map(row => row.accountId)

  // Back from "See items": land on the same account's link, once per visit.
  const restoredStepsKey = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!stepsReturn || view !== 'transfers' || restoredStepsKey.current === stepsReturn.key) return
    restoredStepsKey.current = stepsReturn.key
    const target = [...window.document.querySelectorAll<HTMLButtonElement>('[data-see-items]')].find(button => button.dataset.seeItems === stepsReturn.accountId)
    target?.focus({ preventScroll: true }); target?.scrollIntoView?.({ block: 'center' })
  }, [stepsReturn, view])

  // After an edit, bring the first changed account's step into view instead of opening a detail screen.
  const affectedKey = mobilePresentation && view === 'transfers' && affectedTransfers ? `${affectedTransfers.month}:${affectedAccounts!.join(',')}` : null
  const shownAffectedKey = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!affectedKey || shownAffectedKey.current === affectedKey) return
    shownAffectedKey.current = affectedKey
    const ids = affectedTransfers?.accounts.map(row => row.accountId) ?? []
    ;[...window.document.querySelectorAll<HTMLElement>('.payday [data-payday-account]')].find(step => ids.includes(step.dataset.paydayAccount ?? ''))?.scrollIntoView?.({ block: 'center' })
  }, [affectedKey, affectedTransfers])

  return <section className="budget-v3-transfers budget-v3-people-summary" id="budget-transfers-panel" aria-label="People and transfers">
    {affectedTransfers && view === 'transfers' && <div className="budget-affected-banner" role="status"><strong>Changed by recent edit</strong>{affectedTransfers.accounts.map(account => <p key={account.accountId}>{document.budget.accounts.find(row => row.id === account.accountId)?.name ?? 'Account'}: {pounds(account.beforePence)} → {pounds(account.afterPence)}</p>)}</div>}
    <div className="budget-v3-desktop-people"><h2>People &amp; transfers</h2>
      <h3>Monthly plan by person</h3>
      <div className="budget-v3-person-grid">{transfers.people.map(person => <article key={person.personId}>
        <h4>{adults.find(adult => adult.id === person.personId)?.name ?? 'Person'}</h4>
        <dl className="budget-v3-person-metrics"><div><dt>Available</dt><dd>{pounds(person.availablePence)}</dd></div><div><dt>Planned contributions</dt><dd>{pounds(person.plannedPence)}</dd></div><div className={person.remainingPence < 0 ? 'is-negative' : ''}><dt>Remaining</dt><dd>{signedPounds(person.remainingPence)}</dd></div></dl>
        <details className="budget-v3-income-details"><summary>Income details</summary><dl><div><dt>Employment income</dt><dd>{pounds(person.employmentPence)}</dd></div><div><dt>Additional income</dt><dd>{pounds(person.additionalPence)}</dd></div></dl></details>
      </article>)}</div></div>
    {unfundedItems.length > 0 && <div className="budget-v3-transfer-warning" role="status"><p><strong>{unfundedItems.length} {unfundedItems.length === 1 ? 'item' : 'items'} can’t be funded yet.</strong> <button type="button" onClick={onEditIncome}>Edit income</button></p><details><summary>Show items</summary><ul>{unfundedItems.map(item => <li key={item.id}>{item.name}</li>)}</ul></details></div>}
    {!instructions && <p className="budget-v3-transfer-warning" role="alert">Transfer instructions are unavailable. The comparison below may be incomplete; review the budget before moving money.</p>}
    {accounts.length === 0 ? <div className="budget-v3-transfer-empty"><h3>No transfers planned</h3><p>Budget items assigned to accounts or pots will appear here.</p></div> : <>
      {unfundedItems.length === 0 && instructions && <AccountFundingNote/>}<div className="budget-v3-transfer-heading"><h3>Transfers by destination</h3>{instructions?.incomplete && <span className="budget-desktop-only">Account instructions need review: *</span>}</div>
      <TransferTable accounts={accounts} people={transfers.people} adults={adults} labels={labels} potName={potName} affectedAccounts={affectedAccounts} incomplete={instructions?.incomplete}/>
      {accounts.some(account => account.hasPots) && <p className="budget-v3-transfer-rounding">Pot movements are already inside each account total.</p>}
      <PaydaySteps plans={plans} selection={personSelection} labels={labels} itemCounts={itemCounts} adults={adults} potName={potName} onSeeItems={onSeeItems} affectedAccounts={affectedAccounts}/>
    </>}
  </section>
}
