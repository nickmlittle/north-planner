import type { BudgetDocument } from './budgetDocument'
import { isAccountTypeId } from './accountTypes'
import { monthlyContributionPence, resolveBudget, updateBudgetAtMonth, validDestination, type BudgetAccount, type BudgetCategory, type BudgetDestination, type BudgetFrequency, type BudgetItem, type BudgetPot, type FundingRule } from './monthlyBudget'

export type DestinationSelection = { destination?: BudgetDestination; stagedAccount?: BudgetAccount; stagedPot?: BudgetPot }
export type BudgetItemDraft = {
  id: string
  name: string
  amount: string
  frequency: BudgetFrequency
  funding: FundingRule
  contributions: Record<string, string>
  customShares: Record<string, string>
  singleFunderId: string
  touched: boolean
}
export type DraftField = 'name' | 'amount' | 'frequency' | 'funding' | 'contributions' | 'customShares' | 'singleFunderId'
export type BatchError = { rowId?: string; field: DraftField | 'category' | 'destination' | 'rows'; message: string }
export type BudgetItemBatch = { rows: BudgetItemDraft[]; categoryId: string; newCategory?: BudgetCategory; destination: DestinationSelection; editingId?: string }

export function newItemDraft(id: string, personId: string): BudgetItemDraft {
  return { id, name: '', amount: '', frequency: 'monthly', funding: 'proportional', contributions: {}, customShares: {}, singleFunderId: personId, touched: false }
}

export function itemDraft(item: BudgetItem): BudgetItemDraft {
  return {
    id: item.id, name: item.name, amount: (item.entryAmountPence / 100).toFixed(2), frequency: item.frequency,
    funding: item.funding, contributions: Object.fromEntries((item.contributions ?? []).map(row => [row.personId, (row.amountPence / 100).toFixed(2)])),
    customShares: Object.fromEntries(Object.entries(item.customShares ?? {}).map(([id, value]) => [id, String(value)])),
    singleFunderId: item.singleFunderId ?? '', touched: true,
  }
}

export function moneyPence(value: string): number | undefined {
  const raw = value.trim()
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(raw)) return undefined
  const pence = Math.round(Number(raw) * 100)
  return Number.isSafeInteger(pence) && pence >= 0 ? pence : undefined
}

export function readItemDraft(row: BudgetItemDraft, categoryId: string, destination: BudgetDestination, personIds: string[]): { item: BudgetItem } | { error: BatchError } {
  const fail = (field: DraftField, message: string) => ({ error: { rowId: row.id, field, message } })
  if (!row.name.trim()) return fail('name', 'Enter an item name.')
  const entryAmountPence = moneyPence(row.amount)
  if (entryAmountPence === undefined) return fail('amount', 'Enter a non-negative amount with up to two decimal places.')
  if (!['monthly', 'annually'].includes(row.frequency)) return fail('frequency', 'Choose Monthly or Annually.')
  if (!['proportional', 'equal', 'single', 'fixed', 'custom'].includes(row.funding)) return fail('funding', 'Choose a funding type.')
  const item: BudgetItem = { id: row.id, name: row.name.trim(), categoryId, destination, entryAmountPence, amountPence: monthlyContributionPence(entryAmountPence, row.frequency), frequency: row.frequency, funding: row.funding }
  if (row.funding === 'single') {
    if (!personIds.includes(row.singleFunderId)) return fail('singleFunderId', 'Choose a household member to fund this item.')
    item.singleFunderId = row.singleFunderId
  }
  if (row.funding === 'fixed') {
    if (Object.entries(row.contributions).some(([id, value]) => !personIds.includes(id) && value.trim())) return fail('contributions', 'Update contributions for the current household members.')
    const amounts = personIds.map(personId => ({ personId, amountPence: row.contributions[personId]?.trim() ? moneyPence(row.contributions[personId]!) : 0 }))
    if (amounts.some(value => value.amountPence === undefined)) return fail('contributions', 'Enter non-negative monthly contributions with up to two decimal places.')
    const contributions = amounts.map(value => ({ personId: value.personId, amountPence: value.amountPence! }))
    if (contributions.reduce((sum, value) => sum + value.amountPence, 0) !== item.amountPence) return fail('contributions', `Monthly contributions must total £${(item.amountPence / 100).toFixed(2)}.`)
    item.contributions = contributions.filter(value => value.amountPence > 0)
  }
  if (row.funding === 'custom') {
    if (Object.entries(row.customShares).some(([id, value]) => !personIds.includes(id) && value.trim())) return fail('customShares', 'Update weights for the current household members.')
    const weights = personIds.map(id => [id, row.customShares[id]?.trim() ? Number(row.customShares[id]) : 0] as const)
    const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0)
    if (weights.some(([, weight]) => !Number.isFinite(weight) || weight < 0 || !Number.isFinite(item.amountPence * weight)) || !Number.isFinite(totalWeight) || item.amountPence > 0 && totalWeight <= 0) return fail('customShares', 'Enter non-negative relative weights, with at least one positive weight for a positive amount.')
    item.customShares = Object.fromEntries(weights)
  }
  return { item }
}

export function commitItemBatch(document: BudgetDocument, month: string, batch: BudgetItemBatch): { document: BudgetDocument; items: BudgetItem[] } | { error: BatchError } {
  const fail = (field: 'category' | 'destination' | 'rows', message: string) => ({ error: { field, message } })
  let budget = document.budget
  const personIds = document.household.adults.map(person => person.id)
  const category = batch.newCategory
  const categoryId = category?.id ?? batch.categoryId
  if (category) {
    if (!category.name.trim()) return fail('category', 'Enter a category name.')
    if (budget.categories.some(row => row.id === category.id || row.name.trim().toLocaleLowerCase('en-GB') === category.name.trim().toLocaleLowerCase('en-GB'))) return fail('category', 'A category with this name already exists.')
    budget = { ...budget, categories: [...budget.categories, { ...category, name: category.name.trim() }] }
  } else if (!budget.categories.some(row => row.id === categoryId)) return fail('category', 'Choose an available category.')

  const { destination, stagedAccount, stagedPot } = batch.destination
  if (!destination) return fail('destination', 'Choose an account or pot destination.')
  const potToAdd = destination.kind === 'pot' && stagedPot?.id === destination.potId ? stagedPot : undefined
  const accountId = destination.kind === 'account' ? destination.accountId : potToAdd?.accountId ?? budget.pots.find(row => row.id === destination.potId)?.accountId
  const accountToAdd = stagedAccount?.id === accountId ? stagedAccount : undefined
  if (accountToAdd) {
    if (budget.accounts.some(row => row.id === accountToAdd.id) || !accountToAdd.name.trim() || !accountToAdd.provider?.trim() || !isAccountTypeId(accountToAdd.accountTypeId) || !accountToAdd.ownerPersonIds.length || accountToAdd.ownerPersonIds.some(id => !personIds.includes(id))) return fail('destination', 'Complete the new account details for the current household.')
    budget = { ...budget, accounts: [...budget.accounts, accountToAdd] }
  }
  if (potToAdd) {
    if (!potToAdd.name.trim() || !budget.accounts.some(row => row.id === potToAdd.accountId)) return fail('destination', 'Choose an available parent account for the new pot.')
    if (budget.pots.some(row => row.id === potToAdd.id || row.accountId === potToAdd.accountId && row.name.trim().toLocaleLowerCase('en-GB') === potToAdd.name.trim().toLocaleLowerCase('en-GB'))) return fail('destination', 'This pot already exists in the account. Choose the existing pot.')
    budget = { ...budget, pots: [...budget.pots, { ...potToAdd, name: potToAdd.name.trim() }] }
  }
  if (!validDestination(destination, budget)) return fail('destination', 'Choose an available account or pot destination.')
  const rows = batch.rows.filter(row => row.touched || row.name.trim() || row.amount.trim())
  if (!rows.length) return fail('rows', 'Add at least one budget item.')
  const items: BudgetItem[] = []
  for (const row of rows) {
    const result = readItemDraft(row, categoryId, destination, personIds)
    if ('error' in result) return result
    items.push(result.item)
  }
  if (new Set(items.map(item => item.id)).size !== items.length) return fail('rows', 'Each item needs its own ID. Reopen the editor and try again.')
  const existing = resolveBudget(budget, month).items
  if (batch.editingId) {
    if (items.length !== 1 || items[0]!.id !== batch.editingId || !existing.some(row => row.id === batch.editingId)) return fail('rows', 'This item is no longer available to edit. Reopen the editor.')
  } else if (items.some(item => existing.some(row => row.id === item.id))) return fail('rows', 'These items have already been saved. Reopen the editor.')
  return { document: { ...document, budget: updateBudgetAtMonth(budget, month, old => batch.editingId ? old.map(row => row.id === batch.editingId ? items[0]! : row) : [...old, ...items]) }, items }
}
