import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { monthlyContributionPence, resolveBudget, type BudgetItem } from './monthlyBudget'
import { buildTransferMatrixModel, type MatrixAmounts, type TransferMatrixModel } from './transferMatrix'

const month = '2026-11'
const item = (id: string, amountPence: number, changes: Partial<BudgetItem> = {}): BudgetItem => ({
  id, name: id, categoryId: 'bills', entryAmountPence: amountPence, frequency: 'monthly', amountPence,
  destination: { kind: 'account', accountId: 'joint' }, funding: 'proportional', ...changes,
})

// A mixed destination fixture: categories cross destinations, multiple items
// share a pot, and a personal receiving account is funded by the other adult.
function mixedHousehold(): BudgetDocument {
  const document = newBudgetDocument()
  document.household.adults = [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }]
  document.budget.accounts = [
    { id: 'joint', name: 'Household', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'personal', name: 'Personal', provider: 'Monzo', ownerPersonIds: ['ada'] },
    { id: 'unused', name: 'Unused account', ownerPersonIds: [] },
  ]
  document.budget.pots = [
    { id: 'bills-pot', name: 'Bills pot', accountId: 'joint' },
    { id: 'unused-pot', name: 'Unused pot', accountId: 'joint' },
  ]
  document.budget.categories = [{ id: 'bills', name: 'Bills' }, { id: 'saving', name: 'Saving' }]
  document.budget.incomeSources = [
    { id: 'ada-pay', personId: 'ada', name: 'Job', type: 'employment', baseAmountPence: 20000, changes: {} },
    { id: 'ben-pay', personId: 'ben', name: 'Job', type: 'employment', baseAmountPence: 10000, changes: {} },
    { id: 'gift', personId: 'ada', name: 'Gift', type: 'additional', baseAmountPence: 90000, changes: {} },
  ]
  document.budget.snapshots[month] = { items: [
    item('Rent', 10001),
    item('Fixed', 307, { funding: 'fixed', contributions: [{ personId: 'ada', amountPence: 7 }, { personId: 'ben', amountPence: 300 }] }),
    item('Power', 101, { funding: 'equal', destination: { kind: 'pot', potId: 'bills-pot' } }),
    item('Reserve', 5, { funding: 'custom', customShares: { ada: 1, ben: 3 }, categoryId: 'saving', destination: { kind: 'pot', potId: 'bills-pot' } }),
    item('Personal saving', 99, { funding: 'single', singleFunderId: 'ben', categoryId: 'saving', destination: { kind: 'account', accountId: 'personal' } }),
  ] }
  return document
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const allItems = (model: TransferMatrixModel) => model.accounts.flatMap(account => account.allocations.flatMap(allocation => allocation.items))

// These invariants test the accounting boundary at every level, rather than
// snapshotting the adapter's object structure.
function expectReconciliation(document: BudgetDocument, model: TransferMatrixModel) {
  const transfers = budgetTransfers(document.budget, document.household.adults.map(person => person.id), model.month, resolveBudget(document.budget, model.month).items)
  expect(model.totals.plannedPence).toBe(transfers.plannedPence)
  expect(model.totals.allocatedPence).toBe(sum(transfers.accounts.map(account => account.amountPence)))
  expect(model.totals.byPerson.map(person => person.amountPence)).toEqual(transfers.people.map(person => person.plannedPence))
  const expectSum = (parent: MatrixAmounts, children: readonly MatrixAmounts[]) => {
    expect(parent.plannedPence).toBe(sum(children.map(child => child.plannedPence)))
    expect(parent.allocatedPence).toBe(sum(children.map(child => child.allocatedPence)))
    expect(parent.allocatedPence).toBe(sum(parent.byPerson.map(person => person.amountPence)))
    expect(parent.unallocatedPence).toBe(parent.plannedPence - parent.allocatedPence)
    for (const person of parent.byPerson) {
      expect(person.amountPence).toBe(sum(children.map(child => child.byPerson.find(row => row.personId === person.personId)!.amountPence)))
    }
  }
  expectSum(model.totals, model.accounts)
  for (const account of model.accounts) {
    const calculated = transfers.accounts.find(row => row.accountId === account.accountId)!
    expect(document.budget.accounts.some(row => row.id === account.accountId)).toBe(true)
    expect(account.allocatedPence).toBe(calculated.amountPence)
    expectSum(account, account.allocations)
    for (const allocation of account.allocations) {
      expect(allocation.allocatedPence).toBe(allocation.kind === 'direct-allocation' ? calculated.directAmountPence : calculated.pots.find(pot => pot.potId === allocation.potId)!.amountPence)
      expectSum(allocation, allocation.items)
      for (const item of allocation.items) {
        expect(item.byPerson).toEqual(calculated.items.find(row => row.id === item.itemId)!.byPerson)
      }
    }
  }
}

describe('transfer matrix mapping', () => {
  it('joins real destinations and independent categories without grouping by provider or owner', () => {
    const document = mixedHousehold()
    const original = structuredClone(document)
    const model = buildTransferMatrixModel(document, month)
    expect(model.accounts.map(account => account.accountId)).toEqual(['joint', 'personal'])
    const joint = model.accounts[0]!
    expect(joint.allocations.map(row => row.kind)).toEqual(['direct-allocation', 'pot'])
    expect(joint.allocations[0]!.items.map(row => row.itemId)).toEqual(['Rent', 'Fixed'])
    const pot = joint.allocations[1]!
    expect(pot).toMatchObject({ kind: 'pot', potId: 'bills-pot', accountId: 'joint', plannedPence: 106, allocatedPence: 106 })
    expect(pot.items.map(row => row.category.name)).toEqual(['Bills', 'Saving'])
    expect(pot.items.map(row => row.destination)).toEqual([{ kind: 'pot', potId: 'bills-pot' }, { kind: 'pot', potId: 'bills-pot' }])
    expect(model.accounts[1]).toMatchObject({ ownerPersonIds: ['ada'], byPerson: [{ personId: 'ada', amountPence: 0 }, { personId: 'ben', amountPence: 99 }] })
    expect(model.totals).toMatchObject({ plannedPence: 10513, allocatedPence: 10513, unallocatedPence: 0, incomplete: false })
    expect(document).toEqual(original)
    expectReconciliation(document, model)
  })

  it('preserves exact pennies across all funding modes and fixed contributions', () => {
    const document = mixedHousehold()
    const model = buildTransferMatrixModel(document, month)
    expect(allItems(model).map(row => row.byPerson.map(person => person.amountPence))).toEqual([
      [6667, 3334], [7, 300], [51, 50], [1, 4], [0, 99],
    ])
    expectReconciliation(document, model)
  })

  it('propagates unresolved proportional funding through direct and pot parents while retaining known amounts', () => {
    const document = mixedHousehold()
    document.budget.incomeSources = document.budget.incomeSources.filter(source => source.type === 'additional')
    document.budget.snapshots[month]!.items.push(item('Unknown pot share', 11, { destination: { kind: 'pot', potId: 'bills-pot' } }))
    const model = buildTransferMatrixModel(document, month)
    expect(model.totals).toMatchObject({ plannedPence: 10524, allocatedPence: 512, unallocatedPence: 10012, incomplete: true })
    expect(model.accounts[0]!.allocations.map(row => row.incomplete)).toEqual([true, true])
    expect(model.accounts[1]!.incomplete).toBe(false)
    expect(allItems(model).filter(row => row.incomplete).map(row => [row.itemId, row.allocationIssue])).toEqual([
      ['Rent', 'unresolved-proportional'], ['Unknown pot share', 'unresolved-proportional'],
    ])
    expectReconciliation(document, model)
  })

  it('identifies allocation gaps that the existing unresolved list does not cover', () => {
    const document = mixedHousehold()
    document.budget.snapshots[month]!.items = [
      item('No single funder', 13, { funding: 'single' }),
      item('No custom weight', 17, { funding: 'custom', customShares: {} }),
    ]
    const model = buildTransferMatrixModel(document, month)
    expect(budgetTransfers(document.budget, ['ada', 'ben'], month, resolveBudget(document.budget, month).items).unresolvedItemIds).toEqual([])
    expect(model.totals).toMatchObject({ plannedPence: 30, allocatedPence: 0, unallocatedPence: 30, incomplete: true })
    expect(allItems(model).map(row => row.allocationIssue)).toEqual(['unallocated', 'unallocated'])
    expectReconciliation(document, model)
  })

  it.each([1, 3])('retains every contributor and zero cell for a household of %i', count => {
    const document = mixedHousehold()
    document.household.adults = Array.from({ length: count }, (_, index) => ({ id: `person-${index}`, name: `Person ${index}` }))
    document.budget.accounts = [{ id: 'joint', name: 'Household', ownerPersonIds: [] }]
    document.budget.incomeSources = []
    document.budget.snapshots[month]!.items = [item('One penny', 1, { funding: 'equal' })]
    const model = buildTransferMatrixModel(document, month)
    expect(model.contributors.map(person => person.personId)).toEqual(document.household.adults.map(person => person.id))
    expect(model.totals.byPerson.map(person => person.amountPence)).toEqual(count === 1 ? [1] : [1, 0, 0])
    expectReconciliation(document, model)
  })

  it('distinguishes no items, explicit zero allocations, and positive amounts with no contributors', () => {
    const document = newBudgetDocument()
    expect(buildTransferMatrixModel(document, month)).toMatchObject({ accounts: [], contributors: [], totals: { plannedPence: 0, allocatedPence: 0, incomplete: false } })
    document.budget.accounts = [{ id: 'joint', name: 'Unassigned', ownerPersonIds: [] }]
    document.budget.pots = [{ id: 'zero', name: 'Zero pot', accountId: 'joint' }]
    document.budget.categories = [{ id: 'bills', name: 'Bills' }]
    document.budget.snapshots[month] = { items: [item('Zero direct', 0), item('Zero pot', 0, { destination: { kind: 'pot', potId: 'zero' } })] }
    const zero = buildTransferMatrixModel(document, month)
    expect(zero.accounts[0]!.allocations).toHaveLength(2)
    expect(zero.totals.incomplete).toBe(false)
    expectReconciliation(document, zero)
    document.budget.snapshots[month]!.items.push(item('No adults', 1, { funding: 'equal' }))
    const gap = buildTransferMatrixModel(document, month)
    expect(gap.totals).toMatchObject({ plannedPence: 1, allocatedPence: 0, incomplete: true })
    expectReconciliation(document, gap)
  })

  it('uses inherited items with selected-month incomes and retains stable row IDs', () => {
    const document = mixedHousehold()
    document.budget.incomeSources[0]!.changes['2027-01'] = 10000
    document.budget.snapshots['2027-03'] = { items: [] }
    const original = buildTransferMatrixModel(document, month)
    const inherited = buildTransferMatrixModel(document, '2027-02')
    expect(inherited).toMatchObject({ month: '2027-02', sourceMonth: month, nextBudgetMonth: '2027-03', hasExplicitBudget: true, importedBaseline: false })
    expect(allItems(inherited)[0]!.byPerson.map(person => person.amountPence)).toEqual([5001, 5000])
    expect(inherited.accounts.map(row => row.id)).toEqual(original.accounts.map(row => row.id))
    expect(allItems(inherited).map(row => row.id)).toEqual(allItems(original).map(row => row.id))
    expectReconciliation(document, inherited)
    expect(buildTransferMatrixModel(document, '2027-03').accounts).toEqual([])
  })

  it('supports imported baselines and uses the already normalised monthly amount of annual items', () => {
    const document = mixedHousehold()
    const annualPence = 10001
    document.budget.importedBaseline = [item('Annual cover', monthlyContributionPence(annualPence, 'annually'), {
      entryAmountPence: annualPence, frequency: 'annually', funding: 'equal',
    })]
    const model = buildTransferMatrixModel(document, '2026-10')
    expect(model).toMatchObject({ sourceMonth: null, hasExplicitBudget: false, importedBaseline: true, nextBudgetMonth: month })
    expect(model.totals).toMatchObject({ plannedPence: 833, allocatedPence: 833 })
    expectReconciliation(document, model)
  })

  it('keeps IDs unique across row kinds and stable across renaming and reordering', () => {
    const document = mixedHousehold()
    document.budget.snapshots[month]!.items.push(item('joint', 0))
    const before = buildTransferMatrixModel(document, month)
    const ids = before.accounts.flatMap(account => [account.id, ...account.allocations.flatMap(row => [row.id, ...row.items.map(item => item.id)])])
    expect(new Set(ids).size).toBe(ids.length)
    document.budget.accounts.reverse()
    document.budget.accounts.find(account => account.id === 'joint')!.name = 'Renamed'
    document.budget.snapshots[month]!.items.reverse()
    const after = buildTransferMatrixModel(document, month)
    expect(allItems(after).map(item => item.id).sort()).toEqual(allItems(before).map(item => item.id).sort())
    expectReconciliation(document, after)
  })

  it.each(['account', 'pot', 'category', 'contributor'] as const)('rejects unsupported %s references instead of creating a plausible partial hierarchy', reference => {
    const document = mixedHousehold()
    if (reference === 'account') document.budget.accounts = []
    if (reference === 'pot') document.budget.pots = []
    if (reference === 'category') document.budget.categories = []
    if (reference === 'contributor') document.budget.snapshots[month]!.items[1]!.contributions![0]!.personId = 'unknown'
    expect(() => buildTransferMatrixModel(document, month)).toThrow('Transfer matrix requires a valid budget document')
  })
})
