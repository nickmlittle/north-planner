import { useId, useState } from 'react'
import { Info } from 'lucide-react'

/** The headline stays short; the caveats sit behind an ⓘ so they don't outrank the amounts. */
export function AccountFundingNote() {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return <div className="transfer-calculation-note">
    <p>Planned amounts, not payments. <button type="button" className="budget-v3-info" aria-label="About planned amounts" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)}><Info aria-hidden="true"/></button></p>
    <p id={detailId} hidden={!open}>Sources are unspecified; money already in the account may not need transferring. Automatic payments and payment status are not recorded.</p>
  </div>
}

/** Month ⋯ › How funding is worked out: the rules behind the payday amounts (docs/transfer-calculation-rules.md), briefly. */
export function TransferCalculationNotes() {
  return <div className="transfer-calculation-notes">
    <p>Each item’s monthly amount is split between you by its funding rule: in proportion to salary, equally, by custom shares, fixed amounts, or one person. Other income adds to Available but doesn’t change the split.</p>
    <p>Funding an account is your share of everything paid from it, including its pots. Each pot’s Move then takes that money on from the account, so it isn’t counted twice.</p>
    <p>Amounts are worked out to the penny for each item, then added up by account and person.</p>
    <p>These are planned amounts, not payments. Money already in an account may not need transferring, and automatic payments aren’t recorded. Ticks record what you say you did.</p>
  </div>
}
