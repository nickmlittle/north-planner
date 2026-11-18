// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { isEntryField, isTypingField, useFieldAboveKeyboard } from './keyboard'

beforeEach(() => { if (!window.matchMedia) window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const touch = () => vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query === '(pointer: coarse)', media: query }) as unknown as MediaQueryList)
const settle = () => new Promise(resolve => setTimeout(resolve))

it('knows which fields bring up the keyboard, and which bring up a keyboard or a picker', () => {
  const make = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; return box.firstElementChild! }
  expect(isTypingField(make('<input>'))).toBe(true)
  expect(isTypingField(make('<input inputmode="decimal">'))).toBe(true)
  expect(isTypingField(make('<textarea></textarea>'))).toBe(true)
  expect(isTypingField(make('<input type="checkbox">'))).toBe(false)
  expect(isTypingField(make('<input type="date">'))).toBe(false)
  expect(isTypingField(make('<select></select>'))).toBe(false)
  expect(isEntryField(make('<input type="date">'))).toBe(true)
  expect(isEntryField(make('<select></select>'))).toBe(true)
  expect(isEntryField(make('<input type="checkbox">'))).toBe(false)
  expect(isEntryField(make('<button></button>'))).toBe(false)
})

function Page() {
  useFieldAboveKeyboard()
  return <><input aria-label="Amount"/><select aria-label="Pot"><option>Groceries</option></select></>
}

it('marks <html> while a typing field on a touch screen has focus, so the bottom bars can step aside', async () => {
  touch()
  render(<Page/>)
  screen.getByRole('textbox', { name: 'Amount' }).focus()
  await settle()
  expect(document.documentElement).toHaveAttribute('data-keyboard')
  screen.getByRole('combobox', { name: 'Pot' }).focus()
  await settle()
  expect(document.documentElement).not.toHaveAttribute('data-keyboard')
})

it('leaves <html> alone with a mouse and keyboard', async () => {
  render(<Page/>)
  screen.getByRole('textbox', { name: 'Amount' }).focus()
  await settle()
  expect(document.documentElement).not.toHaveAttribute('data-keyboard')
})
