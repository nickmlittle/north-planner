import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { householdReady } from '../domain/budgetDocument'
import { PageFrame } from '../components/PageFrame'
import { AdultsFields } from './AdultsFields'

/** The Household page after setup: the name and adults on one screen. First-run setup is `SetupWizard`. */
export function HouseholdSetup({ document, setDocument, onContinue }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  onContinue: () => void
}) {
  const [attempted, setAttempted] = useState(false)
  const { household } = document
  const ready = householdReady(household)
  return <PageFrame className="household-setup-page" eyebrow="Getting started" title="Your household">
    <section className="setup-card">
      <label className="setup-field">Household name<input aria-label="Household name" value={household.name} onChange={event => setDocument(current => ({ ...current, household: { ...current.household, name: event.target.value } }))} aria-invalid={attempted && !household.name.trim()} placeholder="e.g. Alex + Sam" /></label>
    </section>
    <section className="setup-card">
      <h2>Adults</h2>
      <AdultsFields document={document} setDocument={setDocument} attempted={attempted} />
    </section>
    {attempted && !ready && <p role="alert" className="input-error">Enter a household name and at least one adult name.</p>}
    <button type="button" className="primary-button" onClick={() => { setAttempted(true); if (ready) onContinue() }}>Continue to Plan</button>
  </PageFrame>
}
