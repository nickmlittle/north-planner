import { useState, type Dispatch, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { householdReady } from '../domain/budgetDocument'
import { AdultsFields } from './AdultsFields'

/**
 * Settings › Household: the name (saved on blur or Enter, with a "Saved" toast) and the adults. First-run setup
 * is `SetupWizard`.
 */
export function HouseholdFields({ document, setDocument, notify }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  notify: (message: string) => void
}) {
  const { household } = document
  const ready = householdReady(household)
  const [name, setName] = useState(household.name)
  // A name changed elsewhere (another device) replaces the field's text.
  const [shown, setShown] = useState(household.name)
  if (shown !== household.name) { setShown(household.name); setName(household.name) }
  const save = () => {
    const next = name.trim()
    if (!next || next === household.name) return
    setDocument(current => ({ ...current, household: { ...current.household, name: next } }))
    notify('Saved')
  }
  return <div className="settings-household">
    <form className="settings-household-name" onSubmit={event => { event.preventDefault(); save() }}>
      <label className="setup-field">Household name<input aria-label="Household name" value={name} onChange={event => setName(event.target.value)} onBlur={save} aria-invalid={!name.trim()} placeholder="e.g. Alex + Sam" /></label>
    </form>
    <fieldset className="settings-household-adults">
      <legend>Adults</legend>
      <AdultsFields document={document} setDocument={setDocument} attempted />
    </fieldset>
    {!ready && <p role="alert" className="input-error">Enter a household name and at least one adult name.</p>}
  </div>
}
