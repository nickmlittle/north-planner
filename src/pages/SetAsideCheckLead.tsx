import type { Dispatch, SetStateAction } from 'react'
import { ListRow } from '../components/ui'
import { StepCopyHint, StepRow } from '../components/ui/StepRow'
import { useStepCopy } from '../components/ui/useStepCopy'
import { useToast } from '../components/ui/useToast'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, destinationKey, localDate, type SetAsideMove } from '../domain/cardTracker'
import type { SettleStep } from '../domain/cardStatements'
import type { BudgetDestination } from '../domain/monthlyBudget'
import { potPhrase, undoMove } from '../domain/setAside'
import { amexPotKnown, potBills } from '../domain/billSum'
import { gapDestination, gapSteps, recordGapMove, setAsideCheck, undoGapMove } from '../domain/setAsideCheck'
import { shortAccountLabels } from './budgetLabels'
import { dayDate, destinationNamer } from './cardLabels'
import { billName, dayOf, plural, pounds, signedPounds, statementName } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  cardId: string
  today: string
  /** "Monzo", for "Matches Monzo" and "Check against Monzo". */
  bank: string
  onCheck: () => void
  /** A statement's page on Spending, for a closed statement with no Pay tick. */
  onOpenStatement?: (statementKey: string) => void
  now?: () => Date
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The Amex pot's lead (card-tracker-rules, "Checking the Amex pot" and "Bill and pot sums"): In the Amex pot, one line
 * per bill it holds money for, plus any extra or short. It reads "Matches Monzo" only after a check made after the last
 * move; until then it's worked out. Extra: the steps to move it to the card's buffer, then Moved. Short: what might
 * explain it (a statement paid but not ticked, the recent moves, each with Undo) and a top-up from the buffer.
 */
export function SetAsideCheckLead({ document, setDocument, cardId, today, bank, onCheck, onOpenStatement, now = () => new Date() }: Props) {
  const { show, toast } = useToast()
  const check = setAsideCheck(document, cardId, today)
  const card = cardTracker(document).cards.find(row => row.id === cardId)
  const pot = document.budget.pots.find(row => row.id === check?.potId)
  if (!check || !card || !pot) return null
  const phrase = potPhrase(pot.name)
  const buffer = destinationNamer(document)(gapDestination(card))
  const gap = check.gapPence ?? 0
  const record = (pence: number) => {
    const id = crypto.randomUUID()
    setDocument(current => recordGapMove(current, cardId, pence, now(), id))
    show(pence > 0 ? `Moved ${pounds(pence)} to ${buffer}. ${capital(phrase)} has what its bills need.` : `Topped up ${phrase} with ${pounds(-pence)}. It has what its bills need.`,
      { label: 'Undo', onClick: () => setDocument(current => undoGapMove(current, id)) })
  }
  const undo = (move: SetAsideMove) => {
    setDocument(current => undoMove(current, move.id))
    show('Move undone. Those transactions are back on the list to move.')
  }
  const known = amexPotKnown(document, cardId, today)
  const inPot = check.holdsPence ?? check.shouldHoldPence
  const held = potBills(document, cardId, today).filter(bill => bill.inPotPence !== 0)
  // What the figure is: matched at a check after the last move, a gap the check found, or worked out from the moves.
  const status = check.state === 'extra' || check.state === 'short' ? `${pounds(Math.abs(gap))} ${check.state} · checked ${dayOf(check.checkedAt!)}`
    : known === 'checked' ? `Matches ${bank} · checked ${dayOf(check.checkedAt!)}` : check.checkedAt ? `Worked out · checked against ${bank} ${dayOf(check.checkedAt)}` : `Worked out · not checked against ${bank} yet`

  return <section className={`pot-lead pot-check is-${check.state === 'matches' && known !== 'checked' ? 'unchecked' : check.state}`} aria-labelledby="pot-check-label">
    <p className="pot-lead-label" id="pot-check-label">In {phrase}</p>
    <p className="pot-lead-value">{signedPounds(inPot)}</p>
    <p className="pot-check-status">{status}</p>
    {held.length === 1 && gap === 0 && <p className="pot-check-status">All of it is for the {billName(held[0]!.closeDate, held[0]!.open)}.</p>}
    {(held.length > 1 || gap !== 0) && <dl className="carry-over-sums">
      {held.map(bill => <div key={bill.statementKey}><dt>For the {billName(bill.closeDate, bill.open)}</dt><dd>{signedPounds(bill.inPotPence)}</dd></div>)}
      {gap !== 0 && <div><dt>{gap > 0 ? 'Extra' : 'Short'}</dt><dd>{signedPounds(gap)}</dd></div>}
      <div className="is-total"><dt>In {phrase}</dt><dd>{signedPounds(inPot)}</dd></div>
    </dl>}
    {known !== 'checked' && check.state !== 'extra' && check.state !== 'short' && <p className="pot-check-again"><button type="button" className="secondary-button" onClick={onCheck}>Check against {bank}</button></p>}
    {check.state === 'extra' && <div className="pot-check-act">
      <p className="pot-check-say">Move it to {buffer}.</p>
      <GapSteps document={document} cardId={cardId} pence={gap}/>
      <p><button type="button" className="primary-button" onClick={() => record(gap)}>Moved {pounds(gap)}</button></p>
      <p className="pot-check-hint">Moved money early for a purchase that isn’t in North yet? Leave it. It matches once the purchase arrives and you mark it moved.</p>
    </div>}
    {check.state === 'short' && <div className="pot-check-act">
      <p className="pot-check-say">Did a transfer not happen? Make it now, then check {phrase} again.</p>
      {check.unpaidClosed.map(row => <p key={row.statementKey} className="pot-check-say">The {statementName(row.closeDate)} has no Pay tick. Paid it? Tick Pay when you settle up.{onOpenStatement && <> <button type="button" className="text-button" onClick={() => onOpenStatement(row.statementKey)}>Open the {statementName(row.closeDate)}</button></>}</p>)}
      {check.recentMoves.length > 0 && <RecentMoves document={document} moves={check.recentMoves} setAsidePotId={pot.id} onUndo={undo}/>}
      <p className="pot-check-say">Or top up {phrase} from {buffer}.</p>
      <GapSteps document={document} cardId={cardId} pence={gap}/>
      <p><button type="button" className="secondary-button" onClick={() => record(gap)}>Topped up {pounds(-gap)}</button></p>
    </div>}
    {toast}
  </section>
}

/** The banking steps for moving extra out, or topping up: tap an amount to copy it. */
function GapSteps({ document, cardId, pence }: { document: BudgetDocument; cardId: string; pence: number }) {
  const { copy, hintSeen, status } = useStepCopy()
  const plan = gapSteps(document, cardId, pence)
  if (!plan) return null
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const label = (accountId: string) => labels.get(accountId) ?? 'Account'
  const potName = (potId?: string) => document.budget.pots.find(row => row.id === potId)?.name ?? 'Pot'
  const text = (step: SettleStep) => step.kind === 'out' ? `Out of ${potName(step.potId)}` : step.kind === 'into' ? `Into ${potName(step.potId)}` : `Send to ${label(plan.toAccountId)} from ${label(step.accountId)}`
  return <div className="move-steps pot-check-steps">
    {status}
    {!hintSeen && <StepCopyHint>Tap an amount to copy it for your banking app.</StepCopyHint>}
    <ol className="step-list" aria-label={pence > 0 ? 'Moves to make' : 'Top-up to make'}>
      {plan.steps.map((step, index) => <StepRow key={`${step.key}:${index}`} mode="copy" stepKey={step.key} name={text(step)} amountPence={step.amountPence} onCopy={amount => void copy(amount)}/>)}
    </ol>
  </div>
}

/** What a move took out of each pot or account, biggest first: "Groceries £58.20, Fuel £60.00". */
function moveParts(document: BudgetDocument, move: SetAsideMove, setAsidePotId: string): string {
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const name = (destination: BudgetDestination) => destination.kind === 'pot' ? document.budget.pots.find(row => row.id === destination.potId)?.name ?? 'Pot' : labels.get(destination.accountId) ?? 'Account'
  const totals = new Map<string, { name: string; pence: number }>()
  for (const line of move.transactions.flatMap(row => row.lines)) {
    if (line.destination.kind === 'pot' && line.destination.potId === setAsidePotId) continue
    const key = destinationKey(line.destination)
    const row = totals.get(key) ?? { name: name(line.destination), pence: 0 }
    row.pence += line.amountPence
    totals.set(key, row)
  }
  const rows = [...totals.values()].filter(row => row.pence !== 0).sort((a, b) => Math.abs(b.pence) - Math.abs(a.pence))
  const shown = rows.slice(0, 3).map(row => `${row.name} ${signedPounds(row.pence)}`)
  return rows.length > 3 ? `${shown.join(', ')} and ${rows.length - 3} more` : shown.join(', ')
}

/** The card's last moves, newest first, each with Undo: where to look when the pot is short. */
function RecentMoves({ document, moves, setAsidePotId, onUndo }: { document: BudgetDocument; moves: SetAsideMove[]; setAsidePotId: string; onUndo: (move: SetAsideMove) => void }) {
  return <div className="pot-check-moves">
    <h3 className="pot-check-heading" id="pot-check-moves">Recent moves</h3>
    <ul className="pot-list" aria-labelledby="pot-check-moves">{moves.map(move => {
      const total = move.transactions.flatMap(row => row.lines).filter(line => !(line.destination.kind === 'pot' && line.destination.potId === setAsidePotId)).reduce((sum, line) => sum + line.amountPence, 0)
      const when = dayDate(localDate(new Date(move.at)))
      return <li key={move.id}><ListRow title={`${when} · ${signedPounds(total)}`} meta={`${plural(move.transactions.length, 'transaction')} · ${moveParts(document, move, setAsidePotId)}`}
        trailing={<button type="button" className="text-button" aria-label={`Undo the move on ${when}`} onClick={() => onUndo(move)}>Undo</button>}/></li>
    })}</ul>
  </div>
}
