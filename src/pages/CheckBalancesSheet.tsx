import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ModalDialog } from '../components/ModalDialog'
import type { BudgetDocument } from '../domain/budgetDocument'
import { parsePence } from '../domain/cardTracker'
import { checkPotBalances, potBalance } from '../domain/potBalances'
import { accountOwnerGroups, shortAccountLabels } from './budgetLabels'
import { dayOf, plural, pounds, signedPounds } from './spendingFormat'

type Props = {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  onClose: () => void
  onSaved: (text: string) => void
  now?: () => Date
}

/** What a typed balance says against North's figure: "Matches", "£2.10 more than North worked out". */
function difference(typed: number, worked: number | undefined) {
  if (worked === undefined) return ''
  const gap = typed - worked
  return gap === 0 ? 'Matches' : `${pounds(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than North worked out`
}

/**
 * Check balances: every pot's worked-out balance next to a box for what the bank shows. Saving records each
 * typed balance as the pot's check (`checkPotBalances`); pots left blank keep their last check.
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
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (invalid.length) { setError('Enter each balance like 1240.00, or leave it blank.'); return }
    if (!parsed.length) { onClose(); return }
    setDocument(current => checkPotBalances(current, new Map(parsed as Array<[string, number]>), now()))
    onSaved(`${plural(parsed.length, 'balance')} checked.`)
  }

  return <ModalDialog title="Check balances" onClose={onClose} className="move-sheet check-balances-sheet">
    <form className="check-balances" noValidate onSubmit={save}>
      <p className="bring-in-lead">Type what each pot shows in your banking app. Leave any you haven’t looked at.</p>
      {groups.map(({ account, pots }) => <fieldset key={account.id} className="check-balances-account">
        <legend>{labels.get(account.id) ?? account.name}</legend>
        <ul>{pots.map(pot => {
          const balance = potBalance(document, pot.id)
          const text = typed[pot.id] ?? ''
          const pence = text.trim() ? parsePence(text) : null
          const bad = invalid.includes(pot.id)
          const note = balance.balancePence === undefined ? 'Not checked yet' : `North: ${signedPounds(balance.balancePence)} · checked ${dayOf(balance.checked!.at)}`
          return <li key={pot.id} className="check-balances-row">
            <label className="check-balances-label" htmlFor={`check-${pot.id}`}><strong>{pot.name}</strong><span>{note}</span></label>
            <input id={`check-${pot.id}`} inputMode="decimal" value={text} aria-invalid={bad || undefined} aria-describedby={`check-${pot.id}-note`} onChange={event => { setTyped({ ...typed, [pot.id]: event.target.value }); setError('') }}/>
            <span id={`check-${pot.id}-note`} className={`check-balances-note${pence !== null && balance.balancePence !== undefined && pence !== balance.balancePence ? ' is-different' : ''}`} aria-live="polite">{pence !== null && !bad ? difference(pence, balance.balancePence) : ''}</span>
            {balance.balancePence !== undefined && !text && <button type="button" className="text-button check-balances-same" onClick={() => setTyped({ ...typed, [pot.id]: (balance.balancePence! / 100).toFixed(2) })}>Same as North</button>}
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
