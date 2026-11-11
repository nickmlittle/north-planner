import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, ChevronDown, ChevronRight, Split } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, defaultRuleText, normaliseDescription, sameDestination, type CardTransaction } from '../domain/cardTracker'
import { addRule, sortDestination, sortTransaction, suggestions, unsortTransaction, updateRule, type SuggestionReason } from '../domain/cardSorting'
import { refundPlan, refundPurchase, sortRefund, type RefundChoice } from '../domain/cardRefunds'
import { formatMonth } from '../formatting/month'
import { shortDate } from './cardLabels'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { destinationGroups, destinationNamer } from './cardLabels'
import { pounds, signedPounds, transactionMeta } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  transaction: CardTransaction
  onClose: () => void
  /** After placing it: what to announce. */
  onSorted: (message: string) => void
  /** "Split across pots": open the split editor instead. */
  onSplit?: () => void
  now?: () => Date
}

/** How many suggestions show before "All pots and accounts". */
const SHOWN = 6

/** Sort one transaction: one tap on a suggestion places it. "Always" makes a rule in place. */
export function SortSheet({ document, setDocument, transaction, onClose, onSorted, onSplit, now = () => new Date() }: Props) {
  const id = useId()
  const name = destinationNamer(document)
  const tracker = cardTracker(document)
  const person = document.household.adults.find(adult => adult.id === transaction.personId)?.name
  const rule = transaction.sort?.by === 'rule' ? tracker.rules.find(row => row.id === transaction.sort?.ruleId) : undefined
  const current = sortDestination(transaction.sort)
  const [always, setAlways] = useState(false)
  const [ruleText, setRuleText] = useState(defaultRuleText(transaction.merchant))
  const [onlyThisCard, setOnlyThisCard] = useState(false)
  const [changeRule, setChangeRule] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState('')
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

  const place = (destination: BudgetDestination) => {
    if (purchase && !always) { placeRefund(plan?.kind === 'single' && plan.lineIndex !== undefined && sameDestination(destination, plan.destination) ? { lineIndex: plan.lineIndex } : { destination }, name(destination)); return }
    const at = now()
    const lines = [{ amountPence: transaction.amountPence, destination }]
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
    onSorted(message)
  }
  const option = (destination: BudgetDestination, sub?: string) => {
    const selected = sameDestination(destination, current)
    return <li key={`${destination.kind}:${destination.kind === 'pot' ? destination.potId : destination.accountId}`}><button type="button" className="sort-option" aria-pressed={selected} onClick={() => place(destination)}>
      <span className="sort-option-text"><span className="sort-option-name">{name(destination)}</span>{sub && <span className="sort-option-sub">{sub}</span>}</span>
      {selected && <Check aria-hidden="true"/>}
    </button></li>
  }
  const groups = destinationGroups(document).map(group => ({ ...group, options: group.options.filter(row => !filter.trim() || row.label.toLocaleLowerCase('en-GB').includes(filter.trim().toLocaleLowerCase('en-GB'))) })).filter(group => group.options.length)

  return <ModalDialog title={`Sort ${transaction.description}`} onClose={onClose} className="sort-sheet">
    <p className="sort-sheet-summary"><strong>{signedPounds(transaction.amountPence)}</strong><span>{transactionMeta(document, transaction)}{transaction.kind === 'refund' ? ' · refund' : ''}</span></p>
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
