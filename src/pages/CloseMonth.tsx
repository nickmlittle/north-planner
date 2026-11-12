import { useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowLeft, Check, TriangleAlert } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import { StepRow } from '../components/ui/StepRow'
import { useStepCopy } from '../components/ui/useStepCopy'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, destinationKey, firstDayOf, lastDayOf, parseDestinationValue, parsePence, shiftMonth, type CoverSource } from '../domain/cardTracker'
import { closeMonth, closeMonthPlan, keepBuiltUp, markAllIn, moveBuiltUp, setCover, setCoverTick, type Leftover, type Overspend } from '../domain/monthStages'
import { formatMonth } from '../formatting/month'
import { shortAccountLabels } from './budgetLabels'
import { dayDate, destinationNamer, shortDate } from './cardLabels'
import { dayOf, pounds, signedPounds } from './spendingFormat'

const monthName = (month: string) => formatMonth(month).split(' ')[0]!
const sourceValue = (source: CoverSource) => source.kind === 'next-month' ? 'next-month' : destinationKey(source)

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; today: string; onBack: () => void; onSort: () => void; onBringIn: () => void; now?: () => Date }

/** Close <Month> (D7, D8, D11, R1): cover each overspend, see the leftovers build up, and close with one button (board 2, screen 3). */
export function CloseMonth({ document, setDocument, month, today, onBack, onSort, onBringIn, now = () => new Date() }: Props) {
  const plan = closeMonthPlan(document, month, today)
  const [moving, setMoving] = useState<Leftover | null>(null)
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
    return ''
  }
  const closed = !!plan.closedAt

  return <div className="close-month">
    {copiedStatus}
    <button type="button" className="text-button spending-back" onClick={onBack}><ArrowLeft aria-hidden="true"/>Back to {name}</button>
    <div className="statement-heading"><h2 id="close-title">Close {name}</h2><p className="spending-facts">{shortDate(firstDayOf(month))} – {shortDate(lastDayOf(month))}{readiness.toSort === 0 && (readiness.postingsIn || readiness.allIn) ? ' · all transactions in and sorted' : ''}</p></div>

    {closed && <div className="transfer-done-banner" role="status"><span className="transfer-done-icon" aria-hidden="true"><Check/></span><span><strong>{name} is closed</strong><span>Closed {dayOf(plan.closedAt!)}.{plan.changedSinceClosed.length ? ' Something changed since, so close it again.' : ''}</span></span></div>}
    {!closed && !readiness.canClose && <ul className="statement-checks close-checks">
      {today <= lastDayOf(month) && <li className="is-todo"><TriangleAlert aria-hidden="true"/><span>{name} ends on {dayDate(lastDayOf(month))}.</span></li>}
      {readiness.toSort > 0 && <li className="is-todo"><TriangleAlert aria-hidden="true"/><span>{readiness.toSort} {name} {readiness.toSort === 1 ? 'transaction' : 'transactions'} to sort</span><button type="button" className="text-button" onClick={onSort}>Sort them</button></li>}
      {today > lastDayOf(month) && !readiness.postingsIn && !readiness.allIn && <li className="is-todo"><TriangleAlert aria-hidden="true"/><span>{readiness.lastImportDate ? `Last brought in ${dayOf(readiness.lastImportDate)}.` : 'Nothing brought in yet.'} Late {name} transactions can take a few days to post.</span>
        <button type="button" className="text-button" onClick={onBringIn}>Bring in transactions</button><button type="button" className="text-button" onClick={() => setDocument(current => markAllIn(current, month, now()))}>All {name} transactions are in</button></li>}
    </ul>}

    <section className="spending-month-summary" aria-labelledby="close-over">
      <h3 className="spending-eyebrow" id="close-over">Over plan · {plan.overspends.length}</h3>
      {!plan.overspends.length ? <p className="spending-facts">No pot went over in {name}.</p> : plan.overspends.map(overspend => {
        const text = stepText(overspend)
        return <div key={overspend.potId} className="close-cover">
          <p className="close-cover-head"><strong>{destination({ kind: 'pot', potId: overspend.potId })}</strong><span className="spending-pot-status is-over">{pounds(overspend.overPence)} over</span></p>
          <label className="spending-field">Covered from<select value={sourceValue(overspend.cover.source)} onChange={event => {
            const value = event.target.value
            const source: CoverSource | undefined = value === 'next-month' ? { kind: 'next-month' } : parseDestinationValue(value)
            if (source) setDocument(current => setCover(current, month, { potId: overspend.potId, amountPence: overspend.overPence, source }))
          }}>{overspend.options.map(option => <option key={sourceValue(option.source)} value={sourceValue(option.source)}>{option.source.kind === 'next-month' ? `${nextName}’s ${potName(overspend.potId)} (moves no money)` : sourceLabel(option.source, option.leftPence)}</option>)}</select></label>
          {overspend.cover.source.kind === 'next-month'
            ? <p className="spending-facts">Leaves {potName(overspend.potId)} {pounds(overspend.overPence)} short in {nextName}.</p>
            : <ol className="step-list close-cover-step"><StepRow stepKey={overspend.stepKey} name={text} amountPence={overspend.cover.amountPence} ticks={record?.coverTicks} onCopy={pence => void copy(pence)}
              onTick={(_, amountPence) => setDocument(current => setCoverTick(current, month, overspend.potId, amountPence, now()))} changedNote={tickedPence => <>Changed since ticked: it was {pounds(tickedPence)}, it’s now {pounds(overspend.cover.amountPence)}.</>}/></ol>}
        </div>
      })}
    </section>

    {plan.leftovers.length > 0 && <section className="spending-month-summary" aria-labelledby="close-left">
      <h3 className="spending-eyebrow" id="close-left">Money left · stays in the pot</h3>
      <dl className="carry-over-sums close-left"><div className="close-left-head"><dt>Pot</dt><dd><span>Left</span><span>Built up</span></dd></div>
        {plan.leftovers.map(row => <div key={row.potId}><dt>{destination({ kind: 'pot', potId: row.potId })}</dt><dd><span>{pounds(row.leftPence)}</span><span>{pounds(row.builtUpPence)}</span></dd></div>)}</dl>
      {plan.leftovers.filter(row => row.flag).map(row => <div key={row.potId} className="spending-callout close-flag"><TriangleAlert aria-hidden="true"/><div>
        <p>{potName(row.potId)} has built up {pounds(row.builtUpPence)}, more than {pounds(row.flag!.limitPence)} ({row.flag!.limitPence / row.plannedPence}× its {pounds(row.plannedPence)} monthly plan). Move some?</p>
        <div className="close-flag-actions"><button type="button" className="secondary-button" onClick={() => setMoving(row)}>Move {pounds(row.flag!.movePence)}…</button><button type="button" className="text-button" onClick={() => setDocument(current => keepBuiltUp(current, row.potId, row.builtUpPence))}>Keep it</button></div>
      </div></div>)}
    </section>}

    {plan.carryOver.length > 0 && <section className="spending-month-summary" aria-labelledby="close-carry">
      <h3 className="spending-eyebrow" id="close-carry">Carry-over pots</h3>
      <dl className="carry-over-sums">{plan.carryOver.map(row => <div key={row.potId}><dt>{destination({ kind: 'pot', potId: row.potId })}{row.checkedAt ? ` · checked ${dayOf(row.checkedAt)}` : ''}</dt><dd>{row.freePence === undefined ? 'Not checked' : `${signedPounds(row.freePence)} free`}</dd></div>)}</dl>
    </section>}

    {plan.changedSinceClosed.length > 0 && <div className="spending-callout"><TriangleAlert aria-hidden="true"/><div><p>Changed since closed: {plan.changedSinceClosed.map(row => `${destination(row.destination)} ${pounds(row.closedPence)} → ${pounds(row.nowPence)}`).join(', ')}.</p></div></div>}
    <div className="statement-settle">
      <button type="button" className="primary-button" disabled={!closed && !readiness.canClose} onClick={() => setDocument(current => closeMonth(current, month, today, now()))}>{closed ? `Close ${name} again` : `Close ${name}`}</button>
    </div>
    {moving && <MoveBuiltUp potName={potName(moving.potId)} suggested={moving.flag?.movePence ?? 0} onClose={() => setMoving(null)} onSave={pence => { setDocument(current => moveBuiltUp(current, moving.potId, pence, now())); setMoving(null) }}/>}
  </div>
}

/** "Move £X…": record built-up money moved elsewhere; the move itself happens in the bank. */
function MoveBuiltUp({ potName, suggested, onSave, onClose }: { potName: string; suggested: number; onSave: (pence: number) => void; onClose: () => void }) {
  const [value, setValue] = useState((suggested / 100).toFixed(2))
  const [error, setError] = useState('')
  return <ModalDialog title={`Move money out of ${potName}`} onClose={onClose} className="check-balance-sheet">
    <form className="spending-form" noValidate onSubmit={event => { event.preventDefault(); const pence = parsePence(value); if (pence === null || pence <= 0) { setError('Enter an amount, like 100.00.'); return } onSave(pence) }}>
      <p className="spending-facts">Move it in your banking app, then record it here so the build-up starts again.</p>
      <div className="spending-field-wrap"><label className="spending-field">Amount moved<input inputMode="decimal" value={value} data-autofocus onChange={event => setValue(event.target.value)} aria-invalid={!!error || undefined} aria-describedby={error ? 'move-built-up-error' : undefined}/></label>{error && <span id="move-built-up-error" className="input-error spending-field-error">{error}</span>}</div>
      <div className="spending-form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Record the move</button></div>
    </form>
  </ModalDialog>
}
