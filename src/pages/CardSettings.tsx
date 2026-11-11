import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Plus, X } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { addDays, cardDraftErrors, cardFromDraft, cardTracker, closeDateFor, draftFromCard, localDate, saveCard, shiftMonth, type CardAccount, type CardDraft, type CardDraftErrors } from '../domain/cardTracker'
import { potPhrase } from '../domain/setAside'
import { shortAccountLabels } from './budgetLabels'
import { destinationGroups, ordinal, shortDate } from './cardLabels'
import { statementName } from './spendingFormat'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; today?: string }

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

/** Household → Cards: add or edit a card. The closing day and days until due are required, with no defaults. */
export function CardSettings({ document, setDocument, today = localDate() }: Props) {
  const id = useId()
  const tracker = cardTracker(document)
  const { accounts } = document.budget
  const adults = document.household.adults
  const accountNames = shortAccountLabels(accounts, adults)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [errors, setErrors] = useState<CardDraftErrors>({})
  const [status, setStatus] = useState('')

  const open = (card?: CardAccount) => {
    if (editing === (card?.id ?? 'new')) { close(); return }
    setEditing(card?.id ?? 'new'); setDraft(draftFromCard(card, document.budget)); setErrors({}); setStatus('')
  }
  const close = () => { setEditing(null); setDraft(null); setErrors({}) }
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const found = cardDraftErrors(draft, document.budget)
    setErrors(found)
    if (Object.keys(found).length) return
    const card = cardFromDraft(draft, editing === 'new' || !editing ? crypto.randomUUID() : editing)
    setDocument(current => saveCard(current, card))
    close(); setStatus(`${card.name} saved.`)
  }
  const potLabel = (potId: string) => { const pot = document.budget.pots.find(row => row.id === potId); return pot ? `${pot.name} · ${accountNames.get(pot.accountId) ?? 'Account'}` : 'Pot' }
  const summary = (card: CardAccount) => `Closes on the ${ordinal(card.closeDay)} · due ${card.dueDaysAfterClose} days later · paid from ${card.setAside ? potPhrase(document.budget.pots.find(pot => pot.id === card.setAside!.potId)?.name ?? 'Amex') : accountNames.get(card.payFromAccountId) ?? 'an account'}${card.setAside ? ` from the ${statementName(card.setAside.fromCloseDate)}` : ''}`
  const holders = (card: CardAccount) => card.cardholders.length
    ? card.cardholders.map(row => `${adults.find(person => person.id === row.personId)?.name ?? 'Someone'}’s ends ${row.suffix}`).join(' · ')
    : 'No card endings yet. North asks when it first sees one.'

  /** Editing a field clears its error until the next save. */
  const update = (next: Partial<CardDraft>, name: keyof CardDraftErrors) => { if (draft) setDraft({ ...draft, ...next }); if (errors[name]) setErrors(current => { const rest = { ...current }; delete rest[name]; return rest }) }
  const field = (name: keyof CardDraftErrors) => ({ 'aria-invalid': !!errors[name] || undefined, 'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined })
  const error = (name: keyof CardDraftErrors) => errors[name] && <span id={`${id}-${name}-error`} className="input-error card-settings-error">{errors[name]}</span>
  const payFrom = draft ? accountNames.get(draft.payFromAccountId) : undefined

  const form = draft && <form className="card-settings-form" aria-label={editing === 'new' ? 'Add a card' : `Edit ${draft.name || 'card'}`} onSubmit={save} noValidate>
    <div className="card-settings-field"><label className="setup-field">Name<input value={draft.name} onChange={event => update({ name: event.target.value }, 'name')} {...field('name')}/></label>{error('name')}</div>
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
    <div className="card-settings-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button">Save card</button></div>
  </form>

  return <section className="setup-card card-settings" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Cards</h2>
    {!accounts.length ? <p className="setup-intro">Add an account on the Plan first. A card is paid from one of them.</p> : <>
      {status && <p className="budget-manage-message" role="status">{status}</p>}
      {tracker.cards.length > 0 && <ul className="card-settings-list">{tracker.cards.map(card => <li key={card.id}>
        <div className="card-settings-summary"><strong>{card.name}</strong><span>{summary(card)}</span><span>{holders(card)}</span></div>
        <button type="button" className="secondary-button" aria-expanded={editing === card.id} onClick={() => open(card)}>Edit {card.name}</button>
        {editing === card.id && form}
      </li>)}</ul>}
      {editing === 'new' ? form : <button type="button" className="secondary-button" onClick={() => open()}><Plus aria-hidden="true"/>Add a card</button>}
    </>}
  </section>
}
