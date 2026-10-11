import { useEffect, useState } from 'react'
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
  const [initial] = useState(restore)
  const [document, setDocument] = useState(initial.document)
  const [warning, setWarning] = useState(initial.warning)
  const [replaceInvalid, setReplaceInvalid] = useState(false)
  useEffect(() => {
    if (initial.warning.startsWith('Saved data') && !replaceInvalid) return
    try { localStorage.setItem(storageKey, JSON.stringify(document)) }
    catch { setWarning('Browser storage is unavailable or full. Your changes will only last for this session.') }
  }, [document, initial.warning, replaceInvalid])
  return { document, setDocument, warning, replaceSavedDraft: () => { setReplaceInvalid(true); setWarning('') } }
}
