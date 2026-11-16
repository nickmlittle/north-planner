import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { cardTracker, parsePence } from '../domain/cardTracker'
import { checkPotBalances, potBalance } from '../domain/potBalances'
import { potPhrase } from '../domain/setAside'
import { setAsideCheck } from '../domain/setAsideCheck'
import { capitalise } from '../formatting/paceLabels'
import { accountOwnerGroups, shortAccountLabels } from './budgetLabels'
import { dayOf, plural, pounds, signedPounds } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  onClose: () => void
  /** After saving: the message, and the Amex pot when its check now has a gap (to offer Open Amex pot). */
  onSaved: (text: string, gapPotId?: string) => void
  now?: () => Date
}

/** What a typed balance says against North's figure: "Matches", "£2.10 more than North worked out". */
function difference(typed: number, worked: number | undefined) {
  if (worked === undefined) return ''
  const gap = typed - worked
  return gap === 0 ? 'Matches' : `${pounds(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than North worked out`
}

/** The Amex pot's row compares with what its bills need, its Expected (card-tracker-rules, "Checking the Amex pot"). */
const gapText = (gap: number) => gap === 0 ? 'Matches' : `${pounds(Math.abs(gap))} ${gap > 0 ? 'extra' : 'short'}`

/**
 * Check balances: every pot's worked-out balance next to a box for what the bank shows. Saving records each
 * typed balance as the pot's check (`checkPotBalances`); pots left blank keep their last check. A card's set-aside
 * pot (the Amex pot) shows what's Expected instead (what has moved in for unpaid bills), warns while anything sorted is
 * waiting to move, and the saved
 * message says if it has extra or is short.
 */
export function CheckBalancesSheet({ document, setDocument, onClose, onSaved, now = () => new Date() }: Props) {
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const labels = shortAccountLabels(document.budget.accounts, document.household.adults)
  const groups = accountOwnerGroups(document.budget.accounts, document.household.adults)
    .flatMap(group => group.accounts)
    .map(account => ({ account, pots: document.budget.pots.filter(pot => pot.accountId === account.id).sort((a, b) => a.name.localeCompare(b.name, 'en-GB')) }))
    .filter(row => row.pots.length)
  const parsed = Object.entries(typed).filter(([, text]) => text.trim()).map(([potId, text]) => [potId, parsePence(text)] as const)
  const invalid = parsed.filter(([, pence]) => pence === null || pence < 0).map(([potId]) => potId)
  const checks = new Map(cardTracker(document).cards.filter(card => card.setAside).flatMap(card => { const check = setAsideCheck(document, card.id); return check ? [[check.potId, check] as const] : [] }))
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (invalid.length) { setError('Enter each balance like 1240.00, or leave it blank.'); return }
    if (!parsed.length) { onClose(); return }
    setDocument(current => checkPotBalances(current, new Map(parsed as Array<[string, number]>), now()))
    // Expected doesn't depend on a check, so the typed figure gives the Amex pot's new gap.
    const gapped = parsed.flatMap(([potId, pence]) => { const check = checks.get(potId); return check && pence! !== check.shouldHoldPence ? [{ potId, gap: pence! - check.shouldHoldPence }] : [] })[0]
    const phrase = gapped && potPhrase(document.budget.pots.find(pot => pot.id === gapped.potId)?.name ?? 'Amex')
    onSaved(`${plural(parsed.length, 'balance')} checked.${gapped ? ` ${gapped.gap > 0 ? `${capitalise(phrase!)} has ${pounds(gapped.gap)} extra.` : `${capitalise(phrase!)} is ${pounds(-gapped.gap)} short.`}` : ''}`, gapped?.potId)
  }

  return <ModalDialog title="Check balances" onClose={onClose} className="move-sheet check-balances-sheet">
    <form className="check-balances" noValidate onSubmit={save}>
      <p className="bring-in-lead">Type what each pot shows in your banking app. Leave any you haven’t looked at.</p>
      {groups.map(({ account, pots }) => <fieldset key={account.id} className="check-balances-account">
        <legend>{labels.get(account.id) ?? account.name}</legend>
        <ul>{pots.map(pot => {
          const balance = potBalance(document, pot.id)
          const check = checks.get(pot.id)
          const text = typed[pot.id] ?? ''
          const pence = text.trim() ? parsePence(text) : null
          const bad = invalid.includes(pot.id)
          const checkedText = balance.checked ? `checked ${dayOf(balance.checked.at)}` : 'not checked yet'
          const note = check ? `Expected ${signedPounds(check.shouldHoldPence)} · ${checkedText}` : balance.balancePence === undefined ? 'Not checked yet' : `North: ${signedPounds(balance.balancePence)} · ${checkedText}`
          // The figure the typed balance is held against: the Amex pot's Expected, else North's worked-out balance.
          const against = check ? check.shouldHoldPence : balance.balancePence
          const said = pence === null || bad ? '' : check ? gapText(pence - check.shouldHoldPence) : difference(pence, balance.balancePence)
          const same = check ? (balance.balancePence === check.shouldHoldPence ? balance.balancePence : undefined) : balance.balancePence
          return <li key={pot.id} className="check-balances-row">
            <label className="check-balances-label" htmlFor={`check-${pot.id}`}><strong>{pot.name}</strong><span>{note}</span></label>
            <input id={`check-${pot.id}`} inputMode="decimal" value={text} aria-invalid={bad || undefined} aria-describedby={`check-${pot.id}-note${check?.toMove ? ` check-${pot.id}-warn` : ''}`} onChange={event => { setTyped({ ...typed, [pot.id]: event.target.value }); setError('') }}/>
            <span id={`check-${pot.id}-note`} className={`check-balances-note${pence !== null && against !== undefined && pence !== against ? ' is-different' : ''}`} aria-live="polite">{said}</span>
            {same !== undefined && !text && <button type="button" className="text-button check-balances-same" onClick={() => setTyped({ ...typed, [pot.id]: (same / 100).toFixed(2) })}>Same as North</button>}
            {check && check.toMove > 0 && <span id={`check-${pot.id}-warn`} className="check-balances-warn">{signedPounds(check.toMovePence)} sorted, to move. Moved it in {document.budget.accounts.find(account => account.id === pot.accountId)?.provider?.trim() || 'the bank'} already? Press Moved first, or it counts twice.</span>}
          </li>
        })}</ul>
      </fieldset>)}
      {error && <p className="input-error" role="alert">{error}</p>}
      <div className="bring-in-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary-button">{parsed.length ? `Save ${plural(parsed.length, 'balance')}` : 'Done'}</button>
      </div>
    </form>
  </ModalDialog>
}
