import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, ListRow, Sheet } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, destinationKey, parseDestinationValue, type SortRule } from '../domain/cardTracker'
import { deleteRule, moveRule, ruleUses, updateRule } from '../domain/cardSorting'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { destinationGroups, destinationNamer } from './cardLabels'
import { plural } from './spendingFormat'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; notify?: (message: string) => void }
type Editing = { id: string; contains: string; cardSuffix: string; destination: string; error?: string }

/**
 * Settings › Sorting rules: plain text, checked in one glance, applied top to bottom. Each row's ⋯ edits (in a
 * Sheet), moves or deletes it; ⌥↑ and ⌥↓ move the row that has focus.
 */
export function RulesPanel({ document, setDocument, notify = () => {} }: Props) {
  const formId = useId()
  const tracker = cardTracker(document)
  const name = destinationNamer(document)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<SortRule | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const refocus = useRef<string | null>(null)
  const holders = tracker.cards.flatMap(card => card.cardholders)
  const person = (suffix: string) => document.household.adults.find(adult => adult.id === holders.find(row => row.suffix === suffix)?.personId)?.name
  const where = (rule: SortRule) => rule.destination ? name(rule.destination) : `Split · ${(rule.split ?? []).map(part => `${part.percent}% ${name(part.destination)}`).join(', ')}`
  // A moved row's ⋯ keeps focus, so ⌥↑ can be pressed again.
  useEffect(() => {
    if (!refocus.current) return
    list.current?.querySelector<HTMLElement>(`[data-rule="${CSS.escape(refocus.current)}"] .budget-options-trigger`)?.focus()
    refocus.current = null
  })

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    const destination = parseDestinationValue(editing.destination)
    if (!editing.contains.trim() || !destination) { setEditing({ ...editing, error: 'Enter the matching text and choose where it goes.' }); return }
    setDocument(current => updateRule(current, editing.id, { contains: editing.contains, destination, ...(editing.cardSuffix ? { cardSuffix: editing.cardSuffix } : {}) }))
    setEditing(null); notify('Rule saved.')
  }
  const move = (rule: SortRule, by: -1 | 1) => { setDocument(current => moveRule(current, rule.id, by)); refocus.current = rule.id; notify(`Moved “${rule.contains}” ${by < 0 ? 'up' : 'down'}.`) }
  const onRowKey = (event: KeyboardEvent, rule: SortRule, index: number) => {
    if (event.defaultPrevented || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    const by = event.key === 'ArrowUp' ? -1 : 1
    if (index + by < 0 || index + by >= tracker.rules.length) return
    event.preventDefault(); move(rule, by)
  }
  const edit = (rule: SortRule) => setEditing({ id: rule.id, contains: rule.contains, cardSuffix: rule.cardSuffix ?? '', destination: destinationKey(rule.destination!) })

  if (!tracker.rules.length) return <EmptyState title="No sorting rules yet">Tick “Always put … in this pot” when you sort a transaction to make one.</EmptyState>
  return <div className="rules-panel">
    <p className="settings-lead">The first rule that matches sorts a transaction.</p>
    <ul ref={list} className="settings-list" aria-label="Sorting rules">{tracker.rules.map((rule, index) => <li key={rule.id} data-rule={rule.id} onKeyDown={event => onRowKey(event, rule, index)}>
      <ListRow title={`“${rule.contains}” → ${where(rule)}`} meta={`${rule.cardSuffix ? `Only ${person(rule.cardSuffix) ?? 'card'} ··${rule.cardSuffix} · ` : ''}Sorted ${plural(ruleUses(tracker, rule.id), 'transaction')}`}
        trailing={<BudgetOptionsMenu row label={`More actions for the rule for ${rule.contains}`} options={[
          ...rule.destination ? [{ label: 'Edit', onSelect: () => edit(rule) }] : [],
          { label: 'Move up', disabled: index === 0, onSelect: () => move(rule, -1) },
          { label: 'Move down', disabled: index === tracker.rules.length - 1, onSelect: () => move(rule, 1) },
          { label: 'Delete', onSelect: () => setDeleting(rule) },
        ]}/>}/>
    </li>)}</ul>
    {editing && <Sheet title={`Edit the rule for ${tracker.rules.find(rule => rule.id === editing.id)?.contains ?? editing.contains}`} onClose={() => setEditing(null)} footer={<>
      <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
      <button type="submit" form={formId} className="primary-button">Save rule</button>
    </>}>
      <form id={formId} className="spending-form rule-form" onSubmit={save} aria-label={`Edit the rule for ${tracker.rules.find(rule => rule.id === editing.id)?.contains ?? editing.contains}`}>
        <label className="spending-field">Matching text<input data-autofocus value={editing.contains} onChange={event => setEditing({ ...editing, contains: event.target.value })}/></label>
        <label className="spending-field">Card<select value={editing.cardSuffix} onChange={event => setEditing({ ...editing, cardSuffix: event.target.value })}>
          <option value="">Any card</option>{holders.map(row => <option key={row.suffix} value={row.suffix}>Only {person(row.suffix) ?? 'card'} ··{row.suffix}</option>)}
        </select></label>
        <label className="spending-field">Sort to<select value={editing.destination} onChange={event => setEditing({ ...editing, destination: event.target.value })}>
          {destinationGroups(document).map(group => <optgroup key={group.key} label={group.label}>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
        </select></label>
        {editing.error && <p className="input-error" role="alert">{editing.error}</p>}
      </form>
    </Sheet>}
    {deleting && <ConfirmDialog title={`Delete the rule for “${deleting.contains}”?`} confirmLabel="Delete rule" danger onCancel={() => setDeleting(null)} onConfirm={() => { setDocument(current => deleteRule(current, deleting.id)); setDeleting(null); notify('Rule deleted.') }}>
      <p>Transactions it already sorted stay where they are.</p>
    </ConfirmDialog>}
  </div>
}
