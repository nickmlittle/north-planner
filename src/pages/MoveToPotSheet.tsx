import { useListNavigation } from '../state/useListNavigation'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import { StepCopyHint, StepGroup, StepRow } from '../components/ui/StepRow'
import { useStepCopy } from '../components/ui/useStepCopy'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, localDate, parseStatementKey } from '../domain/cardTracker'
import { heldPurchases } from '../domain/expectingBack'
import type { SettleStep } from '../domain/cardStatements'
import { moveSteps, potPhrase, toMove, type ToMoveRow } from '../domain/setAside'
import { billsName, markSetAsideMoved, payBackNotes } from './setAsideMove'
import { shortAccountLabels } from './budgetLabels'
import { destinationNamer, frontSourceName } from './cardLabels'
import { billName, plural, pounds, signedPounds, transactionMeta } from './spendingFormat'

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

/**
 * Move to the Amex pot: everything sorted since the last move, with the moves to make in the banking app.
 * Untick anything not moved yet, then "Moved" records the rest.
 */
export function MoveToPotSheet({ document, setDocument, cardId, statementKey, onClose, onMoved, now = () => new Date() }: Props) {
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = document.budget.pots.find(row => row.id === card?.setAside?.potId)
  const today = localDate(now())
  const rows = toMove(document, cardId, statementKey, today)
  // Expecting back (D11): held money stays in its pot while the bill is open; once it has closed, it moves with the rest.
  const held = heldPurchases(cardTracker(document), today).filter(row => row.purchase.cardId === cardId && (!statementKey || row.purchase.statementKey === statementKey) && row.outPence > 0)
  const staying = held.filter(row => row.open)
  const released = new Map(held.filter(row => !row.open).map(row => [row.purchase.id, row.outPence]))
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const selected = rows.filter(row => !unticked.has(row.transaction.id))
  const plan = moveSteps(document, cardId, selected)
  const name = destinationNamer(document)
  const { copy, hintSeen, status: copiedStatus } = useStepCopy()
  if (!card || !pot || !plan) return null
  const phrase = potPhrase(pot.name)
  const title = `Move to ${phrase}`
  // Into the Amex pot, plus what pays the buffer back (W11): everything leaving the pots.
  const total = plan.totalPence + plan.payBackPence
  const payBacks = payBackNotes(document, card, plan, selected, today)
  // What it covers: split by where the money goes once any row pays the buffer back.
  const fronted = rows.filter(row => row.front)
  const groups = !fronted.length ? [{ key: 'all', heading: '', rows }] : [
    ...[...new Map(fronted.map(row => [row.front!.id, row.front!])).values()].map(front => ({ key: front.id, heading: `Pays ${frontSourceName(document, card, front.source)} back · ${billsName([front.statementKey])}`, rows: fronted.filter(row => row.front!.id === front.id) })),
    ...rows.some(row => !row.front) ? [{ key: 'pot', heading: `Into ${phrase} · ${billsName(rows.filter(row => !row.front).map(row => row.transaction.statementKey))}`, rows: rows.filter(row => !row.front) }] : []]

  const what = (row: ToMoveRow) => row.lines.map(line => `${name(line.destination)} ${signedPounds(line.amountPence)}`).join(', ')
  const toggle = (id: string) => setUnticked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const moved = () => { const { text, id } = markSetAsideMoved(document, setDocument, cardId, selected, now()); onMoved(text, id) }

  // The actions sit in the sheet's footer, so Moved stays in view while the list scrolls (pinned on phones).
  const footer = !rows.length ? <button type="button" className="primary-button" onClick={onClose}>Done</button> : <>
    <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
    <button type="button" className="primary-button" disabled={!selected.length} onClick={moved}>{!selected.length ? 'Tick what you moved' : total ? `Moved ${pounds(Math.abs(total))}` : 'Moved'}</button>
  </>
  return <ModalDialog title={title} onClose={onClose} className="move-sheet" footer={footer}>
    {!rows.length ? <p className="bring-in-lead">Everything sorted is already in {phrase}.</p> : <>
      <section className="move-summary" aria-labelledby="move-total">
        <p className="spending-eyebrow" id="move-total">{total < 0 ? `Back out of ${pot.name}` : `To move`}</p>
        <p className="spending-big">{pounds(Math.abs(total))} <small>{plural(selected.length, 'transaction')}</small></p>
      </section>
      {selected.length > 0 && <section className="move-steps" aria-label="Moves to make">
        {copiedStatus}
        {!hintSeen && <StepCopyHint>Tap an amount to copy it for your banking app.</StepCopyHint>}
        <SetAsideSteps document={document} cardId={cardId} rows={selected} onCopy={pence => void copy(pence)}/>
      </section>}
      {payBacks.map(line => <p key={line.key} className="move-pay-back"><strong>{line.lead}</strong> <span>{line.detail}</span></p>)}
      <fieldset className="move-transactions">
        <legend>What it covers</legend>
        <p className="move-hint">Untick anything you haven’t moved yet. It stays here for next time.</p>
        {staying.map(row => <p key={row.purchase.id} className="move-hint move-held">{row.purchase.description}: {pounds(row.outPence)} expecting back stays in {row.byDestination.filter(part => part.outPence > 0).map(part => name(part.destination)).join(' and ')} until the refund or the bill.</p>)}
        {groups.map(group => <div key={group.key} className="move-group">
        {group.heading && <h3 className="move-group-eyebrow">{group.heading}</h3>}
        <ul>{group.rows.map(row => <li key={row.transaction.id}><label className="move-transaction">
          <input type="checkbox" checked={!unticked.has(row.transaction.id)} onChange={() => toggle(row.transaction.id)}/>
          <span className="move-transaction-body">
            <span className="spending-row-main"><span className="spending-row-title">{row.transaction.description}</span><span className="spending-row-amount">{signedPounds(row.pence)}</span></span>
            <span className="spending-row-meta">{transactionMeta(document, row.transaction)}</span>
            <span className="spending-row-meta">{row.changed ? <><span className="spending-tag is-changed">Changed since moved</span> {what(row)}</> : what(row)}</span>
            {released.has(row.transaction.id) && <span className="spending-row-meta">Includes {pounds(released.get(row.transaction.id)!)} expecting back: not refunded by the bill, so it moves now</span>}
          </span>
        </label></li>)}</ul>
        </div>)}
      </fieldset>
    </>}
  </ModalDialog>
}

/**
 * The moves to make in the banking app for these set-aside rows, banded by account: out of each pot, send to the
 * hub account, into the Amex pot. Copy-only steps. Used by the Set aside block and the sheet.
 */
export function SetAsideSteps({ document, cardId, rows, onCopy }: { document: BudgetDocument; cardId: string; rows: readonly ToMoveRow[]; onCopy: (pence: number) => void }) {
  const stepKeys = useListNavigation({ label: 'Set-aside moves', keys: { c: 'Copy the amount' } })
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = document.budget.pots.find(row => row.id === card?.setAside?.potId)
  const plan = moveSteps(document, cardId, rows)
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const potName = (potId?: string) => document.budget.pots.find(row => row.id === potId)?.name ?? 'Pot'
  if (!pot || !plan) return null
  const stepLabel = (step: SettleStep) => step.kind === 'out' ? `Out of ${potName(step.potId)}` : step.kind === 'into' ? `Into ${potName(step.potId)}`
    : step.kind === 'send' ? `Send to ${label(plan.accountId)}` : `Send to ${label(plan.accounts.find(account => account.steps.includes(step))?.accountId ?? '')} from ${label(plan.accountId)}`
  const step = (key: string, text: string, pence: number, potMove: boolean, caption?: string) => <StepRow key={key} mode="copy" stepKey={key} name={text} amountPence={pence} indent={potMove} onCopy={onCopy} caption={caption}/>
  const total = plan.totalPence
  // With rows paying the buffer back (W11), only some of the money goes into the pot: "Only December’s".
  const potMonths = [...new Set(rows.filter(row => !row.front).map(row => row.transaction.statementKey))]
  const only = plan.payBack.length && potMonths.length === 1 ? `Only ${billName(parseStatementKey(potMonths[0]!)?.closeDate ?? '').replace(/ bill$/, '')}’s` : undefined
  // Money goes into the set-aside pot last; when refunds outweigh spend it comes out of it first.
  const potStep = total === 0 ? null : step('set-aside', total > 0 ? `Into ${pot.name}` : `Out of ${pot.name}`, Math.abs(total), true, only)
  // Then the pay-backs, from the same account: Into a source pot, or Send to another account.
  const payBackLabel = (row: SettleStep) => row.kind === 'into' ? `Into ${potName(row.potId)}` : row.kind === 'out' ? `Out of ${potName(row.potId)}` : row.kind === 'send' ? `Send to ${label(row.accountId)}` : `Send to ${label(plan.accountId)} from ${label(row.accountId)}`
  const payBackSteps = plan.payBack.flatMap(row => row.steps).map(row => step(row.key, payBackLabel(row), row.amountPence, row.kind === 'into' || row.kind === 'out'))
  const hub = plan.accounts.find(account => account.accountId === plan.accountId)
  const others = plan.accounts.filter(account => account.accountId !== plan.accountId && account.steps.length)
  return <div className="set-aside-moves" {...stepKeys.listProps}>{stepKeys.hint}
    {total < 0 && hub && <StepGroup heading="h3" title={label(plan.accountId)} aside={owners(document, hub.ownerPersonIds)}>{potStep}</StepGroup>}
    {others.map(account => <StepGroup key={account.accountId} label={`${label(account.accountId)} moves`} heading="h3" title={label(account.accountId)} aside={owners(document, account.ownerPersonIds)}>
      {account.steps.map(row => step(row.key, stepLabel(row), row.amountPence, row.kind === 'out' || row.kind === 'into'))}
    </StepGroup>)}
    {(hub?.steps.length || total > 0 || payBackSteps.length > 0) && <StepGroup label={`${label(plan.accountId)} moves`} heading="h3" title={label(plan.accountId)} aside={owners(document, document.budget.accounts.find(account => account.id === plan.accountId)?.ownerPersonIds ?? [])}
      footer={hub?.oneOffsPence ? `Includes ${pounds(hub.oneOffsPence)} of one-offs already in ${label(plan.accountId)}` : undefined}>
      {hub?.steps.map(row => step(row.key, stepLabel(row), row.amountPence, true))}{total > 0 && potStep}{payBackSteps}
    </StepGroup>}
  </div>
}
