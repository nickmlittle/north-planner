import type { budgetTransfers } from './budgetTransfers'
import type { TransferInstructions } from './transferInstructions'

export type TransferAccount = ReturnType<typeof budgetTransfers>['accounts'][number]
export type PersonAmount = { personId: string; amountPence: number }
export type PersonPotMove = { potId: string; amountPence: number }
export type PersonTransferRow = { accountId: string; fundingPence: number; potMoves: PersonPotMove[]; incomplete: boolean }
export type PersonTransferPlan = { personId: string; fundingPence: number; stepCount: number; rows: PersonTransferRow[] }
export type PersonTransferPlans = { people: PersonTransferPlan[]; notCalculated: string[] }

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

/**
 * The payday view per person: which accounts they fund, and which pot moves they make afterwards.
 * Funding comes from the budget's transfer totals; pot moves only from ready instructions, which
 * already encode who moves money (personal-account owners move everything, joint contributors their own share).
 */
export function personTransferPlans(accounts: readonly TransferAccount[], instructions: TransferInstructions | undefined, personIds: readonly string[]): PersonTransferPlans {
  const calculated = accounts.filter(account => !isNotCalculated(account))
  const people = personIds.map(personId => {
    const rows = calculated.flatMap(account => {
      const fundingPence = accountPeople(account, [personId])[0]!.amountPence
      const instruction = instructions?.accounts.find(row => row.accountId === account.accountId)
      const potMoves = instruction?.status === 'ready'
        ? instruction.potMovements.filter(step => step.personId === personId && step.amountPence > 0 && step.destination.kind === 'pot')
          .map(step => ({ potId: step.destination.kind === 'pot' ? step.destination.potId : '', amountPence: step.amountPence }))
        : []
      return fundingPence > 0 || potMoves.length ? [{ accountId: account.accountId, fundingPence, potMoves, incomplete: account.incomplete }] : []
    })
    return {
      personId, rows,
      fundingPence: rows.reduce((sum, row) => sum + row.fundingPence, 0),
      stepCount: rows.reduce((sum, row) => sum + (row.fundingPence > 0 ? 1 : 0) + row.potMoves.length, 0),
    }
  })
  return { people, notCalculated: accounts.filter(isNotCalculated).map(account => account.accountId) }
}
