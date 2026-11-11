import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker } from '../domain/cardTracker'
import type { SettleStep } from '../domain/cardStatements'
import { moveSteps, potPhrase, recordMove, toMove, type ToMoveRow } from '../domain/setAside'
import { shortAccountLabels } from './budgetLabels'
import { destinationNamer } from './cardLabels'
import { copyHintSeen, copyText, rememberCopyHint } from './copyHint'
import { plural, pounds, signedPounds, transactionMeta } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  cardId: string
  /** Only this statement's transactions (settling up). */
  statementKey?: string
  onClose: () => void
  /** After "Moved": the message and the move's id, for Undo. */
  onMoved: (text: string, moveId: string) => void
  now?: () => Date
}

/** "Either of you" for a joint account, else the owner's name. */
const owners = (document: BudgetDocument, ownerPersonIds: readonly string[]) => ownerPersonIds.length > 1 ? 'Either of you' : document.household.adults.find(person => person.id === ownerPersonIds[0])?.name ?? ''

/** One move to make in the banking app; tap the amount to copy it. */
function MoveStep({ text, pence, potMove, onCopy }: { text: string; pence: number; potMove: boolean; onCopy: (pence: number) => Promise<void> }) {
  return <li className={`move-step${potMove ? ' is-pot-move' : ''}`}>
    <span className="move-step-label">{text}</span>
    <button type="button" className="payday-step-amount" aria-label={`Copy ${pounds(pence)}`} onClick={() => void onCopy(pence)}>{pounds(pence)}</button>
  </li>
}

/**
 * Move to the Amex pot: everything sorted since the last move, with the moves to make in the banking app.
 * Untick anything not moved yet, then "Moved" records the rest.
 */
export function MoveToPotSheet({ document, setDocument, cardId, statementKey, onClose, onMoved, now = () => new Date() }: Props) {
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = document.budget.pots.find(row => row.id === card?.setAside?.potId)
  const rows = toMove(document, cardId, statementKey)
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const selected = rows.filter(row => !unticked.has(row.transaction.id))
  const plan = moveSteps(document, cardId, selected)
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const name = destinationNamer(document)
  const potName = (potId?: string) => document.budget.pots.find(row => row.id === potId)?.name ?? 'Pot'
  const [copied, setCopied] = useState('')
  const [hintSeen, setHintSeen] = useState(copyHintSeen)
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clear.current), [])
  if (!card || !pot || !plan) return null
  const phrase = potPhrase(pot.name)
  const title = `Move to ${phrase}`

  const copy = async (pence: number) => {
    let message = `Copied ${pounds(pence)}`
    try { await navigator.clipboard.writeText(copyText(pence)) } catch { message = 'Couldn’t copy' }
    setCopied(message)
    if (!hintSeen) { rememberCopyHint(); setHintSeen(true) }
    clearTimeout(clear.current)
    clear.current = setTimeout(() => setCopied(''), 2500)
  }
  const stepLabel = (step: SettleStep) => step.kind === 'out' ? `Out of ${potName(step.potId)}` : step.kind === 'into' ? `Into ${potName(step.potId)}`
    : step.kind === 'send' ? `Send to ${label(plan.accountId)}` : `Send to ${label(plan.accounts.find(account => account.steps.includes(step))?.accountId ?? '')} from ${label(plan.accountId)}`
  const step = (key: string, text: string, pence: number, potMove: boolean) => <MoveStep key={key} text={text} pence={pence} potMove={potMove} onCopy={copy}/>
  const total = plan.totalPence
  // Money goes into the set-aside pot last; when refunds outweigh spend it comes out of it first.
  const potStep = total === 0 ? null : step('set-aside', total > 0 ? `Into ${pot.name}` : `Out of ${pot.name}`, Math.abs(total), true)
  const hub = plan.accounts.find(account => account.accountId === plan.accountId)
  const others = plan.accounts.filter(account => account.accountId !== plan.accountId && account.steps.length)
  const what = (row: ToMoveRow) => row.lines.map(line => `${name(line.destination)} ${signedPounds(line.amountPence)}`).join(', ')
  const toggle = (id: string) => setUnticked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const moved = () => {
    const id = crypto.randomUUID()
    setDocument(current => recordMove(current, cardId, selected.map(row => row.transaction.id), now(), id))
    onMoved(total > 0 ? `Moved ${pounds(total)} to ${phrase}.` : total < 0 ? `Moved ${pounds(-total)} back out of ${phrase}.` : 'Moved between pots.', id)
  }

  return <ModalDialog title={title} onClose={onClose} className="move-sheet">
    {!rows.length ? <>
      <p className="bring-in-lead">Everything sorted is already in {phrase}.</p>
      <div className="bring-in-actions"><button type="button" className="primary-button" onClick={onClose}>Done</button></div>
    </> : <>
      <section className="move-summary" aria-labelledby="move-total">
        <p className="spending-eyebrow" id="move-total">{total < 0 ? `Back out of ${pot.name}` : `To move`}</p>
        <p className="spending-big">{pounds(Math.abs(total))} <small>{plural(selected.length, 'transaction')}</small></p>
      </section>
      {selected.length > 0 && <section className="move-steps" aria-label="Moves to make">
        <p className="payday-copied" role="status">{copied}</p>
        {!hintSeen && <p className="payday-copy-hint">Tap an amount to copy it for your banking app.</p>}
        {total < 0 && hub && <><h3 className="payday-person-heading"><span>{label(plan.accountId)}</span><span>{owners(document, hub.ownerPersonIds)}</span></h3><ol>{potStep}</ol></>}
        {others.map(account => <section key={account.accountId} aria-label={`${label(account.accountId)} moves`}>
          <h3 className="payday-person-heading"><span>{label(account.accountId)}</span><span>{owners(document, account.ownerPersonIds)}</span></h3>
          <ol>{account.steps.map(row => step(row.key, stepLabel(row), row.amountPence, row.kind === 'out' || row.kind === 'into'))}</ol>
        </section>)}
        {(hub?.steps.length || total > 0) && <section aria-label={`${label(plan.accountId)} moves`}>
          <h3 className="payday-person-heading"><span>{label(plan.accountId)}</span><span>{owners(document, document.budget.accounts.find(account => account.id === plan.accountId)?.ownerPersonIds ?? [])}</span></h3>
          <ol>{hub?.steps.map(row => step(row.key, stepLabel(row), row.amountPence, true))}{total > 0 && potStep}</ol>
          {hub?.oneOffsPence ? <p className="payday-step-caption">Includes {pounds(hub.oneOffsPence)} of one-offs already in {label(plan.accountId)}</p> : null}
        </section>}
      </section>}
      <fieldset className="move-transactions">
        <legend>What it covers</legend>
        <p className="move-hint">Untick anything you haven’t moved yet. It stays here for next time.</p>
        <ul>{rows.map(row => <li key={row.transaction.id}><label className="move-transaction">
          <input type="checkbox" checked={!unticked.has(row.transaction.id)} onChange={() => toggle(row.transaction.id)}/>
          <span className="move-transaction-body">
            <span className="spending-row-main"><span className="spending-row-title">{row.transaction.description}</span><span className="spending-row-amount">{signedPounds(row.pence)}</span></span>
            <span className="spending-row-meta">{transactionMeta(document, row.transaction)}</span>
            <span className="spending-row-meta">{row.changed ? <><span className="spending-tag is-changed">Changed since moved</span> {what(row)}</> : what(row)}</span>
          </span>
        </label></li>)}</ul>
      </fieldset>
      <div className="bring-in-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={!selected.length} onClick={moved}>{!selected.length ? 'Tick what you moved' : total ? `Moved ${pounds(Math.abs(total))}` : 'Moved'}</button>
      </div>
    </>}
  </ModalDialog>
}
