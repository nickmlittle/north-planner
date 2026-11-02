import { useEffect, useRef, useState, type SetStateAction } from 'react'
import { decodeBudgetDocument, migrateV2BudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'

export const budgetStorageKey = 'north.budget.v3'
const recoveryKey = 'north.budget.recovery.v3'
const legacyStorageKey = 'north.budget.v2'
type State = { document: BudgetDocument; error: string; recoveryOriginal: string; migratedFromV2: boolean }

function restore(): State {
  try {
    localStorage.removeItem('north.budget.v1')
    localStorage.removeItem('north.budget.recovery.v1')
    const raw = localStorage.getItem(budgetStorageKey)
    if (!raw) {
      const legacy = localStorage.getItem(legacyStorageKey)
      if (!legacy) return { document: newBudgetDocument(), error: '', recoveryOriginal: '', migratedFromV2: false }
      let migrated: BudgetDocument | null = null
      try { migrated = migrateV2BudgetDocument(JSON.parse(legacy)) } catch { /* Preserve the source for recovery. */ }
      return migrated
        ? { document: migrated, error: '', recoveryOriginal: legacy, migratedFromV2: true }
        : { document: newBudgetDocument(), error: 'The saved v2 budget could not be migrated. Its original data is preserved in this browser.', recoveryOriginal: legacy, migratedFromV2: false }
    }
    let document: BudgetDocument | null = null
    try { document = decodeBudgetDocument(JSON.parse(raw)) } catch { /* Preserve the unreadable source. */ }
    return document
      ? { document, error: '', recoveryOriginal: '', migratedFromV2: false }
      : { document: newBudgetDocument(), error: 'The saved budget could not be read. Its original data is preserved in this browser.', recoveryOriginal: raw, migratedFromV2: false }
  } catch {
    return { document: newBudgetDocument(), error: 'Browser storage is unavailable. Changes will last only for this session.', recoveryOriginal: '', migratedFromV2: false }
  }
}

export function useBudgetDocument() {
  const [state, setState] = useState(restore)
  const latest = useRef(state.document)
  const recoveryOriginal = useRef(state.recoveryOriginal)
  const migrationPersistenceAttempted = useRef(false)
  useEffect(() => {
    if (!state.migratedFromV2 || migrationPersistenceAttempted.current) return
    migrationPersistenceAttempted.current = true
    try {
      if (recoveryOriginal.current) localStorage.setItem(recoveryKey, recoveryOriginal.current)
      localStorage.setItem(budgetStorageKey, JSON.stringify(state.document))
      localStorage.removeItem(legacyStorageKey)
      recoveryOriginal.current = ''
      latest.current = state.document
    } catch {
      window.setTimeout(() => setState(current => ({ ...current, error: 'The migrated budget could not be saved. The original v2 data is preserved in this browser.' })), 0)
    }
  }, [state.document, state.migratedFromV2])
  function setDocument(update: SetStateAction<BudgetDocument>) {
    const document = typeof update === 'function' ? update(latest.current) : update
    latest.current = document
    let error = ''
    let migratedFromV2 = state.migratedFromV2
    try {
      if (recoveryOriginal.current) localStorage.setItem(recoveryKey, recoveryOriginal.current)
      localStorage.setItem(budgetStorageKey, JSON.stringify(document))
      if (migratedFromV2) localStorage.removeItem(legacyStorageKey)
      migratedFromV2 = false
      recoveryOriginal.current = ''
    } catch { error = 'Browser storage is unavailable or full. Changes will last only for this session.' }
    setState({ document, error, recoveryOriginal: recoveryOriginal.current, migratedFromV2 })
  }
  return { document: state.document, setDocument, error: state.error, status: state.error ? 'Not saved' : 'Saved' }
}
