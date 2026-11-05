import { decodeBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { resolveBudget, type BudgetAccount, type BudgetDestination, type FundingRule } from './monthlyBudget'

export interface MatrixPersonAmount {
  readonly personId: string
  readonly amountPence: number
}

export interface MatrixAmounts {
  readonly plannedPence: number
  readonly allocatedPence: number
  /** Planned less allocated; never redistribute or round this difference. */
  readonly unallocatedPence: number
  readonly byPerson: readonly MatrixPersonAmount[]
  readonly incomplete: boolean
}

export interface MatrixItemRow extends MatrixAmounts {
  readonly kind: 'item'
  readonly id: string
  readonly itemId: string
  readonly name: string
  readonly category: { readonly id: string; readonly name: string }
  readonly destination: Readonly<BudgetDestination>
  readonly funding: FundingRule
  readonly allocationIssue: 'unresolved-proportional' | 'unallocated' | null
}

export interface MatrixDirectRow extends MatrixAmounts {
  readonly kind: 'direct-allocation'
  readonly id: string
  readonly accountId: string
  readonly items: readonly MatrixItemRow[]
}

export interface MatrixPotRow extends MatrixAmounts {
  readonly kind: 'pot'
  readonly id: string
  readonly accountId: string
  readonly potId: string
  readonly name: string
  readonly items: readonly MatrixItemRow[]
}

export interface MatrixAccountRow extends MatrixAmounts {
  readonly kind: 'account'
  readonly id: string
  readonly accountId: string
  readonly name: string
  readonly provider: string | undefined
  readonly accountTypeId: BudgetAccount['accountTypeId']
  readonly ownerPersonIds: readonly string[]
  readonly allocations: readonly (MatrixDirectRow | MatrixPotRow)[]
}

export type TransferMatrixRow = MatrixAccountRow | MatrixDirectRow | MatrixPotRow | MatrixItemRow

export interface TransferMatrixModel {
  readonly month: string
  readonly sourceMonth: string | null
  readonly nextBudgetMonth: string | null
  readonly hasExplicitBudget: boolean
  readonly importedBaseline: boolean
  readonly contributors: readonly { readonly personId: string; readonly name: string }[]
  readonly accounts: readonly MatrixAccountRow[]
  readonly totals: MatrixAmounts
}

// Tuple encoding avoids collisions between row kinds and arbitrary source IDs.
const rowId = (kind: TransferMatrixRow['kind'], sourceId: string) => JSON.stringify([kind, sourceId])
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

function amounts(items: readonly MatrixItemRow[], allocatedPence: number, byPerson: readonly MatrixPersonAmount[]): MatrixAmounts {
  const plannedPence = sum(items.map(item => item.plannedPence))
  return {
    plannedPence, allocatedPence, unallocatedPence: plannedPence - allocatedPence,
    byPerson: byPerson.map(person => ({ ...person })),
    incomplete: plannedPence !== allocatedPence || items.some(item => item.incomplete),
  }
}

/**
 * Read-only projection of a decoded document. All contribution amounts come from
 * budgetTransfers; this adapter only joins metadata and organises existing sums.
 * It does not write to the document or persistence.
 */
export function buildTransferMatrixModel(document: BudgetDocument, month: string): TransferMatrixModel {
  // Fail explicitly for unsupported references instead of inventing destinations
  // or dropping contributions belonging to people outside the household.
  if (!decodeBudgetDocument(document)) throw new Error('Transfer matrix requires a valid budget document')

  const { budget, household } = document
  const resolved = resolveBudget(budget, month)
  const transfers = budgetTransfers(budget, household.adults.map(person => person.id), month, resolved.items)
  const sourceItems = new Map(resolved.items.map(item => [item.id, item]))
  const categories = new Map(budget.categories.map(category => [category.id, category]))
  const accounts = new Map(budget.accounts.map(account => [account.id, account]))
  const pots = new Map(budget.pots.map(pot => [pot.id, pot]))

  const rows: MatrixAccountRow[] = transfers.accounts.map(transfer => {
    const account = accounts.get(transfer.accountId)!
    const items: MatrixItemRow[] = transfer.items.map(allocation => {
      const item = sourceItems.get(allocation.id)!
      const allocatedPence = sum(allocation.byPerson.map(person => person.amountPence))
      const allocationIssue = allocation.incomplete ? 'unresolved-proportional'
        : allocatedPence !== item.amountPence ? 'unallocated' : null
      return {
        kind: 'item', id: rowId('item', item.id), itemId: item.id, name: item.name,
        category: { ...categories.get(item.categoryId)! }, destination: { ...item.destination }, funding: item.funding,
        plannedPence: item.amountPence, allocatedPence, unallocatedPence: item.amountPence - allocatedPence,
        byPerson: allocation.byPerson.map(person => ({ ...person })),
        incomplete: allocationIssue !== null, allocationIssue,
      }
    })
    const allocations: (MatrixDirectRow | MatrixPotRow)[] = []
    if (transfer.hasDirect) {
      const directItems = items.filter(item => item.destination.kind === 'account')
      allocations.push({
        kind: 'direct-allocation', id: rowId('direct-allocation', account.id), accountId: account.id,
        items: directItems, ...amounts(directItems, transfer.directAmountPence, transfer.directByPerson),
      })
    }
    for (const allocation of transfer.pots) {
      const pot = pots.get(allocation.potId)!
      const potItems = items.filter(item => item.destination.kind === 'pot' && item.destination.potId === pot.id)
      allocations.push({
        kind: 'pot', id: rowId('pot', pot.id), accountId: account.id, potId: pot.id, name: pot.name,
        items: potItems, ...amounts(potItems, allocation.amountPence, allocation.byPerson),
      })
    }
    // Account contribution columns include direct and pot allocations exactly once.
    const byPerson = transfers.people.map(person => ({
      personId: person.personId,
      amountPence: person.accounts.find(row => row.accountId === account.id)?.amountPence ?? 0,
    }))
    return {
      kind: 'account', id: rowId('account', account.id), accountId: account.id, name: account.name,
      provider: account.provider, accountTypeId: account.accountTypeId, ownerPersonIds: [...account.ownerPersonIds],
      allocations, ...amounts(items, transfer.amountPence, byPerson),
    }
  })
  return {
    month, sourceMonth: resolved.sourceMonth, nextBudgetMonth: resolved.nextBudgetMonth,
    hasExplicitBudget: resolved.hasExplicitBudget, importedBaseline: resolved.importedBaseline,
    contributors: household.adults.map(person => ({ personId: person.id, name: person.name })),
    accounts: rows,
    totals: amounts(rows.flatMap(account => account.allocations.flatMap(allocation => allocation.items)),
      sum(transfers.accounts.map(account => account.amountPence)),
      transfers.people.map(person => ({ personId: person.personId, amountPence: person.plannedPence }))),
  }
}
