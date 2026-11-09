import { useId, useState } from 'react'
import type { TransferInstructionAccount } from '../domain/transferInstructions'

/** The headline stays short; the caveats sit behind an ⓘ so they don't outrank the amounts. */
export function AccountFundingNote() {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return <div className="transfer-calculation-note">
    <p>Planned amounts, not payments. <button type="button" className="budget-v3-info" aria-label="About planned amounts" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)}>ⓘ</button></p>
    <p id={detailId} hidden={!open}>Sources are unspecified; money already in the account may not need transferring. Automatic payments and payment status are not recorded.</p>
  </div>
}

/** Explains why pot movements can't be listed; when they can, the breakdown lists them itself. */
export function PotMovementNote({ account }: { account: TransferInstructionAccount | undefined }) {
  if (!account) return <p className="transfer-calculation-note">Pot instructions are unavailable. Review this account before moving money.</p>
  if (account.status === 'needs-review') return <p className="transfer-calculation-note budget-allocation-incomplete">Account instructions need review before money is moved.{account.issues.some(issue => issue.kind === 'missing-pot-owner') ? ' Assign an account owner to determine who moves money into pots.' : ' Resolve incomplete funding allocations.'}</p>
  return null
}
