import { useRef, useState, type SetStateAction } from 'react'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'

export const budgetStorageKey = 'north.budget.v1'
const recoveryKey = 'north.budget.recovery.v1'
type State = { document: BudgetDocument; error: string; recoveryOriginal: string }

function restore(): State {
  try {
    const raw = localStorage.getItem(budgetStorageKey)
    if (!raw) return { document: newBudgetDocument(), error: '', recoveryOriginal: '' }
    let document: BudgetDocument | null = null
    try { document = decodeBudgetDocument(JSON.parse(raw)) } catch { /* Preserve the unreadable source. */ }
    return document
      ? { document, error: '', recoveryOriginal: '' }
      : { document: newBudgetDocument(), error: 'The saved budget could not be read. Its original data is preserved in this browser.', recoveryOriginal: raw }
  } catch {
    return { document: newBudgetDocument(), error: 'Browser storage is unavailable. Changes will last only for this session.', recoveryOriginal: '' }
  }
}

export function useBudgetDocument() {
  const [state, setState] = useState(restore)
  const latest = useRef(state.document)
  const recoveryOriginal = useRef(state.recoveryOriginal)
  function setDocument(update: SetStateAction<BudgetDocument>) {
    const document = typeof update === 'function' ? update(latest.current) : update
    latest.current = document
    let error = ''
    try {
      if (recoveryOriginal.current) localStorage.setItem(recoveryKey, recoveryOriginal.current)
      localStorage.setItem(budgetStorageKey, JSON.stringify(document))
      recoveryOriginal.current = ''
    } catch { error = 'Browser storage is unavailable or full. Changes will last only for this session.' }
    setState({ document, error, recoveryOriginal: recoveryOriginal.current })
  }
  return { document: state.document, setDocument, error: state.error, status: state.error ? 'Not saved' : 'Saved' }
}
