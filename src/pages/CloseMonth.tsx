import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { Clock, Inbox } from 'lucide-react'
import { ListRow, Section, Sheet } from '../components/ui'
import { StepRow } from '../components/ui/StepRow'
import { useStepCopy } from '../components/ui/useStepCopy'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, destinationKey, lastDayOf, parseDestinationValue, parsePence, shiftMonth, type CoverSource } from '../domain/cardTracker'
import { closeMonthPlan, keepBuiltUp, markAllIn, moveBuiltUp, setCover, setCoverTick, type Leftover, type Overspend } from '../domain/monthStages'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { destinationNamer } from './cardLabels'
import { dayOf, plural, pounds, signedPounds } from './spendingFormat'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const sourceValue = (source: CoverSource) => source.kind === 'next-month' ? 'next-month' : destinationKey(source)

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; today: string; onSort: () => void; onBringIn: () => void; now?: () => Date }

/**
 * Close <Month>, inline on an ended month (D7, D8, D11, R1): what's still waiting, each overspend's cover as a step,
 * the money left and its build-up, and the carry-over pots. Month's header holds the Close button. Once closed,
 * they fold to one line that expands.
 */
export function CloseSections({ document, setDocument, month, today, onSort, onBringIn, now = () => new Date() }: Props) {
  const plan = closeMonthPlan(document, month, today)
  const [moving, setMoving] = useState<Leftover | null>(null)
  const [expanded, setExpanded] = useState(false)
  const { copy, status: copiedStatus } = useStepCopy()
  if (!plan) return null
  const name = monthName(month)
  const destination = destinationNamer(document)
  const potName = (potId: string) => document.budget.pots.find(pot => pot.id === potId)?.name ?? 'Pot'
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const record = cardTracker(document).months[month]
  const { readiness } = plan
  const nextName = monthName(shiftMonth(month, 1))
  const sourceLabel = (source: Exclude<CoverSource, { kind: 'next-month' }>, leftPence?: number) => `${destination(source)}${leftPence !== undefined ? ` · ${pounds(Math.max(0, leftPence))} left` : ''}`
  /** "Move from Joint Monzo into Eating out", or "Out of Treats, then into Eating out". The amount is the step's own chip. */
  const stepText = (overspend: Overspend) => {
    const source = overspend.cover.source
    if (source.kind === 'account') return `Move from ${labels.get(source.accountId) ?? 'the account'} into ${potName(overspend.potId)}`
    if (source.kind === 'pot') return `Out of ${potName(source.potId)}, then into ${potName(overspend.potId)}`
    return `Cover from ${nextName}’s ${potName(overspend.potId)}`
  }
  /** The inline "covered from" choice: a compact select in the caption, not a bordered box. */
  const coverFrom = (overspend: Overspend) => <select className="close-cover-from" aria-label="Covered from" value={sourceValue(overspend.cover.source)} onChange={event => {
    const value = event.target.value
    const source: CoverSource | undefined = value === 'next-month' ? { kind: 'next-month' } : parseDestinationValue(value)
    if (source) setDocument(current => setCover(current, month, { potId: overspend.potId, amountPence: overspend.overPence, source }))
  }}>{overspend.options.map(option => <option key={sourceValue(option.source)} value={sourceValue(option.source)}>{option.source.kind === 'next-month' ? `${nextName}’s ${potName(overspend.potId)} (moves no money)` : sourceLabel(option.source, option.leftPence)}</option>)}</select>

  if (plan.closedAt && !expanded) return <Section title={`${name} closed`} id="month-close" collapsed={{ summary: `${dayOf(plan.closedAt)} · ${plural(plan.overspends.length, 'cover')} · ${plural(plan.leftovers.length, 'pot')} with money left`, onExpand: () => setExpanded(true) }}/>

  return <div className="close-sections" id="month-close" tabIndex={-1}>
    {copiedStatus}
    {!plan.closedAt && !readiness.canClose && today > lastDayOf(month) && <Section title="Waiting">
      <ul className="close-list" aria-label="Waiting">
        {readiness.toSort > 0 && <li><ListRow icon={<Inbox/>} tone="warning" title={`${plural(readiness.toSort, 'transaction')} to sort`} meta={`${name} can’t close until they’re sorted`} trailing={<button type="button" className="text-button" onClick={onSort}>Sort them</button>}/></li>}
        {!readiness.postingsIn && !readiness.allIn && <li><ListRow icon={<Clock/>} tone="warning" title={readiness.lastImportDate ? `Last brought in ${dayOf(readiness.lastImportDate)}` : 'Nothing brought in yet'} meta={`Late ${name} transactions can take a few days to post.`}
          trailing={<span className="close-actions"><button type="button" className="text-button" onClick={onBringIn}>Bring in transactions</button><button type="button" className="text-button" onClick={() => setDocument(current => markAllIn(current, month, now()))}>All {name} transactions are in</button></span>}/></li>}
      </ul>
    </Section>}

    <Section title="Cover overspends" count={plan.overspends.length}>
      {!plan.overspends.length ? <p className="close-none">No pot went over in {name}.</p>
        : <ol className="step-list close-covers">{plan.overspends.map(overspend => {
          const caption = <>{destination({ kind: 'pot', potId: overspend.potId })} is {pounds(overspend.overPence)} over · covered from {coverFrom(overspend)}{overspend.cover.source.kind === 'next-month' && <> · Leaves {potName(overspend.potId)} {pounds(overspend.overPence)} short in {nextName}.</>}</>
          return overspend.cover.source.kind === 'next-month'
            ? <StepRow key={overspend.potId} stepKey={overspend.stepKey} mode="status" done name={stepText(overspend)} amountText={pounds(overspend.overPence)} caption={caption}/>
            : <StepRow key={overspend.potId} stepKey={overspend.stepKey} name={stepText(overspend)} amountPence={overspend.cover.amountPence} ticks={record?.coverTicks} onCopy={pence => void copy(pence)} caption={caption}
              onTick={(_, amountPence) => setDocument(current => setCoverTick(current, month, overspend.potId, amountPence, now()))} changedNote={tickedPence => <>Changed since ticked: it was {pounds(tickedPence)}, it’s now {pounds(overspend.cover.amountPence)}.</>}/>
        })}</ol>}
    </Section>

    {plan.leftovers.length > 0 && <Section title="Money left" count="stays in the pot">
      <div className="close-table-wrap"><table className="close-left">
        <thead><tr><th scope="col">Pot</th><th scope="col" className="is-num">Left</th><th scope="col" className="is-num">Built up</th><th scope="col"><span className="visually-hidden">Build-up</span></th></tr></thead>
        <tbody>{plan.leftovers.map(row => <tr key={row.potId}>
          <th scope="row">{destination({ kind: 'pot', potId: row.potId })}</th><td className="is-num">{pounds(row.leftPence)}</td><td className="is-num">{pounds(row.builtUpPence)}</td>
          <td className="close-flag-actions">{row.flag && <><button type="button" className="secondary-button" onClick={() => setMoving(row)}>Move {pounds(row.flag.movePence)}…</button><button type="button" className="text-button" onClick={() => setDocument(current => keepBuiltUp(current, row.potId, row.builtUpPence))}>Keep it</button></>}</td>
        </tr>)}</tbody>
      </table></div>
      {plan.leftovers.filter(row => row.flag).map(row => <p key={row.potId} className="close-flag">{potName(row.potId)} has built up {pounds(row.builtUpPence)}, more than {pounds(row.flag!.limitPence)} ({row.flag!.limitPence / row.plannedPence}× its {pounds(row.plannedPence)} monthly plan). Move some?</p>)}
    </Section>}

    {plan.carryOver.length > 0 && <Section title="Carry-over pots">
      <ul className="close-list" aria-label="Carry-over pots">{plan.carryOver.map(row => <li key={row.potId}><ListRow title={destination({ kind: 'pot', potId: row.potId })} meta={row.checkedAt ? `Checked ${dayOf(row.checkedAt)}` : 'Not checked yet'} trailing={row.freePence === undefined ? 'Not checked' : `${signedPounds(row.freePence)} free`}/></li>)}</ul>
    </Section>}
    {moving && <MoveBuiltUp potName={potName(moving.potId)} suggested={moving.flag?.movePence ?? 0} onClose={() => setMoving(null)} onSave={pence => { setDocument(current => moveBuiltUp(current, moving.potId, pence, now())); setMoving(null) }}/>}
  </div>
}

/** "Move £X…": record built-up money moved elsewhere; the move itself happens in the bank. */
function MoveBuiltUp({ potName, suggested, onSave, onClose }: { potName: string; suggested: number; onSave: (pence: number) => void; onClose: () => void }) {
  const formId = useId()
  const [value, setValue] = useState((suggested / 100).toFixed(2))
  const [error, setError] = useState('')
  return <Sheet title={`Move money out of ${potName}`} size="sm" onClose={onClose} footer={<>
    <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
    <button type="submit" form={formId} className="primary-button">Record the move</button>
  </>}>
    <form id={formId} className="spending-form" noValidate onSubmit={event => { event.preventDefault(); const pence = parsePence(value); if (pence === null || pence <= 0) { setError('Enter an amount, like 100.00.'); return } onSave(pence) }}>
      <p className="spending-facts">Move it in your banking app, then record it here so the build-up starts again.</p>
      <div className="spending-field-wrap"><label className="spending-field">Amount moved<input inputMode="decimal" value={value} data-autofocus onChange={event => setValue(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? 'move-built-up-error' : undefined}/></label>{error && <span id="move-built-up-error" className="input-error spending-field-error">{error}</span>}</div>
    </form>
  </Sheet>
}
