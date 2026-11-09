import type { budgetTransfers } from './budgetTransfers'
import type { TransferInstruction, TransferInstructions } from './transferInstructions'

export type TransferAccount = ReturnType<typeof budgetTransfers>['accounts'][number]
export type PersonAmount = { personId: string; amountPence: number }
/** A pot move this person makes. `fromOthers` is money other people funded that this person moves on (sole-owner accounts). */
export type PersonPotMove = { potId: string; amountPence: number; fromOthers: PersonAmount[] }
/** Someone else who moves part of this person's funding into pots afterwards. */
export type MovedOnBy = { personId: string; potIds: string[]; amountPence: number }
export type PersonTransferRow = { accountId: string; fundingPence: number; potMoves: PersonPotMove[]; movedOnBy: MovedOnBy[] }
export type PersonTransferPlan = { personId: string; fundingPence: number; stepCount: number; rows: PersonTransferRow[] }
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
      return fundingPence > 0 || potMoves.length ? [{ accountId: account.accountId, fundingPence, potMoves, movedOnBy }] : []
    })
    return {
      personId, rows,
      fundingPence: rows.reduce((sum, row) => sum + row.fundingPence, 0),
      stepCount: rows.reduce((sum, row) => sum + (row.fundingPence > 0 ? 1 : 0) + row.potMoves.length, 0),
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
