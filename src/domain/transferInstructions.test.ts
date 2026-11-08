import { expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { monthlyContributionPence, type BudgetItem } from './monthlyBudget'
import { buildTransferInstructions, type TransferInstructions } from './transferInstructions'

const month = '2026-12'
const item = (id: string, amountPence: number, extra: Partial<BudgetItem> = {}): BudgetItem => ({
  id, name: id, categoryId: 'bills', entryAmountPence: amountPence, amountPence, frequency: 'monthly', funding: 'proportional',
  destination: { kind: 'account', accountId: 'joint' }, ...extra,
})
function fixture(): BudgetDocument {
  const document = newBudgetDocument()
  document.household.adults = [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }]
  document.budget.categories = [{ id: 'bills', name: 'Bills' }]
  document.budget.accounts = [{ id: 'joint', name: 'Joint', ownerPersonIds: ['nick', 'immy'] }, { id: 'personal', name: 'Personal', ownerPersonIds: ['immy'] }]
  document.budget.pots = [{ id: 'bills-pot', name: 'Bills', accountId: 'joint' }, { id: 'savings', name: 'Savings', accountId: 'joint' }, { id: 'personal-pot', name: 'Personal pot', accountId: 'personal' }]
  document.budget.incomeSources = [
    { id: 'nick-pay', name: 'Pay', personId: 'nick', type: 'employment', baseAmountPence: 200000, changes: {} },
    { id: 'immy-pay', name: 'Pay', personId: 'immy', type: 'employment', baseAmountPence: 100000, changes: {} },
  ]
  document.budget.snapshots[month] = { items: [] }
  return document
}
function reconcile(model: TransferInstructions) {
  for (const account of model.accounts) {
    for (const step of [...account.fundingRequirements, ...account.potMovements]) {
      expect(step.amountPence).toBe(step.breakdown.reduce((sum, row) => sum + row.amountPence, 0))
      for (const row of step.breakdown) expect(row.amountPence).toBe(row.contributions.reduce((sum, person) => sum + person.amountPence, 0))
    }
  }
  const funding = model.steps.filter(step => step.kind === 'account-funding')
  const pots = model.steps.filter(step => step.kind === 'pot-movement')
  expect(model.totals.actionableFundingPence).toBe(funding.reduce((sum, step) => sum + step.amountPence, 0))
  expect(model.totals.actionablePotMovementPence).toBe(pots.reduce((sum, step) => sum + step.amountPence, 0))
  expect(new Set(model.steps.map(step => step.id)).size).toBe(model.steps.length)
  for (const pot of pots) for (const dependency of pot.dependsOn) expect(funding.some(step => step.id === dependency)).toBe(true)
}

it('funds a single-person account once, then moves its pot allocation separately', () => {
  const document = fixture()
  document.household.adults = [document.household.adults[0]!]
  document.budget.accounts = [{ id: 'joint', name: 'Personal', ownerPersonIds: ['nick'] }]
  document.budget.pots = document.budget.pots.filter(pot => pot.accountId === 'joint')
  document.budget.incomeSources = [document.budget.incomeSources[0]!]
  document.budget.snapshots[month]!.items = [item('Direct', 4000), item('Bills', 6000, { destination: { kind: 'pot', potId: 'bills-pot' } })]
  const model = buildTransferInstructions(document, month)
  expect(model.steps).toMatchObject([
    { kind: 'account-funding', personId: 'nick', source: null, amountPence: 10000 },
    { kind: 'pot-movement', personId: 'nick', source: { kind: 'account', accountId: 'joint' }, destination: { kind: 'pot', potId: 'bills-pot' }, amountPence: 6000 },
  ])
  expect(model.totals).toMatchObject({ plannedPence: 10000, allocatedFundingPence: 10000, actionableFundingPence: 10000, potAllocationPence: 6000, actionablePotMovementPence: 6000 })
  reconcile(model)
})

it('splits joint pot movements by contributor, with no extra contribution or storage writes', () => {
  const document = fixture()
  document.budget.snapshots[month]!.items = [item('Direct', 6000), item('Bills', 15000, { destination: { kind: 'pot', potId: 'bills-pot' } }), item('Savings', 9000, { destination: { kind: 'pot', potId: 'savings' } })]
  const original = structuredClone(document), model = buildTransferInstructions(document, month)
  expect(model.accounts[0]!.fundingRequirements.map(step => step.amountPence)).toEqual([20000, 10000])
  expect(model.accounts[0]!.potMovements.map(step => [step.personId, step.amountPence])).toEqual([['nick', 10000], ['immy', 5000], ['nick', 6000], ['immy', 3000]])
  expect(model.totals.allocatedFundingPence).toBe(30000)
  expect(model.totals.potAllocationPence).toBe(24000)
  expect(document).toEqual(original)
  reconcile(model)
})

it('assigns all personal pot movements to the owner while retaining original funding attribution', () => {
  const document = fixture()
  document.budget.snapshots[month]!.items = [item('Personal savings', 10001, { destination: { kind: 'pot', potId: 'personal-pot' }, funding: 'fixed', contributions: [{ personId: 'nick', amountPence: 7001 }, { personId: 'immy', amountPence: 3000 }] })]
  const model = buildTransferInstructions(document, month), account = model.accounts[0]!
  expect(account.fundingRequirements.map(step => [step.personId, step.amountPence])).toEqual([['nick', 7001], ['immy', 3000]])
  expect(account.potMovements).toMatchObject([{ personId: 'immy', amountPence: 10001, breakdown: [{ contributions: [{ personId: 'nick', amountPence: 7001 }, { personId: 'immy', amountPence: 3000 }] }] }])
  expect(account.potMovements[0]!.dependsOn).toEqual(account.fundingRequirements.map(step => step.id))
  reconcile(model)
})

it('withholds an incomplete account while retaining its comparison amounts and unrelated ready accounts', () => {
  const document = fixture()
  document.budget.incomeSources = []
  document.budget.snapshots[month]!.items = [item('Known joint', 100, { funding: 'equal' }), item('Unknown joint', 100), item('Ready personal', 300, { funding: 'single', singleFunderId: 'nick', destination: { kind: 'account', accountId: 'personal' } })]
  const model = buildTransferInstructions(document, month)
  expect(model.incomplete).toBe(true)
  expect(model.issues).toEqual([{ kind: 'unresolved-proportional', accountId: 'joint', itemId: 'Unknown joint' }])
  expect(model.accounts[0]).toMatchObject({ status: 'needs-review', fundingRequirements: [{ status: 'needs-review', amountPence: 50 }, { status: 'needs-review', amountPence: 50 }] })
  expect(model.steps).toMatchObject([{ personId: 'nick', destination: { accountId: 'personal' }, amountPence: 300 }])
  expect(model.totals).toMatchObject({ plannedPence: 500, allocatedFundingPence: 400, actionableFundingPence: 300 })
  reconcile(model)
})

it('flags missing pot ownership rather than guessing an actor or issuing partial account steps', () => {
  const document = fixture()
  document.budget.accounts[0]!.ownerPersonIds = []
  document.budget.snapshots[month]!.items = [item('Bills', 101, { funding: 'equal', destination: { kind: 'pot', potId: 'bills-pot' } })]
  const model = buildTransferInstructions(document, month)
  expect(model.issues).toEqual([{ kind: 'missing-pot-owner', accountId: 'joint', potId: 'bills-pot' }])
  expect(model.accounts[0]!.potMovements).toMatchObject([{ personId: null, amountPence: 101, status: 'needs-review' }])
  expect(model.steps).toEqual([])
  expect(model.totals).toMatchObject({ allocatedFundingPence: 101, actionableFundingPence: 0, potAllocationPence: 101, actionablePotMovementPence: 0 })
  reconcile(model)
})

it.each([
  { funding: 'single' as const },
  { funding: 'custom' as const, customShares: { nick: 0, immy: 0 } },
])('marks unallocated $funding funding as unresolved', rule => {
  const document = fixture()
  document.budget.snapshots[month]!.items = [item('Unassigned', 100, rule)]
  const model = buildTransferInstructions(document, month)
  expect(model.issues).toEqual([{ kind: 'unallocated', accountId: 'joint', itemId: 'Unassigned' }])
  expect(model.steps).toEqual([])
  expect(model.totals.plannedPence).toBe(100)
})

it('preserves spare pennies, custom weights, fixed amounts and annual monthly conversion', () => {
  const document = fixture()
  const annual = monthlyContributionPence(10001, 'annually')
  document.budget.snapshots[month]!.items = [item('Tie', 1, { funding: 'equal' }), item('Weights', 101, { funding: 'custom', customShares: { nick: 1, immy: 3 } }), item('Annual', annual, { frequency: 'annually', entryAmountPence: 10001 }), item('Zero', 0)]
  const model = buildTransferInstructions(document, month)
  expect(model.accounts[0]!.fundingRequirements[0]!.breakdown).toMatchObject([{ itemId: 'Tie', amountPence: 1 }, { itemId: 'Weights', amountPence: 25 }, { itemId: 'Annual', amountPence: 555 }])
  expect(model.accounts[0]!.fundingRequirements[1]!.breakdown).toMatchObject([{ itemId: 'Weights', amountPence: 76 }, { itemId: 'Annual', amountPence: 278 }])
  expect(model.totals.allocatedFundingPence).toBe(935)
  expect(model.steps.every(step => step.amountPence > 0)).toBe(true)
  reconcile(model)
})

it('resolves inherited months with their income histories and stable IDs independent of amount', () => {
  const document = fixture()
  document.budget.snapshots[month]!.items = [item('Rent', 30000)]
  const original = buildTransferInstructions(document, '2027-01')
  document.budget.incomeSources[0]!.changes['2027-01'] = 100000
  const changed = buildTransferInstructions(document, '2027-01')
  expect(original.steps.map(step => step.amountPence)).toEqual([20000, 10000])
  expect(changed.steps.map(step => step.amountPence)).toEqual([15000, 15000])
  expect(changed.steps.map(step => step.id)).toEqual(original.steps.map(step => step.id))
  expect(buildTransferInstructions(document, month).steps.map(step => step.amountPence)).toEqual([20000, 10000])
  expect(changed.steps[0]!.id).not.toBe(buildTransferInstructions(document, month).steps[0]!.id)
})

it('rejects invalid references and months; distinguishes an empty plan from unavailable calculations', () => {
  const document = fixture()
  expect(buildTransferInstructions(document, month)).toMatchObject({ steps: [], issues: [], incomplete: false })
  document.budget.snapshots[month]!.items = [item('Broken', 100, { destination: { kind: 'pot', potId: 'missing' } })]
  expect(() => buildTransferInstructions(document, month)).toThrow('valid budget document')
  expect(() => buildTransferInstructions(fixture(), '2027-13')).toThrow('calendar month')
})

it('keeps a non-owner contributor responsible for their share of a joint-account pot', () => {
  const document = fixture()
  document.household.adults.push({ id: 'sam', name: 'Sam' })
  document.budget.snapshots[month]!.items = [item('Shared bill', 101, { funding: 'single', singleFunderId: 'sam', destination: { kind: 'pot', potId: 'bills-pot' } })]
  const model = buildTransferInstructions(document, month)
  expect(model.steps.map(step => [step.kind, step.personId, step.amountPence])).toEqual([['account-funding', 'sam', 101], ['pot-movement', 'sam', 101]])
  reconcile(model)
})
