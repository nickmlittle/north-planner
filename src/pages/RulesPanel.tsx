import { useId, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, destinationKey, parseDestinationValue, type SortRule } from '../domain/cardTracker'
import { deleteRule, moveRule, ruleUses, updateRule } from '../domain/cardSorting'
import { destinationGroups, destinationNamer } from './cardLabels'
import { plural } from './spendingFormat'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; headingExtra?: ReactNode }

/** Rules: plain text, checked in one glance, applied top to bottom. Edit, reorder or delete. */
export function RulesPanel({ document, setDocument, headingExtra }: Props) {
  const id = useId()
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const [editing, setEditing] = useState<{ id: string; contains: string; cardSuffix: string; destination: string; error?: string } | null>(null)
  const [deleting, setDeleting] = useState<SortRule | null>(null)
  const [message, setMessage] = useState('')
  const holders = tracker.cards.flatMap(card => card.cardholders)
  const person = (suffix: string) => document.household.adults.find(adult => adult.id === holders.find(row => row.suffix === suffix)?.personId)?.name
  const where = (rule: SortRule) => rule.destination ? name(rule.destination) : `Split · ${(rule.split ?? []).map(part => `${part.percent}% ${name(part.destination)}`).join(', ')}`

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const destination = parseDestinationValue(editing.destination)
    if (!editing.contains.trim() || !destination) { setEditing({ ...editing, error: 'Enter the matching text and choose where it goes.' }); return }
    setDocument(current => updateRule(current, editing.id, { contains: editing.contains, destination, ...(editing.cardSuffix ? { cardSuffix: editing.cardSuffix } : {}) }))
    setEditing(null); setMessage('Rule saved.')
  }
  const move = (rule: SortRule, by: -1 | 1) => { setDocument(current => moveRule(current, rule.id, by)); setMessage(`Moved “${rule.contains}” ${by < 0 ? 'up' : 'down'}.`) }

  return <section className="spending-panel rules-panel" aria-labelledby={`${id}-title`}>
    <div className="spending-section-heading"><h2 id={`${id}-title`}>Sorting rules</h2><span>{tracker.rules.length ? plural(tracker.rules.length, 'rule') : ''}</span>{headingExtra}</div>
    {tracker.rules.length > 0 && <p className="rules-lead">The first rule that matches sorts a transaction.</p>}
    <p className="visually-hidden" role="status">{message}</p>
    {!tracker.rules.length ? <p className="spending-none">No rules yet. Tick “Always put … in this pot” when you sort a transaction.</p>
      : <ol className="spending-list rules-list">{tracker.rules.map((rule, index) => <li key={rule.id}>
        {editing?.id === rule.id ? <form className="spending-form rule-form" onSubmit={save} aria-label={`Edit the rule for ${rule.contains}`}>
          <label className="spending-field">Matching text<input value={editing.contains} onChange={event => setEditing({ ...editing, contains: event.target.value })}/></label>
          <label className="spending-field">Card<select value={editing.cardSuffix} onChange={event => setEditing({ ...editing, cardSuffix: event.target.value })}>
            <option value="">Any card</option>{holders.map(row => <option key={row.suffix} value={row.suffix}>Only {person(row.suffix) ?? 'card'} ··{row.suffix}</option>)}
          </select></label>
          <label className="spending-field">Sort to<select value={editing.destination} onChange={event => setEditing({ ...editing, destination: event.target.value })}>
            {destinationGroups(document).map(group => <optgroup key={group.key} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
          </select></label>
          {editing.error && <p className="input-error" role="alert">{editing.error}</p>}
          <div className="spending-form-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button">Save rule</button></div>
        </form> : <div className="rule-row">
          <div className="rule-row-text"><span className="rule-row-main">“{rule.contains}” → {where(rule)}</span><span className="rule-row-meta">{rule.cardSuffix ? `Only ${person(rule.cardSuffix) ?? 'card'} ··${rule.cardSuffix} · ` : ''}Sorted {plural(ruleUses(tracker, rule.id), 'transaction')}</span></div>
          <div className="rule-row-actions">
            {rule.destination && <button type="button" className="icon-button" aria-label={`Edit the rule for ${rule.contains}`} onClick={() => setEditing({ id: rule.id, contains: rule.contains, cardSuffix: rule.cardSuffix ?? '', destination: destinationKey(rule.destination!) })}><Pencil aria-hidden="true"/></button>}
            <button type="button" className="icon-button" aria-label={`Move the rule for ${rule.contains} up`} disabled={index === 0} onClick={() => move(rule, -1)}><ArrowUp aria-hidden="true"/></button>
            <button type="button" className="icon-button" aria-label={`Move the rule for ${rule.contains} down`} disabled={index === tracker.rules.length - 1} onClick={() => move(rule, 1)}><ArrowDown aria-hidden="true"/></button>
            <button type="button" className="icon-button" aria-label={`Delete the rule for ${rule.contains}`} onClick={() => setDeleting(rule)}><Trash2 aria-hidden="true"/></button>
          </div>
        </div>}
      </li>)}</ol>}
    {deleting && <ConfirmDialog title={`Delete the rule for “${deleting.contains}”?`} confirmLabel="Delete rule" danger onCancel={() => setDeleting(null)} onConfirm={() => { setDocument(current => deleteRule(current, deleting.id)); setDeleting(null); setMessage('Rule deleted.') }}>
      <p>Transactions it already sorted stay where they are.</p>
    </ConfirmDialog>}
  </section>
}
