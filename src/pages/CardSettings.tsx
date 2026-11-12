import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Plus, X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState, ListRow, Sheet } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { addDays, cardDraftErrors, cardFromDraft, cardRemovable, cardTracker, closeDateFor, draftFromCard, localDate, removeCard, saveCard, shiftMonth, type CardAccount, type CardDraft, type CardDraftErrors } from '../domain/cardTracker'
import { potPhrase } from '../domain/setAside'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { shortAccountLabels } from './budgetLabels'
import { destinationGroups, ordinal, shortDate } from './cardLabels'
import { statementName } from './spendingFormat'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; today?: string; notify?: (message: string) => void }

/** A worked example for the entered days, so a typo shows before saving: "Statements run from the 25th to the 24th." */
function previewFor(draft: CardDraft) {
  const closeDay = Number(draft.closeDay), dueDays = Number(draft.dueDays)
  const validClose = /^\d+$/.test(draft.closeDay.trim()) && closeDay >= 1 && closeDay <= 28
  const validDue = /^\d+$/.test(draft.dueDays.trim()) && dueDays >= 1 && dueDays <= 60
  if (!validClose) return ''
  const example = `2026-11-${String(closeDay).padStart(2, '0')}`
  const runs = `Statements run from the ${ordinal(closeDay === 28 ? 1 : closeDay + 1)} to the ${ordinal(closeDay)}.`
  return validDue ? `${runs} The ${shortDate(example)} statement is due ${shortDate(addDays(example, dueDays))}.` : runs
}

/** The statements a set-aside pot can start from: the two before the open one, the open one and the next. */
function statementChoices(closeDayText: string, today: string): Array<{ closeDate: string; label: string }> {
  const closeDay = Number(closeDayText)
  if (!/^\d+$/.test(closeDayText.trim()) || closeDay < 1 || closeDay > 28) return []
  const open = closeDateFor(today, closeDay)
  return [-2, -1, 0, 1].map(by => {
    const closeDate = `${shiftMonth(open.slice(0, 7), by)}-${String(closeDay).padStart(2, '0')}`
    return { closeDate, label: `${statementName(closeDate)}${by === 0 ? ' (open now)' : ''}` }
  })
}

/** The card form: the closing day and days until due are required, with no defaults. Rendered in a Sheet. */
function CardForm({ document, card, today, formId, title, onSaved }: { document: BudgetDocument; card?: CardAccount; today: string; formId: string; title: string; onSaved: (card: CardAccount) => void }) {
  const id = useId()
  const { accounts } = document.budget
  const adults = document.household.adults
  const accountNames = shortAccountLabels(accounts, adults)
  const [draft, setDraft] = useState<CardDraft>(() => draftFromCard(card, document.budget))
  const [errors, setErrors] = useState<CardDraftErrors>({})
  const save = (event: FormEvent) => {
    event.preventDefault()
    const found = cardDraftErrors(draft, document.budget)
    setErrors(found)
    if (Object.keys(found).length) return
    onSaved(cardFromDraft(draft, card?.id ?? crypto.randomUUID()))
  }
  const potLabel = (potId: string) => { const pot = document.budget.pots.find(row => row.id === potId); return pot ? `${pot.name} · ${accountNames.get(pot.accountId) ?? 'Account'}` : 'Pot' }
  /** Editing a field clears its error until the next save. */
  const update = (next: Partial<CardDraft>, name: keyof CardDraftErrors) => { setDraft({ ...draft, ...next }); if (errors[name]) setErrors(current => { const rest = { ...current }; delete rest[name]; return rest }) }
  const field = (name: keyof CardDraftErrors) => ({ 'aria-invalid': !!errors[name] || undefined, 'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined })
  const error = (name: keyof CardDraftErrors) => errors[name] && <span id={`${id}-${name}-error`} className="input-error card-settings-error">{errors[name]}</span>
  const payFrom = accountNames.get(draft.payFromAccountId)

  return <form id={formId} className="card-settings-form" aria-label={title} onSubmit={save} noValidate>
    <div className="card-settings-field"><label className="setup-field">Name<input data-autofocus value={draft.name} onChange={event => update({ name: event.target.value }, 'name')} {...field('name')}/></label>{error('name')}</div>
    <div className="card-settings-days">
      <div className="card-settings-field"><label className="setup-field">Statement closes on day<input inputMode="numeric" value={draft.closeDay} onChange={event => update({ closeDay: event.target.value }, 'closeDay')} placeholder="1–28" {...field('closeDay')}/></label>{error('closeDay')}</div>
      <div className="card-settings-field"><label className="setup-field">Days until payment is due<input inputMode="numeric" value={draft.dueDays} onChange={event => update({ dueDays: event.target.value }, 'dueDays')} {...field('dueDays')}/></label>{error('dueDays')}</div>
    </div>
    {previewFor(draft) && <p className="card-settings-preview" aria-live="polite">{previewFor(draft)}</p>}
    <div className="card-settings-field"><label className="setup-field">Paid from<select value={draft.payFromAccountId} onChange={event => update({ payFromAccountId: event.target.value }, 'payFromAccountId')} {...field('payFromAccountId')}>
      <option value="">Choose an account</option>
      {accounts.map(account => <option key={account.id} value={account.id}>{accountNames.get(account.id)}</option>)}
    </select></label>{error('payFromAccountId')}</div>
    <label className="setup-field">Buffer for overspends<select value={draft.buffer} onChange={event => setDraft({ ...draft, buffer: event.target.value })}>
      <option value="">{payFrom ? `${payFrom} main balance` : 'The account it’s paid from'}</option>
      {destinationGroups(document).map(group => <optgroup key={group.key} label={group.label}>{group.options.filter(option => option.value !== `account:${draft.payFromAccountId}`).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}
    </select></label>
    <div className="card-settings-field"><label className="setup-field">Set money aside in<select value={draft.setAsidePotId} onChange={event => update({ setAsidePotId: event.target.value, setAsideFrom: draft.setAsideFrom || (statementChoices(draft.closeDay, today).find(choice => choice.label.endsWith('(open now)'))?.closeDate ?? '') }, 'setAside')} {...field('setAside')}>
      <option value="">No pot: settle once per statement</option>
      {document.budget.pots.map(pot => <option key={pot.id} value={pot.id}>{potLabel(pot.id)}</option>)}
    </select></label>{!draft.setAsidePotId && error('setAside')}</div>
    {draft.setAsidePotId && <div className="card-settings-field"><label className="setup-field">Starting with<select value={draft.setAsideFrom} onChange={event => update({ setAsideFrom: event.target.value }, 'setAside')} {...field('setAside')}>
      <option value="">Choose a statement</option>
      {[...statementChoices(draft.closeDay, today), ...draft.setAsideFrom && !statementChoices(draft.closeDay, today).some(choice => choice.closeDate === draft.setAsideFrom) ? [{ closeDate: draft.setAsideFrom, label: statementName(draft.setAsideFrom) }] : []].map(choice => <option key={choice.closeDate} value={choice.closeDate}>{choice.label}</option>)}
    </select></label>{error('setAside')}</div>}
    <p className="card-settings-preview">{draft.setAsidePotId ? `As you review, move each pot’s share into ${potPhrase(document.budget.pots.find(pot => pot.id === draft.setAsidePotId)?.name ?? 'Amex')}. The bill is paid from it.` : `Each statement’s shares go to ${payFrom ?? 'the account it’s paid from'} once it closes, then you pay the bill.`}</p>
    <fieldset className="card-settings-holders" aria-describedby={errors.cardholders ? `${id}-cardholders-error` : undefined}>
      <legend>Whose card is whose</legend>
      {draft.cardholders.map((row, index) => <div key={index} className="card-settings-holder">
        <label className="setup-field">Card ending<input inputMode="numeric" value={row.suffix} onChange={event => setDraft({ ...draft, cardholders: draft.cardholders.map((other, at) => at === index ? { ...other, suffix: event.target.value } : other) })} aria-invalid={!!errors.cardholders || undefined}/></label>
        <label className="setup-field">Card member<select value={row.personId} onChange={event => setDraft({ ...draft, cardholders: draft.cardholders.map((other, at) => at === index ? { ...other, personId: event.target.value } : other) })}>
          <option value="">Choose</option>{adults.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select></label>
        <button type="button" className="card-settings-remove" aria-label={`Remove card ending ${row.suffix || index + 1}`} onClick={() => setDraft({ ...draft, cardholders: draft.cardholders.filter((_, at) => at !== index) })}><X aria-hidden="true"/></button>
      </div>)}
      {error('cardholders')}
      <button type="button" className="text-button" onClick={() => setDraft({ ...draft, cardholders: [...draft.cardholders, { suffix: '', personId: '' }] })}>Add a card ending</button>
    </fieldset>
  </form>
}

/**
 * Settings › Cards: one row per card ("Closes on the 24th · due 25 days later · paid from …"), with Edit and
 * Remove under ⋯, and "Add a card". The form opens in a Sheet.
 */
export function CardSettings({ document, setDocument, today = localDate(), notify = () => {} }: Props) {
  const formId = useId()
  const tracker = cardTracker(document)
  const { accounts } = document.budget
  const adults = document.household.adults
  const accountNames = shortAccountLabels(accounts, adults)
  const [editing, setEditing] = useState<CardAccount | 'new' | null>(null)
  const [removing, setRemoving] = useState<CardAccount | null>(null)
  const summary = (card: CardAccount) => `Closes on the ${ordinal(card.closeDay)} · due ${card.dueDaysAfterClose} days later · paid from ${card.setAside ? potPhrase(document.budget.pots.find(pot => pot.id === card.setAside!.potId)?.name ?? 'Amex') : accountNames.get(card.payFromAccountId) ?? 'an account'}${card.setAside ? ` from the ${statementName(card.setAside.fromCloseDate)}` : ''}`
  const holders = (card: CardAccount) => card.cardholders.length
    ? card.cardholders.map(row => `${adults.find(person => person.id === row.personId)?.name ?? 'Someone'} ··${row.suffix}`).join(' · ')
    : 'No card endings yet. North asks when it first sees one.'
  const title = editing === 'new' ? 'Add a card' : editing ? `Edit ${editing.name}` : ''

  if (!accounts.length) return <EmptyState title="No accounts yet">Add an account first. A card is paid from one of them.</EmptyState>
  return <div className="card-settings">
    {tracker.cards.length > 0 ? <ul className="settings-list" aria-label="Cards">{tracker.cards.map(card => <li key={card.id}>
      <ListRow title={card.name} meta={`${summary(card)} · ${holders(card)}`} trailing={<BudgetOptionsMenu row label={`More actions for ${card.name}`} options={[
        { label: 'Edit', onSelect: () => setEditing(card) },
        ...cardRemovable(tracker, card.id) ? [{ label: 'Remove', onSelect: () => setRemoving(card) }] : [],
      ]}/>}/>
    </li>)}</ul> : <EmptyState title="No cards yet">Add a credit card to bring in its statements and settle up.</EmptyState>}
    <div className="settings-list-actions"><button type="button" className="secondary-button" onClick={() => setEditing('new')}><Plus aria-hidden="true"/>Add a card</button></div>
    {editing && <Sheet title={title} size="lg" onClose={() => setEditing(null)} footer={<>
      <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
      <button type="submit" form={formId} className="primary-button">Save card</button>
    </>}>
      <CardForm document={document} card={editing === 'new' ? undefined : editing} today={today} formId={formId} title={title} onSaved={card => { setDocument(current => saveCard(current, card)); setEditing(null); notify(`${card.name} saved.`) }}/>
    </Sheet>}
    {removing && <ConfirmDialog title={`Remove ${removing.name}?`} confirmLabel="Remove card" danger onCancel={() => setRemoving(null)} onConfirm={() => { setDocument(current => removeCard(current, removing.id)); setRemoving(null); notify(`${removing.name} removed.`) }}>
      <p>It has no transactions or statements yet, so nothing else changes.</p>
    </ConfirmDialog>}
  </div>
}
