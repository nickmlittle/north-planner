// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { keyLabels, SEQUENCE_MS, usePendingSequence, useShortcut, useShortcuts, type Shortcut } from './shortcuts'

afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = '' })

const shortcut = (keys: string, run = vi.fn(), extra: Partial<Shortcut> = {}): Shortcut => ({ keys, description: keys, group: 'General', run, ...extra })
const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) => fireEvent.keyDown(target, { key, bubbles: true, ...init })

it('runs a single key, and lists what is registered while it is mounted', () => {
  const run = vi.fn()
  const { result, unmount } = renderHook(() => { useShortcut(shortcut('n', run)); return useShortcuts() })
  expect(result.current.map(row => row.keys)).toEqual(['n'])
  press('n')
  expect(run).toHaveBeenCalledOnce()
  press('N', { shiftKey: true })
  expect(run).toHaveBeenCalledOnce()
  unmount()
  press('n')
  expect(run).toHaveBeenCalledOnce()
})

it('runs a sequence when the second key comes within a second, and shows it is waiting', () => {
  vi.useFakeTimers()
  const month = vi.fn(), plan = vi.fn()
  const { result } = renderHook(() => { useShortcut(shortcut('g m', month)); useShortcut(shortcut('g p', plan)); return usePendingSequence() })
  press('g')
  expect(result.current).toBe('g')
  press('m')
  expect(month).toHaveBeenCalledOnce()
  expect(result.current).toBeNull()
  // G alone, then waiting, does nothing; the next key is a key of its own.
  press('g')
  act(() => { vi.advanceTimersByTime(SEQUENCE_MS + 1) })
  expect(result.current).toBeNull()
  press('p')
  expect(plan).not.toHaveBeenCalled()
  // An unknown second key ends the sequence without running anything.
  press('g'); press('x'); press('p')
  expect(plan).not.toHaveBeenCalled()
})

it('ignores keys typed into fields, during IME composition, and while a modal dialog is open', () => {
  const run = vi.fn()
  renderHook(() => useShortcut(shortcut('/', run)))
  for (const html of ['<input>', '<textarea></textarea>', '<select><option>a</option></select>', '<div contenteditable="true"></div>']) {
    document.body.innerHTML = html
    press('/', {}, document.body.firstElementChild!)
  }
  press('/', { isComposing: true })
  document.body.innerHTML = '<div role="dialog" aria-modal="true"><button>Close</button></div>'
  press('/', {}, document.querySelector('button')!)
  expect(run).not.toHaveBeenCalled()
  document.body.innerHTML = ''
  press('/')
  expect(run).toHaveBeenCalledOnce()
})

it('leaves keys a component has already handled, and keys with other modifiers', () => {
  const run = vi.fn()
  renderHook(() => useShortcut(shortcut('/', run)))
  document.body.innerHTML = '<div tabindex="0"></div>'
  const row = document.body.firstElementChild!
  row.addEventListener('keydown', event => event.preventDefault())
  press('/', {}, row)
  press('/', { altKey: true })
  press('/', { ctrlKey: true, metaKey: true })
  expect(run).not.toHaveBeenCalled()
})

it('takes ⌘ (Ctrl off macOS) for mod, even in a field', () => {
  const run = vi.fn()
  renderHook(() => useShortcut(shortcut('mod+\\', run)))
  document.body.innerHTML = '<input>'
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  press('\\', mac ? { metaKey: true } : { ctrlKey: true }, document.body.firstElementChild!)
  expect(run).toHaveBeenCalledOnce()
  press('\\')
  expect(run).toHaveBeenCalledOnce()
})

it('lets the newest registration of a key win, and skips one whose when() is false', () => {
  const shell = vi.fn(), page = vi.fn()
  let enabled = true
  renderHook(() => { useShortcut(shortcut('n', shell)); useShortcut(shortcut('n', page, { when: () => enabled })) })
  press('n')
  expect(page).toHaveBeenCalledOnce()
  enabled = false
  press('n')
  expect(shell).toHaveBeenCalledOnce()
})

it('labels keys for display', () => {
  expect(keyLabels('g h')).toEqual(['G', 'H'])
  expect(keyLabels('?')).toEqual(['?'])
  expect(keyLabels('mod+\\')[1]).toBe('\\')
})
