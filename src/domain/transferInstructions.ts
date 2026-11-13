import type { BudgetDocument } from './budgetDocument'
import { payLandsIn, type BudgetDestination } from './monthlyBudget'
import { buildTransferMatrixModel, type MatrixItemRow } from './transferMatrix'

export interface InstructionContribution { readonly personId: string; readonly amountPence: number }
export interface InstructionBreakdown {
  readonly itemId: string
  readonly name: string
  readonly destination: Readonly<BudgetDestination>
  /** The portion of this item included in this step. */
  readonly amountPence: number
  readonly contributions: readonly InstructionContribution[]
}
export interface TransferInstruction {
  readonly id: string
  readonly month: string
  readonly kind: 'account-funding' | 'pot-movement'
  /** Null only for a withheld pot movement whose account has no owner. */
  readonly personId: string | null
  /** Funding: where the person's pay lands, when known (null: steps read as before). Pot movement: the account. */
  readonly source: { readonly kind: 'account'; readonly accountId: string } | null
  /** Funding into the account the person's pay already lands in: shown, but not a transfer to make or tick. */
  readonly alreadyThere?: boolean
  readonly destination: Readonly<BudgetDestination>
  readonly amountPence: number
  readonly breakdown: readonly InstructionBreakdown[]
  readonly dependsOn: readonly string[]
  readonly status: 'ready' | 'needs-review'
}
export interface InstructionIssue {
  readonly kind: 'unresolved-proportional' | 'unallocated' | 'missing-pot-owner'
  readonly accountId: string
  readonly itemId?: string
  readonly potId?: string
}
export interface TransferInstructionAccount {
  readonly accountId: string
  readonly fundingRequirements: readonly TransferInstruction[]
  readonly potMovements: readonly TransferInstruction[]
  readonly issues: readonly InstructionIssue[]
  readonly status: 'ready' | 'needs-review'
}
export interface TransferInstructions {
  readonly month: string
  readonly accounts: readonly TransferInstructionAccount[]
  /** Only steps for complete accounts; all funding steps precede pot movements. */
  readonly steps: readonly TransferInstruction[]
  readonly issues: readonly InstructionIssue[]
  readonly incomplete: boolean
  readonly totals: {
    readonly plannedPence: number
    readonly allocatedFundingPence: number
    readonly actionableFundingPence: number
    readonly potAllocationPence: number
    readonly actionablePotMovementPence: number
  }
}

function breakdown(items: readonly MatrixItemRow[], personId?: string): InstructionBreakdown[] {
  return items.flatMap(item => {
    const contributions = item.byPerson.filter(row => row.amountPence > 0 && (personId === undefined || row.personId === personId)).map(row => ({ ...row }))
    const amountPence = contributions.reduce((sum, row) => sum + row.amountPence, 0)
    return amountPence > 0 ? [{ itemId: item.itemId, name: item.name, destination: { ...item.destination }, amountPence, contributions }] : []
  })
}
const sumBreakdown = (items: readonly InstructionBreakdown[]) => items.reduce((sum, item) => sum + item.amountPence, 0)

/** Derived only: no bank execution, automation or completion state. A funding step's source is where the person's pay lands, when set. */
export function buildTransferInstructions(document: BudgetDocument, month: string): TransferInstructions {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Transfer instructions require a calendar month')
  // Reuse the validated, penny-accurate projection; do not allocate or round again.
  const matrix = buildTransferMatrixModel(document, month)
  const accounts: TransferInstructionAccount[] = matrix.accounts.map(account => {
    const items = account.allocations.flatMap(allocation => allocation.items)
    const issues: InstructionIssue[] = items.flatMap(item => item.allocationIssue ? [{ kind: item.allocationIssue, accountId: account.accountId, itemId: item.itemId }] : [])
    for (const allocation of account.allocations) {
      if (allocation.kind === 'pot' && allocation.allocatedPence > 0 && account.ownerPersonIds.length === 0) {
        issues.push({ kind: 'missing-pot-owner', accountId: account.accountId, potId: allocation.potId })
      }
    }
    const status = issues.length ? 'needs-review' : 'ready'
    const fundingRequirements: TransferInstruction[] = account.byPerson.flatMap(person => {
      const detail = breakdown(items, person.personId)
      const from = payLandsIn(document.budget, person.personId, month)
      return person.amountPence > 0 ? [{
        id: JSON.stringify(['account-funding', month, account.accountId, person.personId]), month,
        kind: 'account-funding' as const, personId: person.personId, source: from ? { kind: 'account' as const, accountId: from } : null,
        ...from === account.accountId ? { alreadyThere: true } : {},
        destination: { kind: 'account' as const, accountId: account.accountId }, amountPence: sumBreakdown(detail),
        breakdown: detail, dependsOn: [], status,
      }] : []
    })
    const potMovements: TransferInstruction[] = account.allocations.flatMap(allocation => {
      if (allocation.kind !== 'pot' || allocation.allocatedPence === 0) return []
      // Personal-account owners handle everyone's contributions. Joint-account
      // contributors each handle their own share, independently of ownership.
      const movers = account.ownerPersonIds.length === 1 ? [account.ownerPersonIds[0]!]
        : account.ownerPersonIds.length === 0 ? [null]
        : allocation.byPerson.filter(row => row.amountPence > 0).map(row => row.personId)
      return movers.map(personId => {
        const detail = breakdown(allocation.items, account.ownerPersonIds.length > 1 ? personId! : undefined)
        return {
          id: JSON.stringify(['pot-movement', month, account.accountId, allocation.potId, personId]), month,
          kind: 'pot-movement' as const, personId, source: { kind: 'account' as const, accountId: account.accountId },
          destination: { kind: 'pot' as const, potId: allocation.potId }, amountPence: sumBreakdown(detail), breakdown: detail,
          dependsOn: fundingRequirements.filter(step => !step.alreadyThere && (account.ownerPersonIds.length <= 1 || step.personId === personId)).map(step => step.id), status,
        }
      })
    })
    return { accountId: account.accountId, fundingRequirements, potMovements, issues, status }
  })
  const issues = accounts.flatMap(account => account.issues)
  const ready = accounts.filter(account => account.status === 'ready')
  // Money already where it lands isn't a step to take.
  const fundingSteps = ready.flatMap(account => account.fundingRequirements.filter(step => !step.alreadyThere))
  const potSteps = ready.flatMap(account => account.potMovements)
  return {
    month, accounts, steps: [...fundingSteps, ...potSteps], issues, incomplete: issues.length > 0,
    totals: {
      plannedPence: matrix.totals.plannedPence, allocatedFundingPence: matrix.totals.allocatedPence,
      actionableFundingPence: fundingSteps.reduce((sum, step) => sum + step.amountPence, 0),
      potAllocationPence: matrix.accounts.flatMap(account => account.allocations).reduce((sum, row) => sum + (row.kind === 'pot' ? row.allocatedPence : 0), 0),
      actionablePotMovementPence: potSteps.reduce((sum, step) => sum + step.amountPence, 0),
    },
  }
}
