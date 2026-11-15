import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, ChevronDown, ChevronRight, Split } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, defaultRuleText, localDate, normaliseDescription, sameDestination, type CardTransaction } from '../domain/cardTracker'
import { addRule, sortDestination, sortTransaction, suggestions, unsortTransaction, updateRule, type SuggestionReason } from '../domain/cardSorting'
import { refundPlan, refundPurchase, sortRefund, type RefundChoice } from '../domain/cardRefunds'
import { formatMonth } from '../formatting/month'
import { shortDate } from './cardLabels'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { destinationGroups, destinationNamer } from './cardLabels'
import { pounds, signedPounds, transactionMeta } from './spendingFormat'
import { pickerPace, placeImpact, type Tipped } from './sortPace'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  transaction: CardTransaction
  onClose: () => void
  /** After placing it: what to announce, and the toast's content when it tipped a pot into ahead or over. */
  onSorted: (message: string, tipped?: Tipped) => void
  /** "Split across pots": open the split editor instead. */
  onSplit?: () => void
  now?: () => Date
  /** For Left and pace against the transaction's month. */
  today?: string
  /** A placed transaction's pot, on Month, for the transaction's month (Spending ↔ Month link F1). */
  onOpenMonth?: (potId: string, month: string) => void
}

/** How many suggestions show before "All pots and accounts". */
const SHOWN = 6

/**
 * Sort one transaction: choose a pot (the suggestion is chosen to start), see what placing it there would change, then
 * Place (board M2). "Always" makes a rule in place. A split refund's parts still place with one tap.
 */
export function SortSheet({ document, setDocument, transaction, onClose, onSorted, onSplit, now = () => new Date(), today = localDate(), onOpenMonth }: Props) {
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
  const reason = (value: SuggestionReason) => value === 'last-used' ? 'Used last time' : value === 'own' ? `${person ?? 'Their'}’s card` : value === 'joint' ? 'Joint' : value === 'joint-account' ? 'One-offs' : 'Buffer'
  const merchant = transaction.merchant || normaliseDescription(transaction.description)
  // A refund goes back against its purchase (§6.4): the same pot, the matching line of a split, or spread across it.
  const purchase = transaction.kind === 'refund' ? refundPurchase(tracker, transaction) : undefined
  const plan = purchase ? refundPlan(purchase, transaction) : undefined
  const refundBack = plan?.kind === 'single' ? plan.destination : undefined
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
    return <li key={`${destination.kind}:${destination.kind === 'pot' ? destination.potId : destination.accountId}`}><button type="button" className="sort-option" aria-pressed={selected} onClick={() => setPicked(destination)}>
      <span className="sort-option-text"><span className="sort-option-name">{name(destination)}</span>{sub && <span className="sort-option-sub">{sub}</span>}</span>
      {(() => { const { text, tone } = pace(destination); return text && <span className={`sort-option-left${tone ? ` is-${tone}` : ''}`}>{text}</span> })()}
      {selected && <Check aria-hidden="true"/>}
    </button></li>
  }
  const groups = destinationGroups(document).map(group => ({ ...group, options: group.options.filter(row => !filter.trim() || row.label.toLocaleLowerCase('en-GB').includes(filter.trim().toLocaleLowerCase('en-GB'))) })).filter(group => group.options.length)

  const footer = <>
    {impact?.text && <p className={`sort-impact${impact.tone ? ` is-${impact.tone}` : ''}`} id={`${id}-impact`}>{impact.text}</p>}
    <button type="button" className="primary-button sort-place" disabled={!chosen || unchanged} aria-describedby={impact?.text ? `${id}-impact` : undefined} onClick={() => { if (chosen) place(chosen) }}>
      {!chosen ? 'Choose a pot or account' : unchanged ? `Already in ${name(chosen)}` : `Place in ${name(chosen)}`}
    </button>
  </>

  return <ModalDialog title={`Sort ${transaction.description}`} onClose={onClose} className="sort-sheet" footer={footer}>
    <p className="sort-sheet-summary"><strong>{signedPounds(transaction.amountPence)}</strong><span>{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span></p>
    {placedPot && onOpenMonth && <button type="button" className="text-button sort-open-month" onClick={() => onOpenMonth(placedPot.id, transaction.date.slice(0, 7))}>Open {placedPot.name} in Month<ChevronRight aria-hidden="true"/></button>}
    {purchase ? null : rule ? <div className="sort-rule-note">
      <p>Sorted by your rule “{rule.contains}”{rule.cardSuffix ? ` on ${person ?? 'this'}’s card` : ''}.</p>
      {rule.destination && <label className="spending-check"><input type="checkbox" checked={changeRule} onChange={event => setChangeRule(event.target.checked)}/>Change the rule too</label>}
    </div> : <div className="sort-always">
      <label className="spending-check"><input type="checkbox" checked={always} onChange={event => setAlways(event.target.checked)} data-autofocus/>Always put {merchant} in this pot</label>
      {always && <div className="sort-always-fields">
        <label className="spending-field">Matching text<input value={ruleText} onChange={event => setRuleText(event.target.value)} aria-describedby={`${id}-match`}/></label>
        <span id={`${id}-match`} className="sort-always-hint">Any transaction whose description contains this.</span>
        {person && <label className="spending-check"><input type="checkbox" checked={onlyThisCard} onChange={event => setOnlyThisCard(event.target.checked)}/>Only on {person}’s card</label>}
      </div>}
    </div>}
    {purchase && <div className="sort-refund">
      <p>{plan?.kind === 'split' ? `Matches the ${purchase.description} purchase on ${shortDate(purchase.date)}, which was split. Which part came back?`
        : `Matches ${purchase.description} ${pounds(purchase.amountPence)} on ${shortDate(purchase.date)}${plan?.kind === 'unsorted' ? ', which isn’t sorted yet' : ''}.`} It counts in {formatMonth(transaction.date.slice(0, 7)).split(' ')[0]}, the month it arrived.</p>
      {plan?.kind === 'split' && <ul className="sort-options" aria-label="Parts of the purchase">
        {purchase.sort!.lines.map((line, index) => <li key={index}><button type="button" className="sort-option" onClick={() => placeRefund({ lineIndex: index }, name(line.destination))}>
          <span className="sort-option-text"><span className="sort-option-name">{line.item ?? line.note ?? name(line.destination)}</span>{(() => { const sub = [line.amountPence === -transaction.amountPence ? 'Exact match' : '', line.item ?? line.note ? name(line.destination) : ''].filter(Boolean).join(' · '); return sub && <span className="sort-option-sub">{sub}</span> })()}</span><span className="sort-option-amount">{pounds(line.amountPence)}</span>
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
    {transaction.sort && <button type="button" className="text-button sort-unsort" onClick={() => { setDocument(latest => unsortTransaction(latest, transaction.id)); onSorted(`${transaction.description} is back in To sort.`) }}>Move back to To sort</button>}
  </ModalDialog>
}
