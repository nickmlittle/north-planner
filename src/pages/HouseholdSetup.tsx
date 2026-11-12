import type { Dispatch, SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { householdReady } from '../domain/budgetDocument'
import { AdultsFields } from './AdultsFields'

/** Settings › Household: the name and adults. Changes save as you type. First-run setup is `SetupWizard`. */
export function HouseholdFields({ document, setDocument }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
}) {
  const { household } = document
  const ready = householdReady(household)
  return <>
    <section className="setup-card">
      <label className="setup-field">Household name<input aria-label="Household name" value={household.name} onChange={event => setDocument(current => ({ ...current, household: { ...current.household, name: event.target.value } }))} aria-invalid={!household.name.trim()} placeholder="e.g. Alex + Sam" /></label>
    </section>
    <section className="setup-card">
      <h3>Adults</h3>
      <AdultsFields document={document} setDocument={setDocument} attempted />
    </section>
    {!ready && <p role="alert" className="input-error">Enter a household name and at least one adult name.</p>}
  </>
}
