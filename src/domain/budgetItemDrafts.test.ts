import { expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument } from './budgetDocument'
import { commitItemBatch, moneyPence, newItemDraft, readItemDraft, type BudgetItemBatch, type BudgetItemDraft } from './budgetItemDrafts'
import { budgetTransfers } from './budgetTransfers'
import { resolveBudget } from './monthlyBudget'

function fixture() {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  document.budget.categories = [{ id: 'bills', name: 'Bills' }]
  document.budget.accounts = [{ id: 'account', name: 'Current account', accountTypeId: 'current-account', provider: 'Monzo', ownerPersonIds: ['nick', 'immy'] }]
  document.budget.pots = [{ id: 'pot', name: 'Spending', accountId: 'account' }]
  document.budget.incomeSources = [
    { id: 'i1', personId: 'nick', name: 'Salary', type: 'employment', baseAmountPence: 200000, baseEffectiveFrom: '2026-01', changes: {} },
    { id: 'i2', personId: 'immy', name: 'Salary', type: 'employment', baseAmountPence: 100000, baseEffectiveFrom: '2026-01', changes: {} },
  ]
  return document
}
function row(id = 'item', patch: Partial<BudgetItemDraft> = {}): BudgetItemDraft {
  return { ...newItemDraft(id, 'nick'), name: ' Same name ', amount: '10.01', touched: true, ...patch }
}
function batch(rows: BudgetItemDraft[] = [row()]): BudgetItemBatch {
  return { rows, categoryId: 'bills', destination: { destination: { kind: 'pot', potId: 'pot' } } }
}

it('adds rows with unique IDs and repeated names in one snapshot while ignoring untouched blanks', () => {
  const document = fixture()
  const original = structuredClone(document)
  const result = commitItemBatch(document, '2026-11', batch([row('one'), newItemDraft('blank', 'nick'), row('two', { frequency: 'annually', amount: '120' })]))
  if ('error' in result) throw new Error(result.error.message)
  expect(result.items.map(item => item.id)).toEqual(['one', 'two'])
  expect(result.items.map(item => item.name)).toEqual(['Same name', 'Same name'])
  expect(result.items[1]!.amountPence).toBe(1000)
  expect(result.document.budget.snapshots['2026-11']!.items).toHaveLength(2)
  expect(document).toEqual(original)
})

it('validates every started row and returns no document on any invalid input', () => {
  const document = fixture()
  const original = structuredClone(document)
  for (const patch of [{ name: '' }, { amount: '' }, { amount: '-1' }, { amount: '1.001' }, { amount: 'Infinity' }, { amount: '9007199254740992' }]) {
    const result = commitItemBatch(document, '2026-11', batch([row('valid'), row('invalid', patch)]))
    expect(result).toMatchObject({ error: { rowId: 'invalid' } })
  }
  expect(commitItemBatch(document, '2026-11', batch([newItemDraft('blank', 'nick')]))).toMatchObject({ error: { field: 'rows' } })
  expect(commitItemBatch(document, '2026-11', batch([{ ...newItemDraft('started', 'nick'), touched: true }]))).toMatchObject({ error: { rowId: 'started', field: 'name' } })
  expect(document).toEqual(original)
  expect(moneyPence('.50')).toBe(50)
  expect(moneyPence('0')).toBe(0)
})

it('uses all five funding rules and routes their rounded monthly contributions to the selected pot', () => {
  const document = fixture()
  const request = batch([
    row('ratio'), row('equal', { funding: 'equal' }), row('single', { funding: 'single', singleFunderId: 'immy' }),
    row('fixed', { funding: 'fixed', frequency: 'annually', amount: '120', contributions: { nick: '3', immy: '7' } }),
    row('custom', { funding: 'custom', customShares: { nick: '1', immy: '2' } }),
  ])
  const result = commitItemBatch(document, '2026-11', request)
  if ('error' in result) throw new Error(result.error.message)
  const people = ['nick', 'immy']
  const expected = [[667, 334], [501, 500], [0, 1001], [300, 700], [334, 667]]
  result.items.forEach((item, index) => {
    const preview = budgetTransfers(result.document.budget, people, '2026-11', [item])
    expect(preview.people.map(person => person.plannedPence)).toEqual(expected[index])
    expect(preview.accounts[0]!.pots).toMatchObject([{ potId: 'pot', amountPence: item.amountPence }])
  })
  const all = budgetTransfers(result.document.budget, people, '2026-11', result.items)
  expect(all.accounts[0]!.amountPence).toBe(5004)
})

it('rejects invalid fixed contributions, people and custom weights while allowing zero amounts', () => {
  const invalidContributions: Array<Record<string, string>> = [{ nick: '-1', immy: '11.01' }, { nick: '1.001' }, { nick: '4', immy: '5' }]
  for (const contributions of invalidContributions) {
    expect(readItemDraft(row('fixed', { funding: 'fixed', contributions }), 'bills', { kind: 'account', accountId: 'account' }, ['nick', 'immy'])).toMatchObject({ error: { field: 'contributions' } })
  }
  const invalidWeights: Array<Record<string, string>> = [{ nick: '0', immy: '0' }, { nick: '-1' }, { nick: 'NaN' }, { nick: '1e308' }]
  for (const customShares of invalidWeights) {
    expect(readItemDraft(row('custom', { funding: 'custom', customShares }), 'bills', { kind: 'account', accountId: 'account' }, ['nick', 'immy'])).toMatchObject({ error: { field: 'customShares' } })
  }
  expect(readItemDraft(row('single', { funding: 'single', singleFunderId: 'gone' }), 'bills', { kind: 'account', accountId: 'account' }, ['nick', 'immy'])).toMatchObject({ error: { field: 'singleFunderId' } })
  expect(readItemDraft(row('zero', { amount: '0', funding: 'custom' }), 'bills', { kind: 'account', accountId: 'account' }, ['nick', 'immy'])).toHaveProperty('item')
  const document = fixture()
  document.budget.incomeSources = []
  const result = commitItemBatch(document, '2026-11', batch())
  if ('error' in result) throw new Error(result.error.message)
  expect(budgetTransfers(result.document.budget, ['nick', 'immy'], '2026-11', result.items).unresolvedItemIds).toEqual(['item'])
})

it('commits shared staged records once and rechecks the latest categories, pots and owners', () => {
  const document = fixture()
  const request: BudgetItemBatch = {
    ...batch([row('one'), row('two')]), newCategory: { id: 'new-category', name: ' Fun ' },
    destination: {
      destination: { kind: 'pot', potId: 'new-pot' },
      stagedAccount: { id: 'new-account', name: 'Current account', provider: 'Starling', accountTypeId: 'current-account', ownerPersonIds: ['nick'] },
      stagedPot: { id: 'new-pot', name: ' Holiday ', accountId: 'new-account' },
    },
  }
  const result = commitItemBatch(document, '2026-11', request)
  if ('error' in result) throw new Error(result.error.message)
  expect(result.document.budget.accounts).toHaveLength(2)
  expect(result.document.budget.pots).toHaveLength(2)
  expect(result.document.budget.categories.at(-1)!.name).toBe('Fun')
  expect(result.items.every(item => item.categoryId === 'new-category' && item.destination.kind === 'pot' && item.destination.potId === 'new-pot')).toBe(true)
  expect(decodeBudgetDocument(JSON.parse(JSON.stringify(result.document)))).toEqual(result.document)
  const categoryChanged = structuredClone(document)
  categoryChanged.budget.categories.push({ id: 'other', name: 'FUN' })
  expect(commitItemBatch(categoryChanged, '2026-11', request)).toMatchObject({ error: { field: 'category' } })
  const householdChanged = structuredClone(document)
  householdChanged.household.adults = [{ id: 'immy', name: 'Immy' }]
  expect(commitItemBatch(householdChanged, '2026-11', request)).toMatchObject({ error: { field: 'destination' } })
  const existingAccountRequest = { ...request, destination: { destination: { kind: 'pot' as const, potId: 'new-pot' }, stagedPot: { id: 'new-pot', name: ' SPENDING ', accountId: 'account' } } }
  expect(commitItemBatch(document, '2026-11', existingAccountRequest)).toMatchObject({ error: { field: 'destination' } })
  const deleted = structuredClone(document)
  deleted.budget.pots = []
  expect(commitItemBatch(deleted, '2026-11', batch())).toMatchObject({ error: { field: 'destination' } })
})

it('saves only staged records belonging to the selected path and preserves month inheritance and existing items', () => {
  const document = fixture()
  const seed = commitItemBatch(document, '2026-10', batch([row('old')]))
  if ('error' in seed) throw new Error(seed.error.message)
  seed.document.budget.snapshots['2026-12'] = { items: [] }
  const request = batch([row('new')])
  request.destination.stagedAccount = { id: 'abandoned', name: 'Other', accountTypeId: 'other', provider: 'Bank', ownerPersonIds: ['nick'] }
  request.destination.stagedPot = { id: 'abandoned-pot', name: 'Unused', accountId: 'abandoned' }
  const result = commitItemBatch(seed.document, '2026-11', request)
  if ('error' in result) throw new Error(result.error.message)
  expect(result.document.budget.accounts).toHaveLength(1)
  expect(result.document.budget.pots).toHaveLength(1)
  expect(resolveBudget(result.document.budget, '2026-10').items.map(item => item.id)).toEqual(['old'])
  expect(resolveBudget(result.document.budget, '2026-11').items.map(item => item.id)).toEqual(['old', 'new'])
  expect(resolveBudget(result.document.budget, '2026-12').items).toEqual([])
  const edit = commitItemBatch(result.document, '2026-11', { ...batch([row('old', { name: 'Updated' })]), editingId: 'old' })
  if ('error' in edit) throw new Error(edit.error.message)
  expect(resolveBudget(edit.document.budget, '2026-11').items.map(item => item.name)).toEqual(['Updated', 'Same name'])
  expect(commitItemBatch(edit.document, '2026-11', { ...batch([row('gone')]), editingId: 'gone' })).toMatchObject({ error: { field: 'rows' } })
})
