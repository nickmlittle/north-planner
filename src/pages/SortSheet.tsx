import { isHeld, linkedOrder, ordersWithReturns } from '../domain/expectingBack'
import { ReturnLink } from './ReturnLink'
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, ChevronDown, ChevronRight, Split } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import { useMobilePresentation } from '../components/ui'
import type { GoThrough, GoThroughStep } from '../domain/goThrough'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, collapseWhitespace, defaultRuleText, localDate, normaliseDescription, sameDestination, type CardTransaction, type WaitingOn } from '../domain/cardTracker'
import { addRule, clearWaiting, markWaiting, sortDestination, sortTransaction, suggestions, unsortTransaction, updateRule, type SuggestionReason } from '../domain/cardSorting'
import { refundPlan, refundPurchase, sortRefund, type RefundChoice } from '../domain/cardRefunds'
import { formatMonth } from '../formatting/month'
import { shortDate } from './cardLabels'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { destinationGroups, destinationNamer } from './cardLabels'
import { goThroughTitle, pounds, sameReason, signedPounds, transactionMeta, waitedFor, waitingReason } from './spendingFormat'
import { WaitingFields } from './WaitingList'
import { pickerPace, placeImpact, type Tipped } from './sortPace'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  transaction: CardTransaction
  onClose: () => void
  /** After placing it: what to announce, and the toast's content when it tipped a pot into ahead or over. */
  onSorted: (message: string, tipped?: Tipped) => void
  /** After marking it waiting from To sort (W7): what to announce, and the row, for Undo. Changing a mark uses onSorted. */
  onMarked?: (message: string, id: string) => void
  /** "Split across pots": open the split editor instead. */
  onSplit?: () => void
  now?: () => Date
  /** For Left and pace against the transaction's month. */
  today?: string
  /** A placed transaction's pot, on Month, for the transaction's month (Spending ↔ Month link F1). */
  onOpenMonth?: (potId: string, month: string) => void
  /**
   * Go through them (audit 6, W9): the sheet steps through a waiting group, one row at a time. Placing, a new reason or
   * note, Back to To sort and Skip each move on; the parent passes the next row as `transaction`.
   */
  goThrough?: { state: GoThrough; step: GoThroughStep; onSkip: () => void }
  /** Where focus goes on close when the opener has gone (a go-through that emptied its group). */
  returnFocusTo?: () => HTMLElement | null | undefined
}

/** How many suggestions show before "All pots and accounts". */
const SHOWN = 6

/**
 * Sort one transaction: choose a pot (the suggestion is chosen to start), see what placing it there would change, then
 * Place (board M2). "Always" makes a rule in place. A split refund's parts still place with one tap.
 */
export function SortSheet({ document, setDocument, transaction, onClose, onSorted, onMarked, onSplit, now = () => new Date(), today = localDate(), onOpenMonth, goThrough, returnFocusTo }: Props) {
  const compact = useMobilePresentation()
  // Left and pace for each pot in the transaction's month, so the choice shows its consequence (link F5).
  const pace = pickerPace(document, transaction.date.slice(0, 7), today)
  const id = useId()
  const name = destinationNamer(document)
  const tracker = cardTracker(document)
  const person = document.household.adults.find(adult => adult.id === transaction.personId)?.name
  const rule = transaction.sort?.by === 'rule' ? tracker.rules.find(row => row.id === transaction.sort?.ruleId) : undefined
  const current = sortDestination(transaction.sort)
  const placedPot = current?.kind === 'pot' ? document.budget.pots.find(pot => pot.id === current.potId) : undefined
  const [always, setAlways] = useState(false)
  const [ruleText, setRuleText] = useState(defaultRuleText(transaction.merchant))
  const [onlyThisCard, setOnlyThisCard] = useState(false)
  const [changeRule, setChangeRule] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<BudgetDestination | undefined>()
  // Change on a waiting row (audit 6, waiting/3), or Not ready to sort? on a row in To sort (waiting/4): the reason
  // being chosen. Choosing one swaps the footer to Mark waiting, as choosing a pot does to Place.
  const waiting = transaction.waiting
  const canWait = !waiting && !transaction.sort && transaction.kind !== 'payment'
  const [waitOn, setWaitOn] = useState<WaitingOn | null>(null)
  const [waitNote, setWaitNote] = useState(waiting?.note ?? '')
  // A go-through keeps one sheet open (so a phone's sheet doesn't slide up again for every row) and starts each row
  // afresh: its suggestion chosen, nothing ticked, the lists closed.
  const [rowId, setRowId] = useState(transaction.id)
  if (rowId !== transaction.id) {
    setRowId(transaction.id); setAlways(false); setRuleText(defaultRuleText(transaction.merchant)); setOnlyThisCard(false); setChangeRule(false)
    setShowAll(false); setFilter(''); setPicked(undefined); setWaitOn(null); setWaitNote(waiting?.note ?? '')
  }
  const placeRef = useRef<HTMLButtonElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const firstRow = useRef(true)
  // On to the next row: back to the top, with focus on Place (or Skip when nothing is chosen), so Enter walks the group.
  useEffect(() => {
    if (firstRow.current) { firstRow.current = false; return }
    const body = (placeRef.current ?? skipRef.current)?.closest('.sheet')?.querySelector('.sheet-body')
    if (body) body.scrollTop = 0
    ;(placeRef.current && !placeRef.current.disabled ? placeRef.current : skipRef.current)?.focus()
  }, [transaction.id])
  const waitUnchanged = !!waiting && sameReason(waitOn ?? undefined, waiting.on) && collapseWhitespace(waitNote) === (waiting.note ?? '')
  const saveWaiting = () => {
    if (!waitOn || waitUnchanged) return
    const at = now()
    setDocument(latest => markWaiting(latest, transaction.id, waitOn, waitNote, at))
    const message = `${transaction.description} is waiting: ${waitingReason(document, waitOn)}.`
    if (!waiting && onMarked) onMarked(message, transaction.id)
    else onSorted(message)
  }
  const backToSort = () => { setDocument(latest => clearWaiting(latest, transaction.id)); onSorted(`${transaction.description} is back in To sort.`) }
  const reason = (value: SuggestionReason) => value === 'last-used' ? 'Used last time' : value === 'own' ? `${person ?? 'Their'}’s card` : value === 'joint' ? 'Joint' : value === 'joint-account' ? 'One-offs' : 'Buffer'
  const merchant = transaction.merchant || normaliseDescription(transaction.description)
  // A refund goes back against its purchase (§6.4): the same pot, the matching line of a split, or spread across it.
  const purchase = transaction.kind === 'refund' ? refundPurchase(tracker, transaction) : undefined
  const plan = purchase ? refundPlan(purchase, transaction) : undefined
  const refundBack = plan?.kind === 'single' ? plan.destination : undefined
  // A return for an order with items ticked Back is linked to it instead (health 9b); the plain refund match steps aside.
  const isReturn = transaction.kind === 'refund' && (ordersWithReturns(tracker, transaction, today).length > 0 || !!linkedOrder(tracker, transaction))
  const placeRefund = (choice: RefundChoice, label: string) => {
    if (!purchase) return
    const at = now()
    setDocument(latest => sortRefund(latest, transaction.id, purchase.id, choice, at))
    onSorted(`Sorted to ${label}.`)
  }
  const options = suggestions(document, transaction).filter(row => !sameDestination(row.destination, refundBack)).slice(0, refundBack ? SHOWN - 1 : SHOWN)
  // Choose, then Place (board M2): the chosen pot starts as where it is now, else the suggestion. The impact line
  // above Place says what placing it there would change.
  const chosen = picked ?? current ?? refundBack ?? options[0]?.destination
  const impact = chosen ? placeImpact(document, transaction, chosen, today) : undefined
  const unchanged = !!chosen && sameDestination(chosen, current) && transaction.sort?.lines.length === 1 && !always && !(rule && changeRule)

  const place = (destination: BudgetDestination) => {
    if (purchase && !always) { placeRefund(plan?.kind === 'single' && plan.lineIndex !== undefined && sameDestination(destination, plan.destination) ? { lineIndex: plan.lineIndex } : { destination }, name(destination)); return }
    const at = now()
    const lines = [{ amountPence: transaction.amountPence, destination }]
    const { tipped } = placeImpact(document, transaction, destination, today)
    let message = `Sorted to ${name(destination)}.`
    if (always && ruleText.trim()) {
      const draft = { contains: ruleText, destination, ...(onlyThisCard ? { cardSuffix: transaction.cardSuffix } : {}) }
      const { alsoSorted } = addRule(sortTransaction(document, transaction.id, lines, at), draft, at)
      setDocument(latest => addRule(sortTransaction(latest, transaction.id, lines, at), draft, at).document)
      message += ` New rule for “${normaliseDescription(ruleText)}”${alsoSorted ? `, which sorted ${alsoSorted} more` : ''}.`
    } else if (rule && changeRule && rule.destination) {
      setDocument(latest => updateRule(sortTransaction(latest, transaction.id, lines, at), rule.id, { contains: rule.contains, ...(rule.cardSuffix ? { cardSuffix: rule.cardSuffix } : {}), destination }))
      message += ` The rule for “${rule.contains}” now sorts to it too.`
    } else setDocument(latest => sortTransaction(latest, transaction.id, lines, at))
    onSorted(message, tipped)
  }
  const option = (destination: BudgetDestination, sub?: string) => {
    const selected = sameDestination(destination, chosen)
    return <li key={`${destination.kind}:${destination.kind === 'pot' ? destination.potId : destination.accountId}`}><button type="button" className="sort-option" aria-pressed={selected && !waitOn} onClick={() => { setPicked(destination); setWaitOn(null) }}>
      <span className="sort-option-text"><span className="sort-option-name">{name(destination)}</span>{sub && <span className="sort-option-sub">{sub}</span>}</span>
      {(() => { const { text, tone } = pace(destination); return text && <span className={`sort-option-left${tone ? ` is-${tone}` : ''}`}>{text}</span> })()}
      {selected && !waitOn && <Check aria-hidden="true"/>}
    </button></li>
  }
  const groups = destinationGroups(document).map(group => ({ ...group, options: group.options.filter(row => !filter.trim() || row.label.toLocaleLowerCase('en-GB').includes(filter.trim().toLocaleLowerCase('en-GB'))) })).filter(group => group.options.length)

  const impactLine = impact?.text && <p className={`sort-impact${impact.tone ? ` is-${impact.tone}` : ''}`} id={`${id}-impact`}>{impact.text}</p>
  const placeButton = <button ref={placeRef} type="button" className="primary-button sort-place" disabled={!chosen || unchanged} aria-describedby={impact?.text ? `${id}-impact` : undefined} onClick={() => { if (chosen) place(chosen) }} data-autofocus={goThrough ? true : undefined}>
    {!chosen ? 'Choose a pot or account' : unchanged ? `Already in ${name(chosen)}` : `Place in ${name(chosen)}`}
  </button>
  const next = goThrough?.step.next
  const footer = waitOn ? <button type="button" className="primary-button sort-place" disabled={waitUnchanged} onClick={saveWaiting}>{waitUnchanged ? `Already waiting · ${waitingReason(document, waitOn)}` : `Mark waiting · ${waitingReason(document, waitOn)}`}</button>
    // Go through them (board 3): Skip, then Place, and the next row under them. Back to To sort stays by Change.
    : goThrough ? <div className="sort-go-footer">
      {impactLine}
      <div className="sort-go-actions">
        <button ref={skipRef} type="button" className="secondary-button sort-go-skip" aria-label="Skip, still waiting" onClick={goThrough.onSkip}>{compact ? 'Skip' : 'Skip · still waiting'}</button>
        {placeButton}
      </div>
      {next && <p className="sort-go-next">Next: {[next.description, signedPounds(next.amountPence), !compact && next.waiting?.note ? `“${next.waiting.note}”` : ''].filter(Boolean).join(' · ')}</p>}
    </div>
    : <>{impactLine}{placeButton}</>

  const count = goThrough?.state.ids.length ?? 0
  const position = goThrough?.step.position ?? 0
  return <ModalDialog title={goThrough ? goThroughTitle(document, goThrough.state.scope) : `Sort ${transaction.description}`} onClose={onClose} returnFocusTo={returnFocusTo} className={`sort-sheet${goThrough ? ' sort-go-sheet' : ''}`} footer={footer}
    description={goThrough && `${position} of ${count}${compact ? '' : ` · ${pounds(goThrough.state.totalPence)}`}`}>
    {goThrough && <div className={`sort-go-progress${count > 12 ? ' is-continuous' : ''}`} aria-hidden="true">
      {count > 12 ? <span className="is-on" style={{ width: `${(position / count) * 100}%` }}/> : goThrough.state.ids.map((row, index) => <span key={row} className={index < position ? 'is-on' : undefined}/>)}
    </div>}
    <p className="sort-sheet-summary">{goThrough && <span className="sort-go-name">{transaction.description}</span>}<strong>{signedPounds(transaction.amountPence)}</strong><span>{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span></p>
    {waiting && <section className="sort-waiting" aria-label="Waiting">
      <p className="sort-waiting-head"><strong>Waiting · {waitingReason(document, waiting.on)}</strong><span>{(waited => waited === 'today' ? 'Marked today' : `For ${waited}`)(waitedFor(waiting.at, today))}</span></p>
      {waiting.note && !waitOn && <p className="sort-waiting-note">“{waiting.note}”</p>}
      {waitOn ? <>
        <WaitingFields document={document} transaction={transaction} on={waitOn} note={waitNote} onChangeOn={setWaitOn} onChangeNote={setWaitNote} onSubmit={saveWaiting}/>
        <button type="button" className="text-button sort-waiting-cancel" onClick={() => { setWaitOn(null); setWaitNote(waiting.note ?? '') }}>Cancel</button>
      </> : <div className="sort-waiting-actions">
        <button type="button" className="secondary-button" onClick={() => setWaitOn(waiting.on)} data-autofocus={goThrough ? undefined : true}>Change</button>
        <button type="button" className="text-button" onClick={backToSort}>Back to To sort</button>
      </div>}
    </section>}
    {placedPot && onOpenMonth && <button type="button" className="text-button sort-open-month" onClick={() => onOpenMonth(placedPot.id, transaction.date.slice(0, 7))}>Open {placedPot.name} in Month<ChevronRight aria-hidden="true"/></button>}
    {purchase ? null : rule ? <div className="sort-rule-note">
      <p>Sorted by your rule “{rule.contains}”{rule.cardSuffix ? ` on ${person ?? 'this'}’s card` : ''}.</p>
      {rule.destination && <label className="spending-check"><input type="checkbox" checked={changeRule} onChange={event => setChangeRule(event.target.checked)}/>Change the rule too</label>}
    </div> : <div className="sort-always">
      <label className="spending-check"><input type="checkbox" checked={always} onChange={event => setAlways(event.target.checked)} data-autofocus={waiting ? undefined : true}/>Always put {merchant} in this pot</label>
      {always && <div className="sort-always-fields">
        <label className="spending-field">Matching text<input value={ruleText} onChange={event => setRuleText(event.target.value)} aria-describedby={`${id}-match`}/></label>
        <span id={`${id}-match`} className="sort-always-hint">Any transaction whose description contains this.</span>
        {person && <label className="spending-check"><input type="checkbox" checked={onlyThisCard} onChange={event => setOnlyThisCard(event.target.checked)}/>Only on {person}’s card</label>}
      </div>}
    </div>}
    <ReturnLink document={document} setDocument={setDocument} refund={transaction} today={today} now={now} onLinked={message => onSorted(message)}/>
    {purchase && !isReturn && <div className="sort-refund">
      <p>{plan?.kind === 'split' ? `Matches the ${purchase.description} purchase on ${shortDate(purchase.date)}, which was split. Which part came back?`
        : `Matches ${purchase.description} ${pounds(purchase.amountPence)} on ${shortDate(purchase.date)}${plan?.kind === 'unsorted' ? ', which isn’t sorted yet' : ''}.`} It counts in {formatMonth(transaction.date.slice(0, 7)).split(' ')[0]}, the month it arrived.</p>
      {plan?.kind === 'split' && <ul className="sort-options" aria-label="Parts of the purchase">
        {purchase.sort!.lines.map((line, index) => <li key={index}><button type="button" className="sort-option" onClick={() => placeRefund({ lineIndex: index }, name(line.destination))}>
          <span className="sort-option-text"><span className="sort-option-name">{line.item ?? line.note ?? name(line.destination)}</span>{(() => { const sub = [line.amountPence === -transaction.amountPence ? 'Exact match' : '', line.item ?? line.note ? name(line.destination) : '', isHeld(line) ? 'Expecting back' : ''].filter(Boolean).join(' · '); return sub && <span className="sort-option-sub">{sub}</span> })()}</span><span className="sort-option-amount">{pounds(line.amountPence)}</span>
        </button></li>)}
        <li><button type="button" className="sort-option" onClick={() => placeRefund({ spread: true }, 'each part of the split')}><span className="sort-option-text"><span className="sort-option-name">Spread across the split</span><span className="sort-option-sub">In proportion to each line</span></span></button></li>
      </ul>}
    </div>}
    <ul className="sort-options" aria-label="Suggested pots and accounts">{refundBack && option(refundBack, 'Suggested · Where the purchase went')}{options.map((row, index) => option(row.destination, `${index === 0 && !refundBack ? 'Suggested · ' : ''}${reason(row.reason)}`))}</ul>
    <button type="button" className="text-button sort-all-toggle" aria-expanded={showAll} aria-controls={`${id}-all`} onClick={() => setShowAll(value => !value)}>{showAll ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}All pots and accounts</button>
    {showAll && <div id={`${id}-all`} className="sort-all">
      <label className="spending-field">Find a pot or account<input type="search" value={filter} onChange={event => setFilter(event.target.value)}/></label>
      {groups.map(group => <section key={group.key} aria-label={group.label}><h3 className="sort-group-heading">{group.label}</h3><ul className="sort-options">{group.options.map(row => option(row.destination))}</ul></section>)}
      {!groups.length && <p className="spending-none">No pot or account matches “{filter.trim()}”.</p>}
    </div>}
    {onSplit && <button type="button" className="secondary-button sort-split" onClick={onSplit}><Split aria-hidden="true"/>{transaction.sort && transaction.sort.lines.length > 1 ? 'Change the split' : 'Split across pots'}</button>}
    {canWait && <section className="sort-not-ready" aria-labelledby={`${id}-not-ready`}>
      <div><h3 className="sort-not-ready-title" id={`${id}-not-ready`}>Not ready to sort?</h3><p className="sort-not-ready-hint">It leaves To sort and counts in no pot until it’s sorted.</p></div>
      <WaitingFields document={document} transaction={transaction} on={waitOn ?? undefined} note={waitNote} onSubmit={saveWaiting}
        onChangeOn={on => setWaitOn(current => current && sameReason(current, on) ? null : on)} onChangeNote={setWaitNote}/>
    </section>}
    {transaction.sort && <button type="button" className="text-button sort-unsort" onClick={() => { setDocument(latest => unsortTransaction(latest, transaction.id)); onSorted(`${transaction.description} is back in To sort.`) }}>Move back to To sort</button>}
  </ModalDialog>
}
