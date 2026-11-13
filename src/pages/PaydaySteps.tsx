import { ChevronRight } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { NeedsReviewReason, PersonAmount, PersonTransferPlan, PersonTransferPlans, PersonTransferRow } from '../domain/personTransfers'
import { formatGBP } from '../formatting/money'
import { stepSummary } from './budgetLabels'
import { fundStepKey, moveStepKey, personProgress, type StepTick } from '../domain/transferTicks'
import { Meter } from '../components/ui'
import { StepCaption, StepGroup, StepRow } from '../components/ui/StepRow'
import { useListNavigation } from '../state/useListNavigation'

const pounds = (pence: number) => formatGBP(pence / 100)
const list = (values: string[]) => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`
const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`

/** Why an account's steps are withheld, and what to do about it. */
function reviewReasonText(reason: NeedsReviewReason) {
  if (reason === 'unavailable') return 'Can’t work out this account. Check it before moving money.'
  if (reason === 'missing-pot-owner') return 'Assign an account owner to decide who moves money into its pots.'
  return 'Some items here can’t be funded yet.'
}

type Adults = BudgetDocument['household']['adults']
type Props = {
  plans: PersonTransferPlans
  /** One person (the phone's switch), or everyone. */
  selection: string | 'both'
  labels: Map<string, string>
  itemCounts: Map<string, number>
  adults: Adults
  potName: (potId: string) => string
  /** Absent when there is nowhere to show items (no Plan route). */
  onSeeItems?: (accountId: string) => void
  affectedAccounts?: readonly string[]
  /** This month's ticks. */
  ticks?: Readonly<Record<string, StepTick>>
  /** Tick a step at its amount, or untick it (null). */
  onTick?: (key: string, amountPence: number | null) => void
  onCopy: (pence: number) => void
  /** Each person's available money, for "£4,429.66 from £4,000.00 available · £429.66 over". */
  availableByPerson: ReadonlyMap<string, number>
  /** The band's owner: "Joint", "Ada’s". */
  accountOwnerLabel: (accountId: string) => string
  onReview?: (personId: string) => void
}

/**
 * Payday: a card per person (side by side on wide screens), headed by their progress and what it adds up to, then a
 * band per account: fund it, then move money into its pots, indented. Tick a step once done; the amount copies.
 */
export function PaydaySteps({ plans, selection, labels, itemCounts, adults, potName, onSeeItems, affectedAccounts, ticks, onTick, onCopy, availableByPerson, accountOwnerLabel, onReview }: Props) {
  const listKeys = useListNavigation({ label: 'Payday steps', keys: { x: 'Tick or untick (accepts a change)', c: 'Copy the amount' } })
  const name = (personId: string) => adults.find(adult => adult.id === personId)?.name ?? 'Person'
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const chosen = selection !== 'both' ? selection : null
  const shown = plans.people.filter(plan => plan.rows.length > 0 && (!chosen || plan.personId === chosen))
  const others = (people: PersonAmount[]) => list(people.map(row => `${pounds(row.amountPence)} from ${name(row.personId)}`))
  /** "26 items ›": Plan filtered to the account, with Back to Month returning here. */
  const seeItems = (accountId: string) => {
    if (!onSeeItems) return null
    const count = itemCounts.get(accountId) ?? 0
    return <button type="button" className="text-button payday-see-items" data-see-items={accountId} aria-label={`See ${plural(count, 'item')} for ${label(accountId)}`} onClick={() => onSeeItems(accountId)}>{plural(count, 'item')}<ChevronRight aria-hidden="true"/></button>
  }
  const affected = (accountId: string) => affectedAccounts?.includes(accountId) ? <span className="budget-affected-label">Changed by recent edit</span> : null

  /** One band per account: fund it, then its pot moves indented beneath. */
  const steps = (plan: PersonTransferPlan) => plan.rows.map((row: PersonTransferRow) => {
    const account = label(row.accountId)
    const fund = row.fundingPence > 0 ? <StepRow key="fund" stepKey={fundStepKey(plan.personId, row.accountId)} name={`Fund ${account}`} amountPence={row.fundingPence} ticks={ticks} onTick={onTick} onCopy={onCopy} account={row.accountId}>
      {row.movedOnBy.map(other => <StepCaption key={other.personId}>{name(other.personId)} moves {other.amountPence === row.fundingPence ? 'it' : `${pounds(other.amountPence)} of it`} into {list(other.potIds.map(potName))}</StepCaption>)}
      {affected(row.accountId)}
    </StepRow> : null
    const moves = row.potMoves.map((move, index) => {
      const first = !fund && index === 0
      return <StepRow key={move.potId} stepKey={moveStepKey(plan.personId, move.potId)} name={`Move to ${potName(move.potId)}`} indent amountPence={move.amountPence} ticks={ticks} onTick={onTick} onCopy={onCopy} account={row.accountId}
        label={<>Move to {potName(move.potId)}{first ? <span className="step-from"> from {account}</span> : <span className="visually-hidden"> from {account}</span>}</>}
        caption={move.fromOthers.length > 0 ? `Includes ${others(move.fromOthers)}` : undefined}>
        {first && affected(row.accountId)}
      </StepRow>
    })
    return <StepGroup key={row.accountId} title={account} aside={<>{accountOwnerLabel(row.accountId)}{onSeeItems && <> · {seeItems(row.accountId)}</>}</>}>{fund}{moves}</StepGroup>
  })

  /** A person's card head: name and progress, a meter, what it adds up to, and anything to act on, in one line each. */
  const personHead = (plan: PersonTransferPlan) => {
    const progress = personProgress(plan, ticks), who = name(plan.personId), available = availableByPerson.get(plan.personId)
    const over = available !== undefined && plan.fundingPence > available
    return <header className="payday-person-head">
      <h3><span className="payday-person-name">{who}</span><span className="payday-person-count">{progress.done} of {progress.total} · {stepSummary(plan)}</span></h3>
      <Meter label={`${who}: steps ticked`} value={progress.done} max={progress.total || 1}/>
      <p className="payday-person-sub">{pounds(plan.fundingPence)}{available !== undefined ? ` from ${pounds(available)} available` : ''}
        {over && <> · <strong className="payday-person-over">{pounds(plan.fundingPence - available!)} over</strong>{onReview && <> · <button type="button" className="text-button payday-person-review" onClick={() => onReview(plan.personId)}>Review on Plan</button></>}</>}
        {progress.changed > 0 && <> · <span className="payday-person-changed">{progress.changed} changed since ticked · {progress.differencePence >= 0 ? `send ${pounds(progress.differencePence)} more` : `${pounds(-progress.differencePence)} less needed`}</span></>}
      </p>
    </header>
  }

  return <div className="payday" role="region" aria-label="Steps by person">
    {!shown.length && !plans.needsReview.length && <p className="budget-destination-empty">{chosen ? `${name(chosen)} has nothing to move this month.` : 'Nothing to move this month.'}</p>}
    {chosen && !shown.length && plans.needsReview.length > 0 && <p className="budget-destination-empty">{name(chosen)} has no steps ready this month.</p>}
    {shown.length > 0 && <div className="payday-people" {...listKeys.listProps}>{listKeys.hint}{shown.map(plan => <section key={plan.personId} className="payday-person" aria-label={`${name(plan.personId)} steps`}>
      {personHead(plan)}
      {steps(plan)}
    </section>)}</div>}
    {plans.needsReview.length > 0 && <section className="payday-review" aria-label="Needs review">
      <h3 className="payday-person-heading"><span>Needs review</span><span>{plural(plans.needsReview.length, 'account')}</span></h3>
      <ul>{plans.needsReview.map(account => {
        const people = account.byPerson.filter(row => !chosen || row.personId === chosen)
        return <li key={account.accountId} className="payday-review-account" data-payday-account={account.accountId}>
          <p className="step-main"><span className="step-label">{label(account.accountId)}</span>{account.notCalculated && <strong className="step-amount">—</strong>}</p>
          {account.notCalculated ? <p className="step-caption"><span className="budget-not-calculated">Not calculated</span></p>
            : <dl className="payday-review-amounts">{people.map(row => <div key={row.personId}><dt>{name(row.personId)} so far</dt><dd>{pounds(row.amountPence)}</dd></div>)}</dl>}
          <p className="step-caption budget-allocation-incomplete">{reviewReasonText(account.reason)}</p>
          {affected(account.accountId)}
          {seeItems(account.accountId)}
        </li>
      })}</ul>
    </section>}
  </div>
}
