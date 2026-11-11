import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { NeedsReviewReason, PersonAmount, PersonTransferPlan, PersonTransferPlans, PersonTransferRow } from '../domain/personTransfers'
import { formatGBP } from '../formatting/money'
import { stepSummary } from './budgetLabels'
import { copyHintSeen, rememberCopyHint } from './copyHint'
import { fundStepKey, moveStepKey, personProgress, stepStatus, type StepTick } from '../domain/transferTicks'

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
  selection: string | 'both' | null
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
  /** Desktop: everyone's steps side by side, each column headed by its progress, with account bands. */
  desktop?: boolean
  /** Desktop column headings: what each person has available. */
  availableByPerson?: ReadonlyMap<string, number>
  /** "Joint · you each move your share", "Ada’s account". */
  accountOwnerLabel?: (accountId: string) => string
  /** "November", for "Ada is up to date for November". */
  monthName?: string
  onReview?: (personId: string) => void
}

/**
 * Payday, in order: fund an account, then move money out of it into its pots, indented beneath it.
 * Each step has a circle to tick once the money has moved; the amount copies. The hero counts them as "N to fund · N moves".
 */
export function PaydaySteps({ plans, selection, labels, itemCounts, adults, potName, onSeeItems, affectedAccounts, ticks, onTick, desktop = false, availableByPerson, accountOwnerLabel, monthName = 'this month', onReview }: Props) {
  const name = (personId: string) => adults.find(adult => adult.id === personId)?.name ?? 'Person'
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const chosen = selection && selection !== 'both' ? selection : null
  const shown = plans.people.filter(plan => plan.rows.length > 0 && (!chosen || plan.personId === chosen))
  const others = (people: PersonAmount[]) => list(people.map(row => `${pounds(row.amountPence)} from ${name(row.personId)}`))
  const seeItems = (accountId: string) => {
    if (!onSeeItems) return null
    const count = itemCounts.get(accountId) ?? 0
    return <button type="button" className="text-button payday-see-items" data-see-items={accountId} aria-label={`See ${plural(count, 'item')} for ${label(accountId)}`} onClick={() => onSeeItems(accountId)}>See {plural(count, 'item')}<ChevronRight size={16} aria-hidden="true"/></button>
  }
  // Tap an amount to copy it for the banking app: the plain number ("2215.45"), with a short confirmation.
  const [copied, setCopied] = useState('')
  const [hintSeen, setHintSeen] = useState(copyHintSeen)
  const clearCopied = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clearCopied.current), [])
  const copy = async (pence: number) => {
    let message = `Copied ${pounds(pence)}`
    try { await navigator.clipboard.writeText((pence / 100).toFixed(2)) } catch { message = 'Couldn’t copy' }
    setCopied(message)
    if (!hintSeen) { rememberCopyHint(); setHintSeen(true) }
    clearTimeout(clearCopied.current)
    clearCopied.current = setTimeout(() => setCopied(''), 2500)
  }
  /** The amount copies. Changed since ticked, it shows and copies only the difference ("+£50.00"). */
  const amount = (key: string, pence: number) => {
    const status = stepStatus(ticks, key, pence)
    const shown = status.state === 'changed' ? Math.abs(status.differencePence) : pence
    const text = status.state === 'changed' ? `${status.differencePence > 0 ? '+' : '−'}${pounds(shown)}` : pounds(shown)
    return <button type="button" className="payday-step-amount" aria-label={`Copy ${pounds(shown)}`} onClick={() => void copy(shown)}>{text}</button>
  }
  /** What changed after the tick, and what to do about it. */
  const changedNote = (key: string, pence: number) => {
    const status = stepStatus(ticks, key, pence)
    if (status.state !== 'changed') return null
    return <p className="payday-step-changed">Changed since ticked: you sent {pounds(status.tickedPence!)}, it’s now {pounds(pence)}. {status.differencePence > 0 ? `Send ${pounds(status.differencePence)} more.` : `${pounds(-status.differencePence)} less is needed.`}</p>
  }
  /** The tick: a 44px circle, separate from the amount so copying never ticks. */
  const tick = (key: string, label: string, pence: number) => {
    const status = stepStatus(ticks, key, pence)
    const done = status.state === 'done'
    // Changed: the circle accepts the new amount (records it), so the step is done again.
    return <button type="button" className={`payday-tick is-${status.state}`} aria-pressed={done} aria-label={status.state === 'changed' ? `${label}: mark the change done` : `${label} done`} disabled={!onTick} onClick={() => onTick?.(key, done ? null : pence)}>
      <span className="payday-tick-dot" aria-hidden="true">{done && <Check/>}{status.state === 'changed' && <RefreshCw/>}</span>
    </button>
  }
  const affected = (accountId: string) => affectedAccounts?.includes(accountId) ? <span className="budget-affected-label">Changed by recent edit</span> : null

  const steps = (plan: PersonTransferPlan) => {
    return plan.rows.flatMap((row: PersonTransferRow) => {
      const account = label(row.accountId)
      const fundKey = fundStepKey(plan.personId, row.accountId)
      const fund = row.fundingPence > 0 ? [<li key={`${row.accountId}:fund`} className={`payday-step is-fund is-${stepStatus(ticks, fundKey, row.fundingPence).state}`} data-payday-account={row.accountId}>
        {tick(fundKey, `Fund ${account}`, row.fundingPence)}
        <div className="payday-step-body">
          <p className="payday-step-main"><span className="payday-step-label">Fund {account}</span>{amount(fundKey, row.fundingPence)}</p>
          {changedNote(fundKey, row.fundingPence)}
          {row.movedOnBy.map(other => <p key={other.personId} className="payday-step-caption">{name(other.personId)} moves {other.amountPence === row.fundingPence ? 'it' : `${pounds(other.amountPence)} of it`} into {list(other.potIds.map(potName))}</p>)}
          {affected(row.accountId)}
          {seeItems(row.accountId)}
        </div>
      </li>] : []
      const moves = row.potMoves.map((move, index) => {
        const first = !fund.length && index === 0
        const moveKey = moveStepKey(plan.personId, move.potId)
        return <li key={`${row.accountId}:${move.potId}`} className={`payday-step is-pot-move is-${stepStatus(ticks, moveKey, move.amountPence).state}`} data-payday-account={row.accountId}>
          {tick(moveKey, `Move to ${potName(move.potId)}`, move.amountPence)}
          <div className="payday-step-body">
            <p className="payday-step-main"><span className="payday-step-label">Move to {potName(move.potId)}{first ? <span className="payday-step-from"> from {account}</span> : <span className="visually-hidden"> from {account}</span>}</span>{amount(moveKey, move.amountPence)}</p>
            {changedNote(moveKey, move.amountPence)}
            {move.fromOthers.length > 0 && <p className="payday-step-caption">Includes {others(move.fromOthers)}</p>}
            {first && affected(row.accountId)}
            {first && seeItems(row.accountId)}
          </div>
        </li>
      })
      const band = desktop ? [<li key={`${row.accountId}:band`} className="payday-account-band" aria-hidden="true"><span>{account}</span>{accountOwnerLabel && <span>{accountOwnerLabel(row.accountId)}</span>}</li>] : []
      return [...band, ...fund, ...moves]
    })
  }

  /** A desktop column's heading: name, progress, what it adds up to, and anything to act on. */
  const personHead = (plan: PersonTransferPlan) => {
    const progress = personProgress(plan, ticks), who = name(plan.personId), available = availableByPerson?.get(plan.personId)
    const over = available !== undefined && plan.fundingPence > available
    return <header className="payday-person-head">
      <h3><span>{who}</span><span className="payday-person-count">{progress.done} of {progress.total} done</span></h3>
      <span className="transfer-progress-track" aria-hidden="true"><span style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }}/></span>
      <p className="payday-person-sub">{pounds(plan.fundingPence)}{available !== undefined ? ` from ${pounds(available)} available` : ''} · {stepSummary(plan)}</p>
      {progress.complete && <p className="payday-person-done"><Check aria-hidden="true"/>{who} is up to date for {monthName}</p>}
      {progress.changed > 0 && <p className="transfer-progress-changed">{progress.changed} changed since ticked · {progress.differencePence >= 0 ? `send ${pounds(progress.differencePence)} more` : `${pounds(-progress.differencePence)} less needed`}</p>}
      {over && <div className="transfer-over-warning"><TriangleAlert aria-hidden="true"/><p>{who}’s steps add up to {pounds(plan.fundingPence)}, which is {pounds(plan.fundingPence - available!)} more than {who}’s {pounds(available!)} available. {onReview && <button type="button" className="text-button" onClick={() => onReview(plan.personId)}>See it on Plan</button>}</p></div>}
    </header>
  }
  const everyoneDone = shown.length > 0 && shown.every(plan => personProgress(plan, ticks).complete)

  return <div className={`payday${desktop ? ' is-desktop' : ''}`} role="region" aria-label="Steps by person">
    <p className="payday-copied" role="status">{copied}</p>
    {desktop && everyoneDone && <div className="transfer-done-banner payday-all-done" role="status"><span className="transfer-done-icon" aria-hidden="true"><Check/></span><span><strong>{shown.length === 2 ? 'You’re both' : 'Everyone is'} up to date for {monthName}</strong><span>Every payday step is ticked. Changes to the plan will show here as top-ups.</span></span></div>}
    {!hintSeen && shown.length > 0 && !everyoneDone && <p className="payday-copy-hint">{desktop ? 'Click' : 'Tap'} an amount to copy it for your banking app.</p>}
    {!shown.length && !plans.needsReview.length && <p className="budget-destination-empty">{chosen ? `${name(chosen)} has nothing to move this month.` : 'Nothing to move this month.'}</p>}
    {chosen && !shown.length && plans.needsReview.length > 0 && <p className="budget-destination-empty">{name(chosen)} has no steps ready this month.</p>}
    {shown.map(plan => <section key={plan.personId} className="payday-person" aria-label={`${name(plan.personId)} steps`}>
      {desktop ? personHead(plan) : !chosen && <h3 className="payday-person-heading"><span>{name(plan.personId)}</span><span>{pounds(plan.fundingPence)} · {stepSummary(plan)}</span></h3>}
      <ol className="payday-steps">{steps(plan)}</ol>
    </section>)}
    {plans.needsReview.length > 0 && <section className="payday-review" aria-label="Needs review">
      <h3 className="payday-person-heading"><span>Needs review</span><span>{plural(plans.needsReview.length, 'account')}</span></h3>
      <ul>{plans.needsReview.map(account => {
        const people = account.byPerson.filter(row => !chosen || row.personId === chosen)
        return <li key={account.accountId} className="payday-review-account" data-payday-account={account.accountId}>
          <p className="payday-step-main"><span className="payday-step-label">{label(account.accountId)}</span>{account.notCalculated && <strong className="payday-step-amount">—</strong>}</p>
          {account.notCalculated ? <p className="payday-step-caption"><span className="budget-not-calculated">Not calculated</span></p>
            : <dl className="payday-review-amounts">{people.map(row => <div key={row.personId}><dt>{name(row.personId)} so far</dt><dd>{pounds(row.amountPence)}</dd></div>)}</dl>}
          <p className="payday-step-caption budget-allocation-incomplete">{reviewReasonText(account.reason)}</p>
          {affected(account.accountId)}
          {seeItems(account.accountId)}
        </li>
      })}</ul>
    </section>}
  </div>
}
