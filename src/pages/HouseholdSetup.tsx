import type { Dispatch, SetStateAction } from 'react'
import { useRef, useState } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { removeAdult, renameAdult } from '../domain/budgetDocument'
import { PageFrame } from '../components/PageFrame'

export function HouseholdSetup({ document, setDocument, onContinue }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  onContinue: () => void
}) {
  const [attempted, setAttempted] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const nameOnFocus = useRef<Record<string, string>>({})
  const { household } = document
  const ready = !!household.name.trim() && household.adults.length > 0 && household.adults.every(person => !!person.name.trim())
  return <PageFrame element="div" className="household-setup-page" eyebrow="Getting started" title="Your household" description="Add the people who will plan and make transfers together.">
    <section className="setup-card">
      <label className="setup-field">Household name<input aria-label="Household name" value={household.name} onChange={event => setDocument(current => ({ ...current, household: { ...current.household, name: event.target.value } }))} aria-invalid={attempted && !household.name.trim()} placeholder="e.g. Alex + Sam" /></label>
    </section>
    <section className="setup-card">
      <h2>Adults</h2>
      {household.adults.map((person, index) => <div className="household-person-row" key={person.id}>
        <label className="setup-field">Adult {index + 1} name<input aria-label={`Adult ${index + 1} name`} value={person.name} onFocus={() => { if (!(person.id in nameOnFocus.current)) nameOnFocus.current[person.id] = person.name }} onChange={event => setDocument(current => ({ ...current, household: { ...current.household, adults: current.household.adults.map(row => row.id === person.id ? { ...row, name: event.target.value } : row) } }))} onBlur={() => { if (!person.name.trim()) return; const previousName = nameOnFocus.current[person.id]; if (previousName) setDocument(current => renameAdult(current, person.id, current.household.adults.find(row => row.id === person.id)?.name ?? '', previousName)); delete nameOnFocus.current[person.id] }} aria-invalid={attempted && !person.name.trim()} /></label>
        <button type="button" className="text-button" onClick={() => setRemoving(person.id)}>Remove</button>
      </div>)}
      <button type="button" className="secondary-button" onClick={() => setDocument(current => ({ ...current, household: { ...current.household, adults: [...current.household.adults, { id: crypto.randomUUID(), name: '' }] } }))}>+ Add an adult</button>
      {removing && <div className="removal-panel" role="group" aria-label="Confirm adult removal"><p>Remove this adult and their income and funding assignments?</p><button type="button" className="secondary-button" onClick={() => setRemoving(null)}>Keep adult</button><button type="button" className="danger-button" onClick={() => { setDocument(current => removeAdult(current, removing)); setRemoving(null) }}>Remove adult</button></div>}
    </section>
    {attempted && !ready && <p role="alert" className="input-error">Enter a household name and at least one adult name.</p>}
    <button type="button" className="primary-button" onClick={() => { setAttempted(true); if (ready) onContinue() }}>Continue to Budget</button>
  </PageFrame>
}
