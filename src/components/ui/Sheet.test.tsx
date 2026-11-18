// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Sheet } from './Sheet'
afterEach(cleanup)

function Harness({ footer = false, dismissOnScrim = false, returnFocusTo }: { footer?: boolean; dismissOnScrim?: boolean; returnFocusTo?: () => HTMLElement | null }) {
  const [open, setOpen] = useState(false)
  return <div id="page">
    <button type="button" onClick={() => setOpen(true)}>Open</button>
    <p>Page text</p>
    {open && <Sheet title="Move money" description="Ada · Monzo Joint" onClose={() => setOpen(false)} dismissOnScrim={dismissOnScrim} returnFocusTo={returnFocusTo}
      footer={footer ? <><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button">Mark moved</button></> : undefined}>
      <label>Amount<input defaultValue="140.59"/></label>
      <select aria-label="Pot"><option>Groceries</option></select>
      <textarea aria-label="Note" defaultValue=""/>
    </Sheet>}
  </div>
}
const open = () => { const trigger = screen.getByRole('button', { name: 'Open' }); trigger.focus(); fireEvent.click(trigger); return trigger }

it('is a labelled modal dialog with a description, a close button and a size', () => {
  render(<Harness/>)
  open()
  const dialog = screen.getByRole('dialog', { name: 'Move money' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(dialog).toHaveAccessibleDescription('Ada · Monzo Joint')
  expect(dialog).toHaveAttribute('data-size', 'md')
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  expect(dialog.querySelector('.sheet-handle')).toHaveAttribute('aria-hidden', 'true')
})

it('makes the page inert and locks its scroll while open, and undoes both on close', () => {
  render(<Harness/>)
  open()
  expect(document.getElementById('page')!.closest('[inert]')).not.toBeNull()
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(document.querySelector('[inert]')).toBeNull()
  expect(document.body.style.overflow).toBe('')
})

it('closes on Escape and returns focus to the opener', () => {
  render(<Harness/>)
  const trigger = open()
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveFocus()
})

it('falls back to returnFocusTo when the opener has gone', () => {
  const fallback = document.createElement('button'); fallback.textContent = 'Fallback'; document.body.append(fallback)
  render(<Harness returnFocusTo={() => fallback}/>)
  const trigger = open()
  trigger.remove()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(fallback).toHaveFocus()
  fallback.remove()
})

it('traps Tab, including selects and textareas, and wraps both ways', () => {
  render(<Harness footer/>)
  open()
  const dialog = screen.getByRole('dialog'), close = screen.getByRole('button', { name: 'Close' }), last = screen.getByRole('button', { name: 'Mark moved' })
  last.focus()
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(last).toHaveFocus()
  // The textarea is a stop of its own, so Tab from it isn't swallowed.
  screen.getByRole('textbox', { name: 'Note' }).focus()
  expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true)
})

it('puts footer actions in their own row after the scrolling body', () => {
  render(<Harness footer/>)
  open()
  const dialog = screen.getByRole('dialog')
  const footer = dialog.querySelector('.sheet-footer')!
  expect(dialog.lastElementChild).toBe(footer)
  expect([...footer.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Cancel', 'Mark moved'])
  expect(dialog.querySelector('.sheet-body')).not.toContainElement(footer as HTMLElement)
})

it('closes on the scrim only when asked to', () => {
  const { unmount } = render(<Harness/>)
  open()
  fireEvent.mouseDown(document.querySelector('.sheet-overlay')!)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  unmount()
  render(<Harness dismissOnScrim/>)
  open()
  fireEvent.mouseDown(screen.getByRole('dialog'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.mouseDown(document.querySelector('.sheet-overlay')!)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('starts focus on a [data-autofocus] control when there is one', () => {
  const onClose = vi.fn()
  render(<Sheet title="Remove Groceries?" onClose={onClose}><button type="button">Remove</button><button type="button" data-autofocus>Cancel</button></Sheet>)
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
})

describe('on a touch screen (audit 5)', () => {
  const touch = () => vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: query === '(pointer: coarse)', media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
  beforeEach(() => { if (!window.matchMedia) window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia })
  afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(window, 'visualViewport') })

  it('does not focus a [data-autofocus] field when it opens, so the keyboard stays down; the first button takes focus', () => {
    touch()
    render(<Sheet title="Can we afford…" onClose={() => {}}><input data-autofocus aria-label="Amount"/><select data-autofocus aria-label="Pot"><option>Groceries</option></select></Sheet>)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('focuses the sheet itself when no button shows (Search hides its header), so Escape still closes it', () => {
    touch()
    const visible = vi.fn(function (this: Element) { return !this.classList.contains('sheet-close') })
    Object.defineProperty(HTMLElement.prototype, 'checkVisibility', { configurable: true, value: visible })
    const onClose = vi.fn()
    try {
      render(<Sheet title="Search North" onClose={onClose}><input data-autofocus aria-label="Search North"/></Sheet>)
      expect(screen.getByRole('dialog')).toHaveFocus()
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'checkVisibility') }
  })

  it('still focuses a [data-autofocus] button or checkbox', () => {
    touch()
    render(<Sheet title="Remove Groceries?" onClose={() => {}}><button type="button">Remove</button><button type="button" data-autofocus>Cancel</button></Sheet>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps focusing the field with a mouse and keyboard', () => {
    render(<Sheet title="Can we afford…" onClose={() => {}}><input data-autofocus aria-label="Amount"/></Sheet>)
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveFocus()
  })

  it('pads the sheet into the visual viewport, and marks the keyboard up while a field has focus', async () => {
    touch()
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, height: 549, scale: 1 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    render(<Sheet title="Check against Monzo" onClose={() => {}}><input aria-label="Balance"/></Sheet>)
    const overlay = document.querySelector<HTMLElement>('.sheet-overlay')!
    expect(overlay.style.getPropertyValue('--sheet-viewport-height')).toBe('549px')
    screen.getByRole('textbox', { name: 'Balance' }).focus()
    Object.assign(viewport, { offsetTop: 237, height: 312 })
    viewport.dispatchEvent(new Event('resize'))
    await new Promise(resolve => setTimeout(resolve))
    expect(overlay.style.getPropertyValue('--sheet-viewport-top')).toBe('237px')
    expect(overlay.style.getPropertyValue('--sheet-viewport-height')).toBe('312px')
    expect(overlay).toHaveAttribute('data-keyboard')
    screen.getByRole('button', { name: 'Close' }).focus()
    await new Promise(resolve => setTimeout(resolve))
    expect(overlay).not.toHaveAttribute('data-keyboard')
  })
})
