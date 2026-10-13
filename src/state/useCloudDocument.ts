import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { decodePersistedDocument, encodeDocument, missingOpeningBalanceDates, newDocument } from '../domain/setup'
import type { AppDocument } from '../domain/setup'
import { legacyStorageKey, storageKey } from './useAppDocument'
import { downloadOriginal } from './useAppDocument'
import { supabase } from './supabase'

type State = { document: AppDocument | null; revision: number; status: string; error: string; conflict: AppDocument | null; needsChoice: boolean; dirty: boolean; recoveryOriginal: string; migrationPending: boolean; conflictNeedsMigration: boolean; conflictOriginal: string }
function pendingKey(userId: string) { return `north.household.pending.${userId}.v2` }
function getLocal(userId: string) {
  try {
    for (const key of [pendingKey(userId), storageKey, legacyStorageKey]) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const result = decodePersistedDocument(raw)
      if (!('error' in result)) return { ...result, key }
    }
  } catch { /* Local data remains untouched when browser storage is unavailable. */ }
  return null
}
function removeValidLocalCopies(userId: string) {
  try {
    for (const key of [pendingKey(userId), storageKey, legacyStorageKey]) {
      const raw = localStorage.getItem(key)
      if (raw && !('error' in decodePersistedDocument(raw))) localStorage.removeItem(key)
    }
  } catch { /* Keep browser data when local storage is unavailable. */ }
}
function savePending(userId: string, document: AppDocument) {
  try { localStorage.setItem(pendingKey(userId), JSON.stringify(encodeDocument(document))) } catch { /* Cloud errors remain visible in the app. */ }
}

export function useCloudDocument(user: User) {
  const [state, setState] = useState<State>({ document: null, revision: 0, status: 'Loading household…', error: '', conflict: null, needsChoice: false, dirty: false, recoveryOriginal: '', migrationPending: false, conflictNeedsMigration: false, conflictOriginal: '' })
  const latestDocument = useRef<AppDocument | null>(null)
  useEffect(() => { latestDocument.current = state.document }, [state.document])
  useEffect(() => {
    const client = supabase; let active = true
    async function load() {
      if (!client) return
      const { data, error } = await client.from('households').select('document, revision').eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (error) { setState(s => ({ ...s, status: '', error: `Could not load your household: ${error.message}` })); return }
      const local = getLocal(user.id)
      if (data) {
        const raw = JSON.stringify(data.document); const remote = decodePersistedDocument(raw)
        if ('error' in remote) {
          setState({ document: null, revision: data.revision, status: '', error: `${remote.error} Your account original is preserved. Download it, retry, or replace it with a fresh household.`, conflict: null, needsChoice: false, dirty: false, recoveryOriginal: raw, migrationPending: false, conflictNeedsMigration: false, conflictOriginal: '' }); return
        }
        if (local && JSON.stringify(local.document) !== JSON.stringify(remote.document)) {
          setState({ document: local.document, revision: data.revision, status: '', error: '', conflict: remote.document, needsChoice: true, dirty: false, recoveryOriginal: local.needsMigration && local.missingDates.length ? local.original : '', migrationPending: local.needsMigration && local.missingDates.length > 0, conflictNeedsMigration: remote.sourceVersion === 1, conflictOriginal: remote.sourceVersion === 1 ? raw : '' }); return
        }
        const migrationPending = remote.sourceVersion === 1 && remote.missingDates.length > 0
        removeValidLocalCopies(user.id)
        setState({ document: migrationPending ? { ...remote.document, balanceDatesReviewed: false } : remote.document, revision: data.revision, status: migrationPending ? '' : remote.sourceVersion === 1 ? 'Migrating saved household…' : 'Saved', error: '', conflict: null, needsChoice: false, dirty: remote.sourceVersion === 1 && !migrationPending, recoveryOriginal: migrationPending ? raw : '', migrationPending, conflictNeedsMigration: false, conflictOriginal: '' }); return
      }
      const initial = local?.document ?? newDocument()
      const migrationPending = !!local?.needsMigration && !!local.missingDates.length
      if (migrationPending) {
        setState({ document: { ...initial, balanceDatesReviewed: false }, revision: 0, status: '', error: '', conflict: null, needsChoice: false, dirty: false, recoveryOriginal: local!.original, migrationPending: true, conflictNeedsMigration: false, conflictOriginal: '' }); return
      }
      const { data: inserted, error: insertError } = await client.from('households').insert({ user_id: user.id, document: encodeDocument(initial), revision: 1 }).select('revision').single()
      if (!active) return
      if (insertError) {
        if (insertError.code === '23505') {
          const { data: raced, error: readError } = await client.from('households').select('document, revision').eq('user_id', user.id).single()
          const remote = raced ? decodePersistedDocument(JSON.stringify(raced.document)) : null
          if (!readError && raced && remote && !('error' in remote)) {
            if (local && JSON.stringify(local.document) !== JSON.stringify(remote.document)) setState({ document: local.document, revision: raced.revision, status: '', error: '', conflict: remote.document, needsChoice: true, dirty: false, recoveryOriginal: '', migrationPending, conflictNeedsMigration: remote.sourceVersion === 1, conflictOriginal: remote.sourceVersion === 1 ? JSON.stringify(raced.document) : '' })
            else { removeValidLocalCopies(user.id); setState({ document: remote.document, revision: raced.revision, status: 'Saved', error: '', conflict: null, needsChoice: false, dirty: remote.sourceVersion === 1, recoveryOriginal: '', migrationPending: remote.sourceVersion === 1 && remote.missingDates.length > 0, conflictNeedsMigration: false, conflictOriginal: '' }) }
            return
          }
        }
        setState(s => ({ ...s, status: '', error: `Could not create your account household: ${insertError.message}` })); return
      }
      removeValidLocalCopies(user.id)
      setState({ document: initial, revision: inserted.revision, status: 'Saved', error: '', conflict: null, needsChoice: false, dirty: false, recoveryOriginal: '', migrationPending: false, conflictNeedsMigration: false, conflictOriginal: '' })
    }
    void load(); return () => { active = false }
  }, [user.id])

  useEffect(() => {
    if (!supabase || !state.document || !state.dirty || state.needsChoice || state.conflict || state.migrationPending) return
    const client = supabase; const document = state.document
    const timer = window.setTimeout(() => {
      setState(s => ({ ...s, status: 'Saving…', error: '' }))
      if (state.revision === 0) {
        void client.from('households').insert({ user_id: user.id, document: encodeDocument(document), revision: 1 }).select('revision').single().then(({ data, error }) => {
          if (error || !data) { savePending(user.id, latestDocument.current ?? document); setState(s => ({ ...s, status: 'Not saved', error: `Could not create your account household: ${error?.message ?? 'save failed'}` })); return }
          removeValidLocalCopies(user.id); setState(s => ({ ...s, revision: data.revision, dirty: s.document !== document, status: s.document === document ? 'Saved' : 'Saving…', error: '', recoveryOriginal: '' }))
        }); return
      }
      void client.from('households').update({ document: encodeDocument(document), revision: state.revision + 1 }).eq('user_id', user.id).eq('revision', state.revision).select('revision').maybeSingle().then(async ({ data, error }) => {
        if (error) { savePending(user.id, latestDocument.current ?? document); setState(s => ({ ...s, status: 'Not saved', error: `Your latest changes remain in this browser. Save failed: ${error.message}` })); return }
        if (!data) {
          const { data: current, error: readError } = await client.from('households').select('document, revision').eq('user_id', user.id).single()
          const remote = current ? decodePersistedDocument(JSON.stringify(current.document)) : null
          if (readError || !remote || 'error' in remote) { savePending(user.id, latestDocument.current ?? document); setState(s => ({ ...s, status: 'Not saved', error: 'A newer account save exists. Could not load it; your local changes are preserved.' })); return }
          savePending(user.id, latestDocument.current ?? document)
          setState(s => ({ ...s, conflict: remote.document, revision: current.revision, needsChoice: true, conflictNeedsMigration: remote.sourceVersion === 1, conflictOriginal: remote.sourceVersion === 1 ? JSON.stringify(current.document) : '', status: '', error: '' })); return
        }
        removeValidLocalCopies(user.id)
        setState(s => ({ ...s, revision: data.revision, dirty: s.document !== document, status: s.document === document ? 'Saved' : 'Saving…', error: '', recoveryOriginal: '', conflictNeedsMigration: false, conflictOriginal: '' }))
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [state.document, state.revision, state.needsChoice, state.conflict, state.dirty, state.migrationPending, user.id])

  const setDocument = useCallback((update: SetStateAction<AppDocument>) => {
    setState(previous => {
      if (!previous.document) return previous
      let document = typeof update === 'function' ? update(previous.document) : update
      if (previous.migrationPending) {
        const gaps = missingOpeningBalanceDates(document); document = { ...document, balanceDatesReviewed: gaps.length === 0 }
        return { ...previous, document, migrationPending: gaps.length > 0, dirty: gaps.length === 0, status: gaps.length ? '' : 'Migrating saved household…', recoveryOriginal: gaps.length ? previous.recoveryOriginal : '' }
      }
      return { ...previous, document, dirty: true, status: 'Unsaved changes' }
    })
  }, [])
  async function chooseConflict(choice: 'cloud' | 'device') {
    const cloud = state.conflict
    if (!cloud || !supabase) return
    if (choice === 'cloud') {
      const cloudWasV1 = state.conflictNeedsMigration
      const needsDates = cloudWasV1 && missingOpeningBalanceDates(cloud).length > 0
      setState(s => ({ ...s, document: needsDates ? { ...cloud, balanceDatesReviewed: false } : cloud, conflict: null, needsChoice: false, migrationPending: needsDates, dirty: cloudWasV1 && !needsDates, status: cloudWasV1 && !needsDates ? 'Migrating saved household…' : '', error: '', recoveryOriginal: needsDates ? s.conflictOriginal : '' })); return
    }
    const next = state.document ?? newDocument()
    if (state.migrationPending && missingOpeningBalanceDates(next).length) {
      setState(s => ({ ...s, document: { ...next, balanceDatesReviewed: false }, conflict: null, needsChoice: false, dirty: false, status: '', recoveryOriginal: s.recoveryOriginal || s.conflictOriginal }))
      return
    }
    const { data, error } = await supabase.from('households').update({ document: encodeDocument(next), revision: state.revision + 1 }).eq('user_id', user.id).eq('revision', state.revision).select('revision').maybeSingle()
    if (error || !data) {
      const { data: current } = await supabase.from('households').select('document, revision').eq('user_id', user.id).single()
      const remote = current ? decodePersistedDocument(JSON.stringify(current.document)) : null
      const conflict = remote && !('error' in remote) ? remote.document : null
      setState(s => ({ ...s, document: next, conflict, revision: current?.revision ?? s.revision, needsChoice: !!conflict, dirty: false, status: 'Not saved', error: error?.message ?? 'Another device saved again. Choose a version to keep.' }))
      savePending(user.id, next); return
    }
    removeValidLocalCopies(user.id)
    setState(s => ({ ...s, document: next, revision: data.revision, conflict: null, needsChoice: false, migrationPending: false, dirty: false, status: 'Saved', error: '', conflictOriginal: '' }))
  }
  async function replaceUnreadableWithFreshDraft() {
    if (!supabase || !state.recoveryOriginal) return
    const next = newDocument()
    const { data, error } = await supabase.from('households').update({ document: encodeDocument(next), revision: state.revision + 1 }).eq('user_id', user.id).eq('revision', state.revision).select('revision').maybeSingle()
    if (error || !data) { setState(s => ({ ...s, error: error?.message ?? 'The account document changed. Retry before replacing it.' })); return }
    setState({ document: next, revision: data.revision, status: 'Saved', error: '', conflict: null, needsChoice: false, dirty: false, recoveryOriginal: '', migrationPending: false, conflictNeedsMigration: false, conflictOriginal: '' })
  }
  return { ...state, setDocument, chooseConflict, downloadOriginal: () => downloadOriginal(state.recoveryOriginal), replaceUnreadableWithFreshDraft }
}
