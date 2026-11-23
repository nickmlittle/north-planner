import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Kbd } from '../components/ui'
import type { BudgetDocument } from '../domain/budgetDocument'
import { WAITING_NOTE_MAX, type CardTransaction, type WaitingOn } from '../domain/cardTracker'
import { sameReason, signedPounds, waitingReason, waitingReasons } from './spendingFormat'
import './WaitingList.css'

type Props = {
  document: BudgetDocument
  transaction: CardTransaction
  /** The clock icon it opens from: the menu sits under it, or over it when there's no room below. */
  anchor: () => HTMLElement | null
  onMark: (on: WaitingOn, note: string) => void
  /** Esc and Cancel put focus back on the row; a click elsewhere leaves it where it landed. */
  onCancel: (refocus: boolean) => void
}

/** How far the menu keeps from the viewport's edges. */
const EDGE = 8

/**
 * Desktop's "Not ready to sort?" (audit 6, W5–W7): opened by a To sort row's clock icon or W. The reasons run
 * cardholder first, then the other adults and To discuss; the cardholder starts chosen, so W then Enter marks it.
 * 1–3 choose, Enter marks (from anywhere in the menu), Esc cancels. The note is optional (W6).
 */
export function WaitMenu({ document, transaction, anchor, onMark, onCancel }: Props) {
  const reasons = waitingReasons(document, transaction)
  const [on, setOn] = useState<WaitingOn>(reasons[0]!)
  const [note, setNote] = useState('')
  const menu = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const id = useId()

  // Fixed to the viewport, so the table's scroll box doesn't clip it: under the icon, right edges lined up, or over the
  // icon when the row is near the bottom. It follows the icon when the page scrolls. Until it's measured it's
  // transparent, not hidden: a hidden menu can't take focus, and its chosen reason takes focus as it opens.
  useLayoutEffect(() => {
    const measure = () => {
      const clock = anchor()
      if (!clock || !menu.current) return
      const icon = clock.getBoundingClientRect(), box = menu.current.getBoundingClientRect()
      const below = icon.bottom + 4, above = icon.top - 4 - box.height
      // Under the clock if it fits, else over it; when neither fits (a short window), as low as it can sit and still
      // show in full.
      const top = below + box.height <= window.innerHeight - EDGE ? below : above >= EDGE ? above : Math.max(EDGE, window.innerHeight - EDGE - box.height)
      const left = Math.max(EDGE, Math.min(icon.right - box.width, window.innerWidth - EDGE - box.width))
      setPlace(current => current && current.top === top && current.left === left ? current : { top, left })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure) }
    // Once, on opening: the clock stays the same element while the menu is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !anchor()?.contains(event.target as Node)) onCancel(false) }
    window.document.addEventListener('pointerdown', outside)
    return () => window.document.removeEventListener('pointerdown', outside)
    // Once, on opening: onCancel changes identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const typing = target instanceof HTMLInputElement
    const digit = Number(event.key)
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(true) }
    // Enter marks from anywhere but the Cancel button, which keeps its own meaning. On a reason, it marks that reason.
    else if (event.key === 'Enter' && !target.closest('.wait-menu-cancel')) {
      event.preventDefault(); event.stopPropagation()
      const index = target.dataset.reason === undefined ? -1 : Number(target.dataset.reason)
      onMark(reasons[index] ?? on, note)
    }
    else if (!typing && Number.isInteger(digit) && digit >= 1 && digit <= reasons.length) { event.preventDefault(); event.stopPropagation()
      // Focus follows the choice, so Enter then marks the reason just chosen.
      setOn(reasons[digit - 1]!)
      menu.current?.querySelector<HTMLButtonElement>(`[data-reason="${digit - 1}"]`)?.focus()
    }
  }

  const sub = (reason: WaitingOn) => reason.kind === 'person' ? reason.personId === transaction.personId ? `${document.household.adults.find(person => person.id === reason.personId)?.name}’s card` : ''
    : document.household.adults.length === 2 ? 'Both of you' : ''

  return <div ref={menu} className="wait-menu" role="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} onKeyDown={onKey}
    style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, opacity: 0 }}>
    <div>
      <p className="wait-menu-title" id={`${id}-title`}>Not ready to sort?</p>
      <p className="wait-menu-hint" id={`${id}-hint`}>{transaction.description} · {signedPounds(transaction.amountPence)} · leaves To sort, counts in no pot</p>
    </div>
    <div className="wait-menu-reasons" role="group" aria-label="Waiting on">
      {reasons.map((reason, index) => <button key={reason.kind === 'person' ? reason.personId : 'discuss'} type="button" className="wait-menu-reason" aria-pressed={sameReason(reason, on)}
        data-reason={index} aria-keyshortcuts={index < 9 ? String(index + 1) : undefined} onClick={() => setOn(reason)}>
        {index < 9 && <Kbd>{index + 1}</Kbd>}<span className="wait-menu-reason-name">{waitingReason(document, reason)}</span>{sub(reason) && <span className="wait-menu-reason-sub">{sub(reason)}</span>}
      </button>)}
    </div>
    <label className="spending-field wait-menu-note">Note (optional)<input value={note} maxLength={WAITING_NOTE_MAX} onChange={event => setNote(event.target.value)}/></label>
    <div className="wait-menu-actions">
      <button type="button" className="secondary-button wait-menu-cancel" onClick={() => onCancel(true)}>Cancel</button>
      <button type="button" className="primary-button" onClick={() => onMark(on, note)}>Mark waiting</button>
    </div>
    <p className="wait-menu-keys" aria-hidden="true"><Kbd>1</Kbd>–<Kbd>{Math.min(reasons.length, 9)}</Kbd> choose · <Kbd>↵</Kbd> mark · <Kbd>Esc</Kbd> cancel</p>
  </div>
}
