import { useId, useState } from 'react'

/** The headline stays short; the caveats sit behind an ⓘ so they don't outrank the amounts. */
export function AccountFundingNote() {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return <div className="transfer-calculation-note">
    <p>Planned amounts, not payments. <button type="button" className="budget-v3-info" aria-label="About planned amounts" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)}>ⓘ</button></p>
    <p id={detailId} hidden={!open}>Sources are unspecified; money already in the account may not need transferring. Automatic payments and payment status are not recorded.</p>
  </div>
}
