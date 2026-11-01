import { useEffect, useRef, useState, type SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { supabase } from './supabase'

const pendingKey = (userId: string) => `north.budget.pending.${userId}.v1`
type State = { document: BudgetDocument | null; revision: number; status: string; error: string; dirty: boolean; conflict: BudgetDocument | null }
function readPending(userId: string): BudgetDocument | null {
  try { return decodeBudgetDocument(JSON.parse(localStorage.getItem(pendingKey(userId)) ?? 'null')) } catch { return null }
}
function keepPending(userId: string, document: BudgetDocument) {
  try { localStorage.setItem(pendingKey(userId), JSON.stringify(document)) } catch { /* The save error is visible in the app. */ }
}
function clearPending(userId: string) {
  try { localStorage.removeItem(pendingKey(userId)) } catch { /* The cloud copy is authoritative. */ }
}

export function useCloudBudget(user: User) {
  const [state, setState] = useState<State>({ document: null, revision: 0, status: 'Loading budget…', error: '', dirty: false, conflict: null })
  const latest = useRef<BudgetDocument | null>(null)
  const saving = useRef(false)
  useEffect(() => { latest.current = state.document }, [state.document])
  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) return
      const { data, error } = await supabase.from('budgets').select('document, revision').eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (error) { setState(s => ({ ...s, status: 'Not saved', error: `Could not load your budget: ${error.message}` })); return }
      const pending = readPending(user.id)
      const remote = data ? decodeBudgetDocument(data.document) : null
      if (data && !remote) { setState(s => ({ ...s, status: 'Not saved', error: 'The account budget could not be read. Its original data remains in your account.' })); return }
      if (pending && remote && JSON.stringify(pending) !== JSON.stringify(remote)) {
        setState({ document: pending, revision: data!.revision, status: 'Choose a version', error: '', dirty: false, conflict: remote }); return
      }
      if (pending && !remote) {
        setState({ document: pending, revision: 0, status: 'Unsaved changes', error: '', dirty: true, conflict: null }); return
      }
      clearPending(user.id)
      setState({ document: remote ?? newBudgetDocument(), revision: data?.revision ?? 0, status: 'Saved', error: '', dirty: false, conflict: null })
    }
    void load()
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    if (!supabase || !state.document || !state.dirty || state.conflict) return
    const document = state.document
    const revision = state.revision
    const timer = window.setTimeout(async () => {
      if (!supabase || saving.current) return
      saving.current = true
      setState(s => ({ ...s, status: 'Saving…', error: '' }))
      const query = revision === 0
        ? supabase.from('budgets').insert({ user_id: user.id, document, revision: 1 }).select('revision').single()
        : supabase.from('budgets').update({ document, revision: revision + 1 }).eq('user_id', user.id).eq('revision', revision).select('revision').maybeSingle()
      const { data, error } = await query
      saving.current = false
      if (error || !data) {
        keepPending(user.id, latest.current ?? document)
        if (!error || error.code === '23505') {
          const { data: current, error: readError } = await supabase.from('budgets').select('document, revision').eq('user_id', user.id).single()
          const remote = current ? decodeBudgetDocument(current.document) : null
          if (!readError && remote) { setState(s => ({ ...s, revision: current.revision, conflict: remote, dirty: false, status: 'Choose a version', error: '' })); return }
        }
        setState(s => ({ ...s, status: 'Not saved', error: `Could not save your budget: ${error?.message ?? 'a newer save exists'}` }))
        return
      }
      setState(s => {
        if (s.document === document) clearPending(user.id)
        else if (s.document) keepPending(user.id, s.document)
        return { ...s, revision: data.revision, dirty: s.document !== document, status: s.document === document ? 'Saved' : 'Unsaved changes', error: '' }
      })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [state.document, state.revision, state.dirty, state.conflict, user.id])

  function setDocument(update: SetStateAction<BudgetDocument>) {
    setState(previous => {
      if (!previous.document) return previous
      const document = typeof update === 'function' ? update(previous.document) : update
      keepPending(user.id, document)
      return { ...previous, document, dirty: !previous.conflict, status: previous.conflict ? 'Choose a version' : 'Unsaved changes' }
    })
  }
  function chooseConflict(choice: 'cloud' | 'device') {
    setState(previous => {
      if (!previous.conflict) return previous
      if (choice === 'cloud') { clearPending(user.id); return { ...previous, document: previous.conflict, conflict: null, dirty: false, status: 'Saved', error: '' } }
      if (previous.document) keepPending(user.id, previous.document)
      return { ...previous, conflict: null, dirty: true, status: 'Unsaved changes', error: '' }
    })
  }
  return { ...state, setDocument, chooseConflict }
}
