import type { BudgetDocument } from './budgetDocument'
import type { budgetTransfers } from './budgetTransfers'
import type { TransferInstruction, TransferInstructions } from './transferInstructions'

export type TransferAccount = ReturnType<typeof budgetTransfers>['accounts'][number]
export type PersonAmount = { personId: string; amountPence: number }
/** A pot move this person makes. `fromOthers` is money other people funded that this person moves on (sole-owner accounts). */
export type PersonPotMove = { potId: string; amountPence: number; fromOthers: PersonAmount[] }
/** Someone else who moves part of this person's funding into pots afterwards. */
export type MovedOnBy = { personId: string; potIds: string[]; amountPence: number }
/**
 * Paying each other (D7): two people who each fund the other's pay account send one net transfer instead.
 * `personId` is the other person, `otherPence` what they'd have sent this way, and `sendPence` what this person
 * sends now: the difference, or 0 on the side that owes less.
 */
export type NetTransfer = { personId: string; otherPence: number; sendPence: number }
/**
 * `alreadyThere`: the person's pay lands in this account, so its funding is shown but isn't a step. `fromAccountId`:
 * where the funding comes from, when known. `fundingPence` is always the person's contribution; `net` says when the
 * transfer that carries it is netted against the other person's.
 */
export type PersonTransferRow = { accountId: string; fundingPence: number; alreadyThere: boolean; fromAccountId: string | null; potMoves: PersonPotMove[]; movedOnBy: MovedOnBy[]; net?: NetTransfer }
/** `stepCount` is `fundCount` (transfers to send) plus `moveCount` (pot moves). */
export type PersonTransferPlan = { personId: string; fundingPence: number; fundCount: number; moveCount: number; stepCount: number; rows: PersonTransferRow[] }
export type NeedsReviewReason = 'unavailable' | 'unallocated' | 'missing-pot-owner'
export type NeedsReviewAccount = { accountId: string; byPerson: PersonAmount[]; notCalculated: boolean; reason: NeedsReviewReason }
/** A joint pot move made once for the household (D6): the total, and each person's part of it. */
export type HouseholdMove = { potId: string; amountPence: number; byPerson: PersonAmount[] }
export type HouseholdRow = { accountId: string; moves: HouseholdMove[] }
/**
 * Which payday steps a month uses (P5). `household`: joint pot moves once for the household and one net transfer
 * between people. `per-person`: each contributor moves their own share of a joint pot, and each person sends their
 * own transfer (the steps before December 2026).
 */
export type PaydayLayout = 'household' | 'per-person'
export type PersonTransferPlans = { layout: PaydayLayout; people: PersonTransferPlan[]; household: HouseholdRow[]; needsReview: NeedsReviewAccount[] }
/** Who owns each account, for the household layout: two or more owners make it joint. */
export type HouseholdOptions = { accountOwners: ReadonlyMap<string, readonly string[]> }

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

/** What a funding row actually sends: its funding, or what's left of it after netting (D7). */
export const sendPence = (row: PersonTransferRow) => row.net ? row.net.sendPence : row.fundingPence
/** A funding row that is a step: something to send, and not already where the pay lands. */
export const isFundStep = (row: PersonTransferRow) => !row.alreadyThere && row.fundingPence > 0 && sendPence(row) > 0

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
export function personTransferPlans(accounts: readonly TransferAccount[], instructions: TransferInstructions | undefined, personIds: readonly string[], household?: HouseholdOptions): PersonTransferPlans {
  const instructionFor = (account: TransferAccount) => instructions?.accounts.find(row => row.accountId === account.accountId)
  const ready = accounts.filter(account => !account.incomplete && instructionFor(account)?.status === 'ready')
  const owners = (accountId: string) => household?.accountOwners.get(accountId) ?? []
  // Household layout: a joint account's pot moves are made once, by either owner, so no one person has them.
  const jointMoves = (accountId: string) => !!household && owners(accountId).length > 1
  const people = personIds.map(personId => {
    const rows = ready.flatMap(account => {
      const fundingPence = accountPeople(account, [personId])[0]!.amountPence
      const funding = instructionFor(account)!.fundingRequirements.find(step => step.personId === personId)
      const alreadyThere = !!funding?.alreadyThere, fromAccountId = funding?.source?.accountId ?? null
      const movements = jointMoves(account.accountId) ? [] : instructionFor(account)!.potMovements.filter(step => step.amountPence > 0 && step.destination.kind === 'pot')
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
    return { personId, rows: rows as PersonTransferRow[] }
  })
  if (household) netTransfers(people, owners)
  const plans = people.map(({ personId, rows }) => {
    const fundCount = rows.filter(isFundStep).length
    const moveCount = rows.reduce((sum, row) => sum + row.potMoves.length, 0)
    return {
      personId, rows,
      fundingPence: rows.reduce((sum, row) => sum + row.fundingPence, 0),
      fundCount, moveCount, stepCount: fundCount + moveCount,
    }
  })
  const householdRows: HouseholdRow[] = ready.filter(account => jointMoves(account.accountId)).flatMap(account => {
    const moves: HouseholdMove[] = []
    for (const step of instructionFor(account)!.potMovements) {
      if (step.amountPence <= 0 || step.destination.kind !== 'pot' || !step.personId) continue
      const move = moves.find(row => row.potId === potId(step)) ?? moves[moves.push({ potId: potId(step), amountPence: 0, byPerson: [] }) - 1]!
      move.amountPence += step.amountPence
      move.byPerson.push({ personId: step.personId, amountPence: step.amountPence })
    }
    return moves.length ? [{ accountId: account.accountId, moves }] : []
  })
  const needsReview = accounts.filter(account => !ready.includes(account)).map(account => {
    const instruction = instructionFor(account)
    // Read the reason from the instruction's issues: callers may already have folded needs-review into `incomplete`.
    const reason: NeedsReviewReason = !instruction ? 'unavailable'
      : instruction.issues.length && instruction.issues.every(issue => issue.kind === 'missing-pot-owner') ? 'missing-pot-owner'
      : 'unallocated'
    return { accountId: account.accountId, byPerson: accountPeople(account, personIds), notCalculated: isNotCalculated(account), reason }
  })
  return { layout: household ? 'household' : 'per-person', people: plans, household: householdRows, needsReview }
}

/**
 * D7: when two people each fund the other's pay account (the account their pay lands in, owned by them alone), the
 * one who owes more sends the difference and the other sends nothing. Both rows keep their funding, so what each
 * person contributes is unchanged; only the transfer that carries it is. Equal amounts cancel out.
 */
function netTransfers(people: { personId: string; rows: PersonTransferRow[] }[], owners: (accountId: string) => readonly string[]) {
  const source = (person: typeof people[number]) => {
    const accountId = person.rows.find(row => row.fromAccountId)?.fromAccountId ?? null
    const owned = accountId ? owners(accountId) : []
    return owned.length === 1 && owned[0] === person.personId ? accountId : null
  }
  for (const [index, a] of people.entries()) for (const b of people.slice(index + 1)) {
    const sourceA = source(a), sourceB = source(b)
    if (!sourceA || !sourceB) continue
    const aToB = a.rows.find(row => row.accountId === sourceB && !row.alreadyThere && row.fundingPence > 0)
    const bToA = b.rows.find(row => row.accountId === sourceA && !row.alreadyThere && row.fundingPence > 0)
    if (!aToB || !bToA) continue
    const difference = aToB.fundingPence - bToA.fundingPence
    aToB.net = { personId: b.personId, otherPence: bToA.fundingPence, sendPence: Math.max(difference, 0) }
    bToA.net = { personId: a.personId, otherPence: aToB.fundingPence, sendPence: Math.max(-difference, 0) }
  }
}

/** One account the money leaves, and the steps made from it. */
export type SourceGroup = { accountId: string; funds: PersonTransferRow[]; moves: { row: PersonTransferRow; move: PersonPotMove }[] }

/**
 * D8: a person's steps grouped by the account the money leaves, so you stay in one banking app for each run of steps:
 * the transfers they send first, then the pot moves they make in it. Pay that already lands in an account leaves from
 * that account. Groups come in the order they first appear.
 */
export function stepSources(plan: PersonTransferPlan): SourceGroup[] {
  const groups = new Map<string, SourceGroup>()
  const group = (accountId: string) => groups.get(accountId) ?? groups.set(accountId, { accountId, funds: [], moves: [] }).get(accountId)!
  for (const row of plan.rows) {
    if (row.fundingPence > 0) group(row.alreadyThere ? row.accountId : row.fromAccountId ?? row.accountId).funds.push(row)
    for (const move of row.potMoves) group(row.accountId).moves.push({ row, move })
  }
  // Pay already in the account isn't something to send: it follows the transfers, before the moves.
  for (const each of groups.values()) each.funds.sort((a, b) => Number(a.alreadyThere) - Number(b.alreadyThere))
  return [...groups.values()]
}

/** The tick-key actor for a household move: either of you makes it. */
export const HOUSEHOLD = 'household'

/** Ticks only the old steps have: a person's own move into a joint account's pot. */
const PERSON_MOVE = /^([^:]+):move:(.+)$/

/**
 * P5: a month uses the household layout unless it was already ticked under the per-person one, which shows as a
 * tick on a person's move into a joint pot (a key the household layout never makes). So November 2026, ticked
 * before the change, keeps its steps, and December, the first month with no ticks, starts the new ones.
 */
export function paydayLayout(document: Pick<BudgetDocument, 'budget' | 'ticks'>, month: string): PaydayLayout {
  const joint = new Set(document.budget.accounts.filter(account => account.ownerPersonIds.length > 1).map(account => account.id))
  const jointPots = new Set(document.budget.pots.filter(pot => joint.has(pot.accountId)).map(pot => pot.id))
  const old = Object.keys(document.ticks?.[month] ?? {}).some(key => {
    const match = PERSON_MOVE.exec(key)
    return !!match && match[1] !== HOUSEHOLD && jointPots.has(match[2]!)
  })
  return old ? 'per-person' : 'household'
}

/** The month's payday plans in the layout it uses: what Month, Home and the month's stage all read. */
export function paydayPlans(document: Pick<BudgetDocument, 'budget' | 'household' | 'ticks'>, month: string, accounts: readonly TransferAccount[], instructions: TransferInstructions | undefined): PersonTransferPlans {
  const ids = document.household.adults.map(person => person.id)
  if (paydayLayout(document, month) === 'per-person') return personTransferPlans(accounts, instructions, ids)
  return personTransferPlans(accounts, instructions, ids, { accountOwners: new Map(document.budget.accounts.map(account => [account.id, account.ownerPersonIds])) })
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
