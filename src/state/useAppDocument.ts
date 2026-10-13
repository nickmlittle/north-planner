import { useState } from 'react'
import type { SetStateAction } from 'react'
import { decodePersistedDocument, encodeDocument, missingOpeningBalanceDates, newDocument } from '../domain/setup'
import type { AppDocument } from '../domain/setup'

export const storageKey = 'north.household.v2'
export const legacyStorageKey = 'north.household.v1'
type State = { document: AppDocument; warning: string; preserveInvalid: boolean; recoveryOriginal: string; migrationPending: boolean }
function restore(): State {
  try {
    const rawV2 = localStorage.getItem(storageKey)
    const rawV1 = rawV2 ? null : localStorage.getItem(legacyStorageKey)
    const raw = rawV2 ?? rawV1
    if (!raw) return { document: newDocument(), warning: '', preserveInvalid: false, recoveryOriginal: '', migrationPending: false }
    const restored = decodePersistedDocument(raw)
    if ('error' in restored) return { document: newDocument(), warning: `${restored.error} The original is preserved. Download it or explicitly replace it with this draft.`, preserveInvalid: true, recoveryOriginal: restored.original, migrationPending: false }
    const migrationPending = restored.needsMigration && restored.missingDates.length > 0
    if (!migrationPending && restored.needsMigration) localStorage.setItem(storageKey, JSON.stringify(encodeDocument({ ...restored.document, balanceDatesReviewed: true })))
    const document = migrationPending ? { ...restored.document, balanceDatesReviewed: false } : restored.document
    return { document, warning: migrationPending ? 'Add a date for every saved opening balance to finish upgrading this household.' : '', preserveInvalid: false, recoveryOriginal: migrationPending ? restored.original : '', migrationPending }
  } catch { return { document: newDocument(), warning: 'Browser storage is unavailable. Your changes will only last for this session.', preserveInvalid: false, recoveryOriginal: '', migrationPending: false } }
}

export function useAppDocument() {
  const [state, setState] = useState(restore)
  function persist(document: AppDocument, preserveInvalid: boolean, migrationPending: boolean) {
    if (preserveInvalid || migrationPending) return ''
    try { localStorage.setItem(storageKey, JSON.stringify(encodeDocument({ ...document, balanceDatesReviewed: true }))); return '' }
    catch { return 'Browser storage is unavailable or full. Your changes will only last for this session.' }
  }
  function setDocument(update: SetStateAction<AppDocument>) {
    setState(previous => {
      let document = typeof update === 'function' ? update(previous.document) : update
      if (previous.preserveInvalid) return { ...previous, document }
      const gaps = previous.migrationPending ? missingOpeningBalanceDates(document) : []
      if (previous.migrationPending) document = { ...document, balanceDatesReviewed: gaps.length === 0 }
      const migrationPending = previous.migrationPending && gaps.length > 0
      const warning = migrationPending ? `Add a date for every saved opening balance to finish upgrading this household: ${gaps.join(', ')}.` : ''
      const persistWarning = persist(document, previous.preserveInvalid, migrationPending)
      return { ...previous, document, migrationPending, warning: persistWarning || warning, recoveryOriginal: migrationPending ? previous.recoveryOriginal : '' }
    })
  }
  return { document: state.document, setDocument, warning: state.warning, recoveryOriginal: state.recoveryOriginal, migrationPending: state.migrationPending,
    downloadOriginal: () => downloadOriginal(state.recoveryOriginal), replaceSavedDraft: () => {
      setState(previous => {
        try { localStorage.removeItem(legacyStorageKey); localStorage.removeItem(storageKey) } catch { /* Keep the original if storage is unavailable. */ }
        const warning = persist(previous.document, false, false)
        return { ...previous, warning, preserveInvalid: false, recoveryOriginal: '', migrationPending: false }
      })
    } }
}

export function downloadOriginal(raw: string) {
  if (!raw) return
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
  const link = window.document.createElement('a'); link.href = url; link.download = 'north-household-original.json'; link.click()
  URL.revokeObjectURL(url)
}
