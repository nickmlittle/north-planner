import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { removeAdult, renameAdult } from '../domain/budgetDocument'

/** The adult name rows, "+ Add an adult" and the inline removal confirmation. Used by setup and the Household page. */
export function AdultsFields({ document, setDocument, attempted }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  attempted: boolean
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  const { adults } = document.household
  return <>
    {adults.map((person, index) => <div className="household-person-row" key={person.id}>
      <label className="setup-field">Adult {index + 1} name<input aria-label={`Adult ${index + 1} name`} value={person.name} onChange={event => setDocument(current => ({ ...current, household: { ...current.household, adults: current.household.adults.map(row => row.id === person.id ? { ...row, name: event.target.value } : row) } }))} onBlur={() => { if (person.name.trim()) setDocument(current => renameAdult(current, person.id, person.name.trim())) }} aria-invalid={attempted && !person.name.trim()} /></label>
      <button type="button" className="text-button" onClick={() => setRemoving(person.id)}>Remove</button>
    </div>)}
    <button type="button" className="secondary-button" onClick={() => setDocument(current => ({ ...current, household: { ...current.household, adults: [...current.household.adults, { id: crypto.randomUUID(), name: '' }] } }))}>+ Add an adult</button>
    {removing && <div className="removal-panel" role="group" aria-label="Confirm adult removal"><p>Remove this adult? Anyone who owns an account, has income or pays a fixed amount can’t be removed until that is reassigned.</p><button type="button" className="secondary-button" onClick={() => setRemoving(null)}>Keep adult</button><button type="button" className="danger-button" onClick={() => { setDocument(current => removeAdult(current, removing)); setRemoving(null) }}>Remove adult</button></div>}
  </>
}
