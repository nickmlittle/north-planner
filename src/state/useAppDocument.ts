import { useState } from 'react'
import type { SetStateAction } from 'react'
import { decodeDocument, newDocument } from '../domain/setup'

export const storageKey = 'north.household.v1'
function restore() {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { document: newDocument(), warning: '' }
    const document = decodeDocument(raw)
    return document ? { document, warning: '' } : { document: newDocument(), warning: 'Saved data could not be read. A new draft is open; the previous saved data will be kept until you explicitly replace it.' }
  } catch { return { document: newDocument(), warning: 'Browser storage is unavailable. Your changes will only last for this session.' } }
}
export function useAppDocument() {
  const [state, setState] = useState(() => { const saved = restore(); return { ...saved, preserveInvalid: saved.warning.startsWith('Saved data') } })
  function persist(document: typeof state.document, preserveInvalid: boolean) {
    if (preserveInvalid) return state.warning
    try { localStorage.setItem(storageKey, JSON.stringify(document)); return '' }
    catch { return 'Browser storage is unavailable or full. Your changes will only last for this session.' }
  }
  function setDocument(update: SetStateAction<typeof state.document>) {
    setState(previous => {
      const document = typeof update === 'function' ? update(previous.document) : update
      return { ...previous, document, warning: persist(document, previous.preserveInvalid) }
    })
  }
  return { document: state.document, setDocument, warning: state.warning, replaceSavedDraft: () => {
    setState(previous => ({ ...previous, preserveInvalid: false, warning: persist(previous.document, false) }))
  } }
}
