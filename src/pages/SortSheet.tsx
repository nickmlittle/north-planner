import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, defaultRuleText, normaliseDescription, sameDestination, type CardTransaction } from '../domain/cardTracker'
import { addRule, sortDestination, sortTransaction, suggestions, unsortTransaction, updateRule, type SuggestionReason } from '../domain/cardSorting'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { destinationGroups, destinationNamer } from './cardLabels'
import { signedPounds, transactionMeta } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  transaction: CardTransaction
  onClose: () => void
  /** After placing it: what to announce. */
  onSorted: (message: string) => void
  now?: () => Date
}

/** How many suggestions show before "All pots and accounts". */
const SHOWN = 6

/** Sort one transaction: one tap on a suggestion places it. "Always" makes a rule in place. */
export function SortSheet({ document, setDocument, transaction, onClose, onSorted, now = () => new Date() }: Props) {
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
  const options = suggestions(document, transaction).slice(0, SHOWN)
  const reason = (value: SuggestionReason) => value === 'last-used' ? 'Used last time' : value === 'own' ? `${person ?? 'Their'}’s card` : value === 'joint' ? 'Joint' : value === 'joint-account' ? 'One-offs' : 'Buffer'
  const merchant = transaction.merchant || normaliseDescription(transaction.description)

  const place = (destination: BudgetDestination) => {
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
    {rule ? <div className="sort-rule-note">
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
    <ul className="sort-options" aria-label="Suggested pots and accounts">{options.map((row, index) => option(row.destination, `${index === 0 ? 'Suggested · ' : ''}${reason(row.reason)}`))}</ul>
    <button type="button" className="text-button sort-all-toggle" aria-expanded={showAll} aria-controls={`${id}-all`} onClick={() => setShowAll(value => !value)}>{showAll ? <ChevronDown aria-hidden="true"/> : <ChevronRight aria-hidden="true"/>}All pots and accounts</button>
    {showAll && <div id={`${id}-all`} className="sort-all">
      <label className="spending-field">Find a pot or account<input type="search" value={filter} onChange={event => setFilter(event.target.value)}/></label>
      {groups.map(group => <section key={group.key} aria-label={group.label}><h3 className="sort-group-heading">{group.label}</h3><ul className="sort-options">{group.options.map(row => option(row.destination))}</ul></section>)}
      {!groups.length && <p className="spending-none">No pot or account matches “{filter.trim()}”.</p>}
    </div>}
    {transaction.sort && <button type="button" className="text-button sort-unsort" onClick={() => { setDocument(latest => unsortTransaction(latest, transaction.id)); onSorted(`${transaction.description} is back in To sort.`) }}>Move back to To sort</button>}
  </ModalDialog>
}
