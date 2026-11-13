import type { ReactNode } from 'react'
import { Check, ChevronRight, RefreshCw } from 'lucide-react'
import { stepStatus, type StepTick } from '../../domain/transferTicks'
import { formatGBP } from '../../formatting/money'
import { dayOf } from '../../pages/spendingFormat'
import './StepRow.css'

const pounds = (pence: number) => formatGBP(pence / 100)

/** "Click an amount to copy it for your banking app." Shown until the first copy. */
export function StepCopyHint({ children }: { children: ReactNode }) {
  return <p className="step-copy-hint">{children}</p>
}

/** One account's band and its steps. With `label` it is a named region. */
export function StepGroup({ title, aside, link, label, heading, className = '', footer, children }: {
  title: ReactNode
  aside?: ReactNode
  link?: { label: string; onClick: () => void }
  /** Names the group as a region ("Joint steps"). */
  label?: string
  /** Render the title as a heading at this level; otherwise the band is plain text. */
  heading?: 'h3' | 'h4'
  className?: string
  /** A note under the list ("Includes £112.81 of one-offs already in Joint"). */
  footer?: ReactNode
  children: ReactNode
}) {
  const Title = heading ?? 'span'
  const band = <div className="step-group-band"><Title className="step-group-title">{title}</Title>{aside && <span className="step-group-aside">{aside}</span>}{link && <button type="button" className="text-button step-group-link" onClick={link.onClick}>{link.label}<ChevronRight aria-hidden="true"/></button>}</div>
  const list = <ol className="step-list">{children}</ol>
  const note = footer && <p className="step-caption step-group-footer">{footer}</p>
  return label
    ? <section className={`step-group ${className}`.trim()} aria-label={label}>{band}{list}{note}</section>
    : <div className={`step-group ${className}`.trim()}>{band}{list}{note}</div>
}

type StepRowProps = {
  stepKey: string
  /** The step in words, for the tick's name ("Fund Monzo Joint done"). */
  name: string
  /** What the row shows; the name when absent. */
  label?: ReactNode
  /** The amount to move. Omitted, the row shows none. */
  amountPence?: number
  /** tick: tick it off. copy: the amount copies, nothing to tick. status: a done/to-do mark the app sets. */
  mode?: 'tick' | 'copy' | 'status'
  ticks?: Readonly<Record<string, StepTick>>
  /** Tick a step at its amount, or untick it (null). Absent: the tick is disabled. */
  onTick?: (key: string, amountPence: number | null) => void
  onCopy?: (pence: number) => void
  /** status mode: whether it's done, and a fixed amount to show. */
  done?: boolean
  amountText?: ReactNode
  /** A pot move under its account's funding step. */
  indent?: boolean
  /** The final "Pay Amex" step. */
  emphasis?: 'pay'
  /** Show "Ticked Wed 18 Nov" once done. */
  showTickedDay?: boolean
  /** What to say when the amount changed after the tick. Defaults to Payday's "you sent … Send £X more." */
  changedNote?: (tickedPence: number, differencePence: number) => ReactNode
  caption?: ReactNode
  /** The account it belongs to, for scrolling to an edited account's steps. */
  account?: string
  children?: ReactNode
}

const sendNote = (amountPence: number) => (tickedPence: number, differencePence: number) => <>Changed since ticked: you sent {pounds(tickedPence)}, it’s now {pounds(amountPence)}. {differencePence > 0 ? `Send ${pounds(differencePence)} more.` : `${pounds(-differencePence)} less is needed.`}</>

/**
 * One money move: tick it once it's done, tap the amount to copy it. Changed since ticked, the amount shows and copies
 * only the difference ("+£50.00"), and ticking accepts the new amount. The tick and the amount are separate targets.
 */
export function StepRow({ stepKey, name, label = name, amountPence, mode = 'tick', ticks, onTick, onCopy, done, amountText, indent, emphasis, showTickedDay, changedNote, caption, account, children }: StepRowProps) {
  const status = mode === 'status' ? { state: done ? 'done' as const : 'todo' as const } : stepStatus(ticks, stepKey, amountPence ?? 0)
  const changed = status.state === 'changed' && 'differencePence' in status ? status : null
  const shown = changed ? Math.abs(changed.differencePence) : amountPence ?? 0
  const amount = mode === 'status'
    ? amountText !== undefined && amountText !== null && amountText !== false && <span className="step-amount">{amountText}</span>
    : amountPence !== undefined && <button type="button" className="step-amount" data-list-copy aria-label={`Copy ${pounds(shown)}`} onClick={() => onCopy?.(shown)}>{changed ? `${changed.differencePence > 0 ? '+' : '−'}${pounds(shown)}` : pounds(shown)}</button>
  const tickedAt = showTickedDay && status.state === 'done' ? ticks?.[stepKey]?.at : undefined
  return <li className={`step-row is-${status.state}${mode === 'copy' ? ' is-copy' : ''}${indent ? ' is-indent' : ''}${emphasis === 'pay' ? ' is-pay' : ''}`} data-payday-account={account} data-list-row>
    {mode === 'tick' && <button type="button" data-list-tick className={`step-tick is-${status.state}`} aria-pressed={status.state === 'done'} aria-label={changed ? `${name}: mark the change done` : `${name} done`} disabled={!onTick} onClick={() => onTick?.(stepKey, status.state === 'done' ? null : amountPence ?? 0)}>
      <span className="step-tick-dot" aria-hidden="true">{status.state === 'done' && <Check/>}{changed && <RefreshCw/>}</span>
    </button>}
    {mode === 'status' && <span className={`step-tick is-${status.state}`} aria-hidden="true"><span className="step-tick-dot">{status.state === 'done' && <Check/>}</span></span>}
    <div className="step-body">
      <p className="step-main"><span className="step-label">{label}</span>{amount}</p>
      {changed && <p className="step-changed">{(changedNote ?? sendNote(amountPence ?? 0))(changed.tickedPence!, changed.differencePence)}</p>}
      {tickedAt && <p className="step-caption">Ticked {dayOf(tickedAt)}</p>}
      {caption && <p className="step-caption">{caption}</p>}
      {children}
    </div>
  </li>
}

/** A caption line under a step, for steps with more than one. */
export function StepCaption({ children }: { children: ReactNode }) {
  return <p className="step-caption">{children}</p>
}
