import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { decodeDocument, newDocument } from '../domain/setup'
import type { AppDocument } from '../domain/setup'
import { storageKey } from './useAppDocument'
import { supabase } from './supabase'

type State = { document: AppDocument | null; revision: number; status: string; error: string; conflict: AppDocument | null; needsChoice: boolean; dirty: boolean }
function pendingKey(userId: string) { return `north.household.pending.${userId}.v1` }
function getLocal(userId: string): AppDocument | null {
  try {
    const pending = localStorage.getItem(pendingKey(userId))
    const pendingDocument = pending ? decodeDocument(pending) : null
    if (pendingDocument) return pendingDocument
    const legacy = localStorage.getItem(storageKey)
    return legacy ? decodeDocument(legacy) : null
  } catch { return null }
}
function removeValidLocalCopies(userId: string) {
  try {
    const pending = localStorage.getItem(pendingKey(userId))
    if (pending && decodeDocument(pending)) localStorage.removeItem(pendingKey(userId))
    const legacy = localStorage.getItem(storageKey)
    if (legacy && decodeDocument(legacy)) localStorage.removeItem(storageKey)
  } catch { /* Keep browser data when local storage is unavailable. */ }
}
function savePending(userId: string, document: AppDocument) {
  try { localStorage.setItem(pendingKey(userId), JSON.stringify(document)) } catch { /* Cloud errors remain visible in the app. */ }
}
export function useCloudDocument(user: User) {
  const [state, setState] = useState<State>({ document: null, revision: 0, status: 'Loading household…', error: '', conflict: null, needsChoice: false, dirty: false })
  const latestDocument = useRef<AppDocument | null>(null)
  useEffect(() => { latestDocument.current = state.document }, [state.document])
  useEffect(() => {
    const client = supabase
    let active = true
    async function load() {
      if (!client) return
      const { data, error } = await client.from('households').select('document, revision').eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (error) { setState(s => ({ ...s, status: '', error: `Could not load your household: ${error.message}` })); return }
      const local = getLocal(user.id)
      if (data) {
        const remote = decodeDocument(JSON.stringify(data.document))
        if (!remote) { setState(s => ({ ...s, status: '', error: 'The saved account document could not be read. Your browser draft is preserved.' })); return }
        if (local && JSON.stringify(local) !== JSON.stringify(remote)) {
          setState({ document: local, revision: data.revision, status: '', error: '', conflict: remote, needsChoice: true, dirty: false }); return
        }
        removeValidLocalCopies(user.id)
        setState({ document: remote, revision: data.revision, status: 'Saved', error: '', conflict: null, needsChoice: false, dirty: false }); return
      }
      const initial = local ?? newDocument()
      const { data: inserted, error: insertError } = await client.from('households').insert({ user_id: user.id, document: initial, revision: 1 }).select('revision').single()
      if (!active) return
      if (insertError) {
        if (insertError.code === '23505') {
          const { data: raced, error: readError } = await client.from('households').select('document, revision').eq('user_id', user.id).single()
          const remote = raced ? decodeDocument(JSON.stringify(raced.document)) : null
          if (!readError && raced && remote) {
            if (local && JSON.stringify(local) !== JSON.stringify(remote)) setState({ document: local, revision: raced.revision, status: '', error: '', conflict: remote, needsChoice: true, dirty: false })
            else { removeValidLocalCopies(user.id); setState({ document: remote, revision: raced.revision, status: 'Saved', error: '', conflict: null, needsChoice: false, dirty: false }) }
            return
          }
        }
        setState(s => ({ ...s, status: '', error: `Could not create your account household: ${insertError.message}` })); return
      }
      removeValidLocalCopies(user.id)
      setState({ document: initial, revision: inserted.revision, status: 'Saved', error: '', conflict: null, needsChoice: false, dirty: false })
    }
    void load()
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    if (!supabase || !state.document || !state.dirty || state.needsChoice || state.conflict) return
    const client = supabase
    const document = state.document
    const timer = window.setTimeout(() => {
      setState(s => ({ ...s, status: 'Saving…', error: '' }))
      void client.from('households').update({ document, revision: state.revision + 1 }).eq('user_id', user.id).eq('revision', state.revision).select('revision').maybeSingle().then(async ({ data, error }) => {
        if (error) { savePending(user.id, latestDocument.current ?? document); setState(s => ({ ...s, status: 'Not saved', error: `Your latest changes remain in this browser. Save failed: ${error.message}` })); return }
        if (!data) {
          const { data: current, error: readError } = await client.from('households').select('document, revision').eq('user_id', user.id).single()
          const remote = current ? decodeDocument(JSON.stringify(current.document)) : null
          if (readError || !remote) { savePending(user.id, latestDocument.current ?? document); setState(s => ({ ...s, status: 'Not saved', error: 'A newer account save exists. Could not load it; your local changes are preserved.' })); return }
          savePending(user.id, latestDocument.current ?? document)
          setState(s => ({ ...s, conflict: remote, revision: current.revision, needsChoice: true, status: '', error: '' }))
          return
        }
        removeValidLocalCopies(user.id)
        setState(s => ({ ...s, revision: data.revision, dirty: s.document !== document, status: s.document === document ? 'Saved' : 'Saving…', error: '' }))
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [state.document, state.revision, state.needsChoice, state.conflict, state.dirty, user.id])

  const setDocument = useCallback((update: SetStateAction<AppDocument>) => {
    setState(previous => {
      if (!previous.document) return previous
      const document = typeof update === 'function' ? update(previous.document) : update
      return { ...previous, document, dirty: true, status: 'Unsaved changes' }
    })
  }, [])
  async function chooseConflict(choice: 'cloud' | 'device') {
    const cloud = state.conflict
    if (!cloud || !supabase) return
    if (choice === 'cloud') {
      removeValidLocalCopies(user.id)
      setState(s => ({ ...s, document: cloud, conflict: null, needsChoice: false, dirty: false, status: 'Saved', error: '' }))
      return
    }
    const next = state.document ?? newDocument()
    setState(s => ({ ...s, document: next, conflict: null, needsChoice: false, dirty: false, status: 'Saving…', error: '' }))
    const { data, error } = await supabase.from('households').update({ document: next, revision: state.revision + 1 }).eq('user_id', user.id).eq('revision', state.revision).select('revision').maybeSingle()
    if (error || !data) {
      const { data: current } = await supabase.from('households').select('document, revision').eq('user_id', user.id).single()
      const remote = current ? decodeDocument(JSON.stringify(current.document)) : null
      setState(s => ({ ...s, document: next, conflict: remote, revision: current?.revision ?? s.revision, needsChoice: !!remote, dirty: false, status: 'Not saved', error: error?.message ?? 'Another device saved again. Choose a version to keep.' }))
      savePending(user.id, next); return
    }
    removeValidLocalCopies(user.id)
    setState(s => ({ ...s, revision: data.revision, dirty: s.document !== next, status: s.document === next ? 'Saved' : 'Unsaved changes', error: '' }))
  }
  return { ...state, setDocument, chooseConflict }
}
