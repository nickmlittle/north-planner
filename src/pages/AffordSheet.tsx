import { useState } from 'react'
import { Sheet } from '../components/ui/Sheet'
import type { BudgetDocument } from '../domain/budgetDocument'
import { affordCheck } from '../domain/afford'
import { monthOf, parsePence } from '../domain/cardTracker'
import { affordLines, askable, bankOf } from './affordText'
import './PotPage.css'

/**
 * Can we afford… (month-health PR 8): an amount and a pot give an answer before anything is bought, and nothing is
 * saved. Opens from Home (first pot chosen) and from a pot page (that pot, and a typical shop's amount when it
 * came from Try it).
 */
export function AffordSheet({ document, today, potId, amount = '', onClose }: { document: BudgetDocument; today: string; potId?: string; amount?: string; onClose: () => void }) {
  const pots = askable(document, today)
  const [chosen, setChosen] = useState(potId && pots.some(row => row.potId === potId) ? potId : pots[0]?.potId ?? '')
  const [value, setValue] = useState(amount)
  const month = monthOf(today)
  const pence = parsePence(value)
  const answer = chosen && pence && pence > 0 ? affordCheck(document, chosen, pence, today) : undefined
  const shown = answer && affordLines(document, answer, bankOf(document, chosen), month)
  return <Sheet title="Can we afford…" size="sm" onClose={onClose} dismissOnScrim description="An amount and a pot. Nothing is saved." className="afford-sheet">
    <div className="pot-try">
      {pots.length > 1 && <label className="spending-field">Which pot
        <select value={chosen} onChange={event => setChosen(event.target.value)}>{pots.map(row => <option key={row.potId} value={row.potId}>{row.name}</option>)}</select>
      </label>}
      <label className="spending-field">Before you spend it
        <input data-autofocus inputMode="decimal" value={value} placeholder="£0.00" onChange={event => setValue(event.target.value)} aria-describedby="pot-try-answer"/>
      </label>
      <div id="pot-try-answer" role="status" className={`pot-try-answer${shown ? ` is-${shown.tone}` : ''}`}>
        {shown ? shown.lines.map(line => <p key={line}>{line}</p>) : <p>{value.trim() && pence === null ? 'Enter an amount, like 42.50.' : pots.length ? `${pots.length === 1 ? `For ${pots[0]!.name}. ` : ''}Type an amount to see.` : 'No pot to ask about this month.'}</p>}
      </div>
    </div>
  </Sheet>
}
