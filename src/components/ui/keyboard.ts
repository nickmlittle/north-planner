import { useEffect } from 'react'

// Phones and the on-screen keyboard (audit 5, F2, F13 and N1). iOS doesn't resize the page when the keyboard opens:
// the visual viewport shrinks (and the layout viewport sometimes does, sometimes not), and anything fixed or low on
// the page can end up under the keyboard or floating mid-screen.

/** A control that brings up the on-screen keyboard when it takes focus. */
export function isTypingField(element: Element | null | undefined): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !['checkbox', 'radio', 'file', 'range', 'color', 'hidden', 'button', 'submit', 'reset', 'image', 'date', 'datetime-local', 'month', 'time', 'week'].includes(element.type)
}

/** A field that brings up the keyboard or a picker (date, select) when it takes focus. */
export const isEntryField = (element: Element) =>
  element.matches('input:not([type=checkbox],[type=radio],[type=file],[type=hidden],[type=button],[type=submit],[type=reset],[type=image]), select, textarea')

/** A touch screen, where focusing a typing field brings up the on-screen keyboard. jsdom has no matchMedia: not touch. */
export const onTouchScreen = () => !!window.matchMedia?.('(pointer: coarse)').matches

/** Whether `element` (the focused one, by default) has the on-screen keyboard up. iOS's viewport heights during the
 *  keyboard's animation are unreliable, so it goes by focus: on a touch screen a focused typing field has the keyboard. */
export const keyboardUp = (element: Element | null = document.activeElement): element is HTMLElement => onTouchScreen() && isTypingField(element)

const GAP = 12

/** Scrolls a focused field on the page (not in a sheet: Sheet.tsx keeps its own in view) up to just above the keyboard. */
function liftFocusedField() {
  const viewport = window.visualViewport, field = document.activeElement
  if (!viewport || !keyboardUp(field) || field.closest('[role="dialog"]')) return
  const visibleBottom = viewport.offsetTop + viewport.height
  const cover = window.innerHeight - visibleBottom
  if (cover <= 0 || field.getBoundingClientRect().bottom <= visibleBottom - GAP) return
  // scrollIntoView finds the right scroller; the margin keeps the field clear of the keyboard.
  field.style.scrollMarginBottom = `${cover + GAP}px`
  field.scrollIntoView({ block: 'nearest' })
  field.style.scrollMarginBottom = ''
}

/** Keeps the focused field on the page above the on-screen keyboard: when the keyboard opens, and when focus moves
 *  to another field while it's open (iOS sometimes leaves that field underneath). While the keyboard is up, <html>
 *  has `data-keyboard`, so the phone's fixed bottom bars can step aside (iOS would float them mid-screen). */
export function useFieldAboveKeyboard() {
  useEffect(() => {
    const viewport = window.visualViewport, root = document.documentElement
    let settle: number | undefined, lift: number | undefined
    // Focus moving between fields fires focusout then focusin: settle once both have run.
    const update = () => {
      root.toggleAttribute('data-keyboard', keyboardUp())
      window.clearTimeout(lift); lift = window.setTimeout(liftFocusedField, 300)
    }
    const soon = () => { window.clearTimeout(settle); settle = window.setTimeout(update) }
    document.addEventListener('focusin', soon)
    document.addEventListener('focusout', soon)
    viewport?.addEventListener('resize', liftFocusedField)
    return () => {
      window.clearTimeout(settle); window.clearTimeout(lift); root.removeAttribute('data-keyboard')
      document.removeEventListener('focusin', soon); document.removeEventListener('focusout', soon)
      viewport?.removeEventListener('resize', liftFocusedField)
    }
  }, [])
}
