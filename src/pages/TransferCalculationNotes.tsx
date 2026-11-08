import type { BudgetDocument } from '../domain/budgetDocument'
import type { TransferInstructionAccount } from '../domain/transferInstructions'
import { formatGBP } from '../formatting/money'

export function AccountFundingNote() {
  return <p className="transfer-calculation-note">Funding includes the allocations below. Sources are unspecified; money already in the account may not need transferring. Automatic payments and payment status are not recorded.</p>
}

export function PotMovementNote({ account, potId, document }: {
  account: TransferInstructionAccount | undefined; potId: string; document: BudgetDocument
}) {
  if (!account) return <p className="transfer-calculation-note">Pot instructions are unavailable. Review this account before moving money.</p>
  if (account.status === 'needs-review') return <p className="transfer-calculation-note budget-allocation-incomplete">Account instructions need review before money is moved.{account.issues.some(issue => issue.kind === 'missing-pot-owner') ? ' Assign an account owner to determine who moves money into pots.' : ' Resolve incomplete funding allocations.'}</p>
  const movements = account.potMovements.filter(step => step.destination.kind === 'pot' && step.destination.potId === potId)
  if (!movements.length) return <p className="transfer-calculation-note">No pot movement required.</p>
  return <p className="transfer-calculation-note">After account funding: {movements.map(step => `${document.household.adults.find(person => person.id === step.personId)?.name ?? 'Person'} moves ${formatGBP(step.amountPence / 100)}`).join('; ')} into this pot. Included in account funding, not an extra contribution.</p>
}
