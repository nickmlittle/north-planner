import type { budgetTransfers } from './budgetTransfers'
import type { TransferInstruction, TransferInstructions } from './transferInstructions'

export type TransferAccount = ReturnType<typeof budgetTransfers>['accounts'][number]
export type PersonAmount = { personId: string; amountPence: number }
/** A pot move this person makes. `fromOthers` is money other people funded that this person moves on (sole-owner accounts). */
export type PersonPotMove = { potId: string; amountPence: number; fromOthers: PersonAmount[] }
/** Someone else who moves part of this person's funding into pots afterwards. */
export type MovedOnBy = { personId: string; potIds: string[]; amountPence: number }
/** `alreadyThere`: the person's pay lands in this account, so its funding is shown but isn't a step. `fromAccountId`: where the funding comes from, when known. */
export type PersonTransferRow = { accountId: string; fundingPence: number; alreadyThere: boolean; fromAccountId: string | null; potMoves: PersonPotMove[]; movedOnBy: MovedOnBy[] }
/** `stepCount` is `fundCount` (accounts to fund) plus `moveCount` (pot moves). */
export type PersonTransferPlan = { personId: string; fundingPence: number; fundCount: number; moveCount: number; stepCount: number; rows: PersonTransferRow[] }
export type NeedsReviewReason = 'unavailable' | 'unallocated' | 'missing-pot-owner'
export type NeedsReviewAccount = { accountId: string; byPerson: PersonAmount[]; notCalculated: boolean; reason: NeedsReviewReason }
export type PersonTransferPlans = { people: PersonTransferPlan[]; needsReview: NeedsReviewAccount[] }

/** What each person puts into an account: direct items plus their share of every pot in it. */
export function accountPeople(account: TransferAccount, personIds: readonly string[]): PersonAmount[] {
  return personIds.map(personId => ({
    personId,
    amountPence: (account.directByPerson.find(row => row.personId === personId)?.amountPence ?? 0)
      + account.pots.reduce((sum, pot) => sum + (pot.byPerson.find(row => row.personId === personId)?.amountPence ?? 0), 0),
  }))
}

/** A missing calculation must not read as a completed £0.00, or hide behind a person filter. */
export const isNotCalculated = (account: TransferAccount) => account.incomplete && account.amountPence === 0

const potId = (step: TransferInstruction) => step.destination.kind === 'pot' ? step.destination.potId : ''

/** Sum one pot move's item contributions by person, leaving out the mover. */
function contributedBy(step: TransferInstruction, exclude: string | null): PersonAmount[] {
  const totals = new Map<string, number>()
  for (const item of step.breakdown) for (const row of item.contributions) {
    if (row.personId !== exclude && row.amountPence > 0) totals.set(row.personId, (totals.get(row.personId) ?? 0) + row.amountPence)
  }
  return [...totals].map(([personId, amountPence]) => ({ personId, amountPence }))
}

/**
 * The payday steps per person: fund an account, then the pot moves out of it.
 * Only ready accounts produce steps. Anything needing review keeps its known amounts for comparison
 * but is withheld from the steps (transfer-calculation-rules: "withhold every step for that account").
 * Pot moves come from the instructions, which already encode who moves money
 * (personal-account owners move everything, joint contributors their own share).
 */
export function personTransferPlans(accounts: readonly TransferAccount[], instructions: TransferInstructions | undefined, personIds: readonly string[]): PersonTransferPlans {
  const instructionFor = (account: TransferAccount) => instructions?.accounts.find(row => row.accountId === account.accountId)
  const ready = accounts.filter(account => !account.incomplete && instructionFor(account)?.status === 'ready')
  const people = personIds.map(personId => {
    const rows = ready.flatMap(account => {
      const fundingPence = accountPeople(account, [personId])[0]!.amountPence
      const funding = instructionFor(account)!.fundingRequirements.find(step => step.personId === personId)
      const alreadyThere = !!funding?.alreadyThere, fromAccountId = funding?.source?.accountId ?? null
      const movements = instructionFor(account)!.potMovements.filter(step => step.amountPence > 0 && step.destination.kind === 'pot')
      const potMoves = movements.filter(step => step.personId === personId)
        .map(step => ({ potId: potId(step), amountPence: step.amountPence, fromOthers: contributedBy(step, personId) }))
      const movedOnBy: MovedOnBy[] = []
      for (const step of movements) {
        const mine = step.personId === null || step.personId === personId ? 0 : contributedBy(step, null).find(row => row.personId === personId)?.amountPence ?? 0
        if (!mine || step.personId === null) continue
        const existing = movedOnBy.find(row => row.personId === step.personId)
        if (existing) { existing.potIds.push(potId(step)); existing.amountPence += mine }
        else movedOnBy.push({ personId: step.personId, potIds: [potId(step)], amountPence: mine })
      }
      return fundingPence > 0 || potMoves.length ? [{ accountId: account.accountId, fundingPence, alreadyThere, fromAccountId, potMoves, movedOnBy }] : []
    })
    const fundCount = rows.filter(row => row.fundingPence > 0 && !row.alreadyThere).length
    const moveCount = rows.reduce((sum, row) => sum + row.potMoves.length, 0)
    return {
      personId, rows,
      fundingPence: rows.reduce((sum, row) => sum + row.fundingPence, 0),
      fundCount, moveCount, stepCount: fundCount + moveCount,
    }
  })
  const needsReview = accounts.filter(account => !ready.includes(account)).map(account => {
    const instruction = instructionFor(account)
    // Read the reason from the instruction's issues: callers may already have folded needs-review into `incomplete`.
    const reason: NeedsReviewReason = !instruction ? 'unavailable'
      : instruction.issues.length && instruction.issues.every(issue => issue.kind === 'missing-pot-owner') ? 'missing-pot-owner'
      : 'unallocated'
    return { accountId: account.accountId, byPerson: accountPeople(account, personIds), notCalculated: isNotCalculated(account), reason }
  })
  return { people, needsReview }
}

type OwnedAccount = { id: string; ownerPersonIds: readonly string[] }

/**
 * Transfer rows in reading order: joint accounts, then each person's own in household order, then accounts with no owner.
 * Ties sort by label. An account the instructions flag for review counts as incomplete.
 */
export function orderTransferAccounts(accounts: readonly TransferAccount[], instructions: TransferInstructions | undefined, budgetAccounts: readonly OwnedAccount[], personIds: readonly string[], labels: ReadonlyMap<string, string>): TransferAccount[] {
  const owned = (accountId: string) => budgetAccounts.find(account => account.id === accountId)
  const groupRank = (account?: OwnedAccount) => !account?.ownerPersonIds.length ? 2 : account.ownerPersonIds.length > 1 ? 0 : 1
  const personRank = (account?: OwnedAccount) => account?.ownerPersonIds.length === 1 ? personIds.indexOf(account.ownerPersonIds[0]!) : -1
  return accounts
    .map(account => ({ ...account, incomplete: account.incomplete || instructions?.accounts.find(row => row.accountId === account.accountId)?.status === 'needs-review' }))
    .sort((a, b) => {
      const accountA = owned(a.accountId), accountB = owned(b.accountId)
      return groupRank(accountA) - groupRank(accountB)
        || personRank(accountA) - personRank(accountB)
        || (labels.get(a.accountId) ?? '').localeCompare(labels.get(b.accountId) ?? '')
    })
}
