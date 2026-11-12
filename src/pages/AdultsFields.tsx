import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { removeAdult, renameAdult } from '../domain/budgetDocument'

/** The adult name rows, "+ Add an adult" and the removal confirmation. Used by setup and Settings › Household. */
export function AdultsFields({ document, setDocument, attempted }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  attempted: boolean
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  const { adults } = document.household
  const removingName = adults.find(person => person.id === removing)?.name.trim()
  return <>
    {adults.map((person, index) => <div className="household-person-row" key={person.id}>
      <label className="setup-field">Adult {index + 1} name<input aria-label={`Adult ${index + 1} name`} value={person.name} onChange={event => setDocument(current => ({ ...current, household: { ...current.household, adults: current.household.adults.map(row => row.id === person.id ? { ...row, name: event.target.value } : row) } }))} onBlur={() => { if (person.name.trim()) setDocument(current => renameAdult(current, person.id, person.name.trim())) }} aria-invalid={attempted && !person.name.trim()} /></label>
      <button type="button" className="icon-button household-person-remove" aria-label={`Remove ${person.name.trim() || `adult ${index + 1}`}`} onClick={() => setRemoving(person.id)}><X aria-hidden="true"/></button>
    </div>)}
    <button type="button" className="secondary-button" onClick={() => setDocument(current => ({ ...current, household: { ...current.household, adults: [...current.household.adults, { id: crypto.randomUUID(), name: '' }] } }))}>+ Add an adult</button>
    {removing && <ConfirmDialog title={`Remove ${removingName || 'this adult'}?`} confirmLabel="Remove adult" cancelLabel="Keep adult" danger onCancel={() => setRemoving(null)} onConfirm={() => { setDocument(current => removeAdult(current, removing)); setRemoving(null) }}>
      <p>Anyone who owns an account, has income or pays a fixed amount can’t be removed until that is reassigned.</p>
    </ConfirmDialog>}
  </>
}
