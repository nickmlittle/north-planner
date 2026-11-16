import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { resolveBudget } from './monthlyBudget'
import { orderTransferAccounts, paydayLayout, paydayPlans, personTransferPlans, sendPence, type PersonTransferPlans, type TransferAccount } from './personTransfers'
import { buildTransferInstructions, type TransferInstructions } from './transferInstructions'
import { paydaySteps, planSteps, waitingOn } from './transferTicks'

function baseline() {
  const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))
  if (!document) throw new Error('Baseline fixture is invalid')
  return document
}
function plans(document: BudgetDocument, month = '2026-11', withInstructions = true) {
  const ids = document.household.adults.map(person => person.id)
  const transfers = budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items)
  return personTransferPlans(transfers.accounts, withInstructions ? buildTransferInstructions(document, month) : undefined, ids)
}
const named = (document: BudgetDocument, name: string) => document.household.adults.find(person => person.name === name)!.id
const accountNamed = (document: BudgetDocument, provider: string, name: string) => document.budget.accounts.find(account => account.provider === provider && account.name === name)!.id
const potNamed = (document: BudgetDocument, accountId: string, name: string) => document.budget.pots.find(pot => pot.accountId === accountId && pot.name === name)!.id

it('gives each person what they fund, reconciling to the household total', () => {
  const document = baseline(), result = plans(document)
  const ada = result.people.find(plan => plan.personId === named(document, 'Ada'))!
  const ben = result.people.find(plan => plan.personId === named(document, 'Ben'))!
  expect(ada.fundingPence).toBe(442966)
  expect(ben.fundingPence).toBe(321221)
  expect(ada.fundingPence + ben.fundingPence).toBe(764187)
  expect(result.needsReview).toEqual([])
  // One step per funded account plus one per pot move.
  for (const plan of [ada, ben]) expect(plan.fundCount + plan.moveCount).toBe(plan.stepCount)
  for (const plan of [ada, ben]) expect(plan.moveCount).toBe(plan.rows.reduce((sum, row) => sum + row.potMoves.length, 0))
  for (const plan of [ada, ben]) expect(plan.stepCount).toBe(plan.rows.filter(row => row.fundingPence > 0).length + plan.rows.reduce((sum, row) => sum + row.potMoves.length, 0))
})

it('lets the owner of a personal account make every pot move, and splits joint pot moves by contributor', () => {
  const document = baseline(), result = plans(document)
  const ada = result.people.find(plan => plan.personId === named(document, 'Ada'))!
  const ben = result.people.find(plan => plan.personId === named(document, 'Ben'))!
  const starling = accountNamed(document, 'Starling', 'Current account')
  expect(ada.rows.find(row => row.accountId === starling)).toMatchObject({ fundingPence: 69872, potMoves: [{ potId: potNamed(document, starling, 'Spending'), amountPence: 113542 }] })
  expect(ben.rows.find(row => row.accountId === starling)).toMatchObject({ fundingPence: 43670, potMoves: [] })
  const joint = accountNamed(document, 'Monzo', 'Current account')
  const bills = potNamed(document, joint, 'Bills')
  // Groceries (£325.47, split equally) has its own joint pot, so Bills holds the rest.
  const groceries = potNamed(document, joint, 'Groceries')
  expect(ada.rows.find(row => row.accountId === joint)?.potMoves.find(move => move.potId === bills)?.amountPence).toBe(51962)
  expect(ben.rows.find(row => row.accountId === joint)?.potMoves.find(move => move.potId === bills)?.amountPence).toBe(44596)
  expect([ada, ben].map(plan => plan.rows.find(row => row.accountId === joint)?.potMoves.find(move => move.potId === groceries)?.amountPence)).toEqual([16274, 16273])
})

it('says who else moves money on: an owner moves everything, including what others funded', () => {
  const document = baseline(), result = plans(document)
  const ada = result.people.find(plan => plan.personId === named(document, 'Ada'))!
  const ben = result.people.find(plan => plan.personId === named(document, 'Ben'))!
  const starling = accountNamed(document, 'Starling', 'Current account')
  const spending = potNamed(document, starling, 'Spending')
  expect(ada.rows.find(row => row.accountId === starling)?.potMoves[0]?.fromOthers).toEqual([{ personId: ben.personId, amountPence: 43670 }])
  expect(ben.rows.find(row => row.accountId === starling)?.movedOnBy).toEqual([{ personId: ada.personId, potIds: [spending], amountPence: 43670 }])
  // Joint contributors move their own share, so nobody moves anyone else's money there.
  const joint = accountNamed(document, 'Monzo', 'Current account')
  expect(ada.rows.find(row => row.accountId === joint)?.potMoves.every(move => move.fromOthers.length === 0)).toBe(true)
  expect(ada.rows.find(row => row.accountId === joint)?.movedOnBy).toEqual([])
})

it('withholds every step without instructions and lists those accounts for review', () => {
  const document = baseline()
  const withoutInstructions = plans(document, '2026-11', false)
  expect(withoutInstructions.people.every(plan => plan.rows.length === 0 && plan.stepCount === 0 && plan.fundingPence === 0)).toBe(true)
  expect(withoutInstructions.needsReview.every(account => account.reason === 'unavailable' && !account.notCalculated)).toBe(true)
  // The known amounts stay visible for comparison.
  expect(withoutInstructions.needsReview.flatMap(account => account.byPerson).reduce((sum, row) => sum + row.amountPence, 0)).toBe(764187)
})

it('moves accounts that cannot be calculated out of the steps and marks them not calculated', () => {
  const document = baseline()
  document.budget.incomeSources = []
  const noIncome = plans(document)
  expect(noIncome.needsReview.some(account => account.notCalculated && account.reason === 'unallocated')).toBe(true)
  for (const plan of noIncome.people) expect(plan.rows.some(row => noIncome.needsReview.some(account => account.accountId === row.accountId))).toBe(false)
})

it('orders transfer rows joint first, then by person in household order, then by label', () => {
  const document = baseline(), ids = document.household.adults.map(person => person.id), month = '2026-11'
  const transfers = budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items)
  const labels = new Map(document.budget.accounts.map(account => [account.id, `${account.provider} ${account.name}`]))
  const ordered = orderTransferAccounts([...transfers.accounts].reverse(), buildTransferInstructions(document, month), document.budget.accounts, ids, labels)
  const owners = ordered.map(row => document.budget.accounts.find(account => account.id === row.accountId)!.ownerPersonIds)
  const rank = (owner: readonly string[]) => owner.length > 1 ? -1 : ids.indexOf(owner[0]!)
  expect(owners.map(rank)).toEqual([...owners.map(rank)].sort((a, b) => a - b))
  expect(owners[0]!.length).toBeGreaterThan(1)
  for (let i = 1; i < ordered.length; i++) if (rank(owners[i]!) === rank(owners[i - 1]!)) expect(labels.get(ordered[i - 1]!.accountId)!.localeCompare(labels.get(ordered[i]!.accountId)!)).toBeLessThanOrEqual(0)
})

it('puts unowned accounts last and marks accounts the instructions flag for review as incomplete', () => {
  const row = (accountId: string) => ({ accountId, amountPence: 100, incomplete: false } as unknown as TransferAccount)
  const accounts = [{ id: 'none', ownerPersonIds: [] }, { id: 'solo', ownerPersonIds: ['p1'] }, { id: 'joint', ownerPersonIds: ['p1', 'p2'] }]
  const instructions = { accounts: [{ accountId: 'solo', status: 'needs-review' }] } as unknown as TransferInstructions
  const ordered = orderTransferAccounts([row('none'), row('solo'), row('joint')], instructions, accounts, ['p1', 'p2'], new Map())
  expect(ordered.map(account => [account.accountId, account.incomplete])).toEqual([['joint', false], ['solo', true], ['none', false]])
})

// ——— The household layout (D6, D7, P5, P6) ———

/** Audit 4's household: pay lands in each person's own account, salaries cover the plan, and Dining out has a joint Going out pot. */
function audit4() {
  const document = baseline()
  document.budget.pots.splice(2, 0, { id: 'going-out', name: 'Going out', accountId: 'joint' })
  for (const snapshot of Object.values(document.budget.snapshots)) for (const item of snapshot.items) if (item.name === 'Dining out') item.destination = { kind: 'pot', potId: 'going-out' }
  for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000; source.landsInAccountId = source.personId }
  return document
}
function payday(document: BudgetDocument, month = '2026-12') {
  const ids = document.household.adults.map(person => person.id)
  const instructions = buildTransferInstructions(document, month)
  return paydayPlans(document, month, orderTransferAccounts(budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items).accounts, instructions, document.budget.accounts, ids, new Map()), instructions)
}
const steps = (plans: PersonTransferPlans) => paydaySteps(plans).map(step => [step.key, step.amountPence, step.waitsFor])
const ticked = (...keys: string[]) => Object.fromEntries(keys.map(key => [key, { amountPence: 1, at: '2026-11-27T09:00:00.000Z' }]))

it('makes December’s payday 12 steps: Ada 4 with one net transfer, Ben 3, and 5 joint pot moves once for the household', () => {
  const plans = payday(audit4())
  expect(plans.layout).toBe('household')
  expect(steps(plans)).toEqual([
    ['ada:fund:joint', 222322, []], ['ada:fund:saving', 51898, []], ['ada:move:ada-spend', 113542, []],
    // Ada's £810.74 to Ben and Ben's £516.10 to Ada become one £294.64 transfer (D7).
    ['ada:fund:ben', 29464, []],
    ['ben:fund:joint', 179627, []], ['ben:fund:saving', 71848, []],
    // Ben's Spending includes Ada's money, so it waits for her net transfer (P6).
    ['ben:move:ben-spend', 124950, ['ada:fund:ben']],
    // Joint pot moves wait for both fundings of their account (D6, P6).
    ['household:move:bills', 96558, ['ada:fund:joint', 'ben:fund:joint']], ['household:move:groceries', 32547, ['ada:fund:joint', 'ben:fund:joint']],
    ['household:move:going-out', 25177, ['ada:fund:joint', 'ben:fund:joint']], ['household:move:holidays', 158636, ['ada:fund:joint', 'ben:fund:joint']],
    ['household:move:emergency', 123746, ['ada:fund:saving', 'ben:fund:saving']],
  ])
  // Each person still contributes what they did: netting changes the transfer, not the funding.
  const ada = plans.people[0]!, ben = plans.people[1]!
  expect(ada.rows.find(row => row.accountId === 'ben')).toMatchObject({ fundingPence: 81074, net: { personId: 'ben', otherPence: 51610, sendPence: 29464 } })
  expect(ben.rows.find(row => row.accountId === 'ada')).toMatchObject({ fundingPence: 51610, net: { personId: 'ada', otherPence: 81074, sendPence: 0 } })
  expect([ada.fundCount, ada.moveCount, ben.fundCount, ben.moveCount]).toEqual([3, 1, 2, 1])
  // Each household move keeps who it's from.
  expect(plans.household[0]!.moves.find(move => move.potId === 'groceries')!.byPerson).toEqual([{ personId: 'ada', amountPence: 16274 }, { personId: 'ben', amountPence: 16273 }])
})

/** Money into and out of each account by transfer, and into each pot by move. Unknown sources are each person's pay. */
function flows(plans: PersonTransferPlans, transfer: (row: PersonTransferPlans['people'][number]['rows'][number]) => number) {
  const totals = new Map<string, number>()
  const add = (key: string, pence: number) => totals.set(key, (totals.get(key) ?? 0) + pence)
  for (const plan of plans.people) for (const row of plan.rows) {
    if (!row.alreadyThere && transfer(row) > 0) { add(`account:${row.accountId}`, transfer(row)); add(`account:${row.fromAccountId ?? `pay:${plan.personId}`}`, -transfer(row)) }
    for (const move of row.potMoves) add(`pot:${move.potId}`, move.amountPence)
  }
  for (const row of plans.household) for (const move of row.moves) add(`pot:${move.potId}`, move.amountPence)
  return Object.fromEntries([...totals].filter(([, pence]) => pence !== 0).sort(([a], [b]) => a.localeCompare(b)))
}

it('gives every account and pot the same money as the per-person steps, for every fixture month', () => {
  const months = Array.from({ length: 10 }, (_, index) => `${index < 4 ? 2026 : 2027}-${String((index + 8) % 12 + 1).padStart(2, '0')}`)
  expect(months).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'])
  for (const document of [baseline(), audit4()]) for (const month of months) {
    const ids = document.household.adults.map(person => person.id)
    const instructions = buildTransferInstructions(document, month)
    const accounts = orderTransferAccounts(budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items).accounts, instructions, document.budget.accounts, ids, new Map())
    const old = personTransferPlans(accounts, instructions, ids), now = payday(document, month)
    expect(old.layout).toBe('per-person')
    expect(now.layout).toBe('household')
    expect(flows(now, sendPence)).toEqual(flows(old, row => row.fundingPence))
    // And each person's funding total is unchanged.
    expect(now.people.map(plan => plan.fundingPence)).toEqual(old.people.map(plan => plan.fundingPence))
  }
})

it('cancels out two equal transfers: nobody sends, and nothing waits for them', () => {
  const document = audit4()
  // Each puts £200.00 into the other's Spending.
  const fixed = (id: string, potId: string, mine: number, theirs: number, owner: string, other: string) => ({ id, name: id, categoryId: 'c1', entryAmountPence: mine + theirs, amountPence: mine + theirs, frequency: 'monthly' as const, destination: { kind: 'pot' as const, potId }, funding: 'fixed' as const, contributions: [{ personId: owner, amountPence: mine }, { personId: other, amountPence: theirs }] })
  for (const snapshot of Object.values(document.budget.snapshots)) {
    snapshot.items = snapshot.items.filter(item => !(item.destination?.kind === 'pot' && ['ada-spend', 'ben-spend'].includes(item.destination.potId)))
    snapshot.items.push(fixed('a', 'ada-spend', 40000, 20000, 'ada', 'ben'), fixed('b', 'ben-spend', 30000, 20000, 'ben', 'ada'))
  }
  const plans = payday(document)
  const ada = plans.people[0]!.rows.find(row => row.accountId === 'ben')!, ben = plans.people[1]!.rows.find(row => row.accountId === 'ada')!
  expect([ada.fundingPence, ben.fundingPence]).toEqual([20000, 20000])
  expect([ada.net?.sendPence, ben.net?.sendPence]).toEqual([0, 0])
  expect(paydaySteps(plans).filter(step => step.key === 'ada:fund:ben' || step.key === 'ben:fund:ada')).toEqual([])
  expect(paydaySteps(plans).find(step => step.key === 'ben:move:ben-spend')!.waitsFor).toEqual([])
})

it('nets only between two pay accounts: not without a landing account, one way, or into a joint account', () => {
  // The baseline sets no landing accounts: both cross transfers stay, at full amount.
  const noSources = payday(baseline())
  expect(noSources.people.flatMap(plan => plan.rows).some(row => row.net)).toBe(false)
  expect(steps(noSources).filter(([key]) => key === 'ada:fund:ben' || key === 'ben:fund:ada').map(([key, pence]) => [key, pence])).toEqual([['ada:fund:ben', 81074], ['ben:fund:ada', 43670]])
  // One way only: Ben no longer funds Ada's Spending, so Ada sends her full share.
  const oneWay = audit4()
  for (const snapshot of Object.values(oneWay.budget.snapshots)) for (const item of snapshot.items) if (item.destination?.kind === 'pot' && item.destination.potId === 'ada-spend') { item.funding = 'single'; item.singleFunderId = 'ada' }
  expect(steps(payday(oneWay)).find(([key]) => key === 'ada:fund:ben')?.[1]).toBe(81074)
  // Ben's pay lands in Monzo Joint: Ada's transfer to Nationwide Ben isn't to his pay account, so nothing nets.
  const joint = audit4()
  joint.budget.incomeSources.find(source => source.personId === 'ben')!.landsInAccountId = 'joint'
  expect(payday(joint).people.flatMap(plan => plan.rows).some(row => row.net)).toBe(false)
})

it('waits for late pay: the household moves wait until both fundings are ticked, at any amount', () => {
  const plans = payday(audit4())
  const bills = paydaySteps(plans).find(step => step.key === 'household:move:bills')!
  expect(waitingOn(bills, undefined)).toEqual(['ada:fund:joint', 'ben:fund:joint'])
  expect(waitingOn(bills, ticked('ada:fund:joint'))).toEqual(['ben:fund:joint'])
  // A tick at another amount still says the money was sent.
  expect(waitingOn(bills, ticked('ada:fund:joint', 'ben:fund:joint'))).toEqual([])
})

it('keeps a month ticked under the per-person steps on them (P5), and starts every other month on the household ones', () => {
  const document = audit4()
  expect(paydayLayout(document, '2026-11')).toBe('household')
  // A tick on a fund step or a personal pot move is the same in both layouts, so it doesn't decide.
  expect(paydayLayout({ ...document, ticks: { '2026-11': ticked('ada:fund:joint', 'ada:move:ada-spend') } }, '2026-11')).toBe('household')
  expect(paydayLayout({ ...document, ticks: { '2026-11': ticked('household:move:bills') } }, '2026-11')).toBe('household')
  // A person's own move into a joint pot only exists in the old steps.
  const old = { ...document, ticks: { '2026-11': ticked('ada:fund:joint', 'ben:move:groceries') } }
  expect(paydayLayout(old, '2026-11')).toBe('per-person')
  expect(paydayLayout(old, '2026-12')).toBe('household')
  const november = payday(old, '2026-11')
  expect(november.layout).toBe('per-person')
  expect(november.household).toEqual([])
  expect(steps(november).filter(([key]) => String(key).endsWith(':move:groceries')).map(([key]) => key)).toEqual(['ada:move:groceries', 'ben:move:groceries'])
  // Nothing is netted in the old steps either.
  expect(november.people.flatMap(plan => plan.rows).some(row => row.net)).toBe(false)
})

it('changes nothing for one adult', () => {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'solo', name: 'Sam' }] }
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'current', name: 'Current', provider: 'Monzo', ownerPersonIds: ['solo'] }]
  document.budget.pots = [{ id: 'bills', name: 'Bills', accountId: 'current' }]
  document.budget.incomeSources = [{ id: 'pay', personId: 'solo', name: 'Pay', type: 'employment', baseAmountPence: 200000, changes: {} }]
  document.budget.snapshots['2026-10'] = { items: [{ id: 'b', name: 'Rent', categoryId: 'c', entryAmountPence: 90000, amountPence: 90000, frequency: 'monthly', destination: { kind: 'pot', potId: 'bills' }, funding: 'proportional' }] }
  const ids = ['solo'], month = '2026-12', instructions = buildTransferInstructions(document, month)
  const old = personTransferPlans(budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items).accounts, instructions, ids)
  const now = payday(document)
  expect(now.household).toEqual([])
  expect(now.people.map(planSteps)).toEqual(old.people.map(planSteps))
})

it('withholds a joint account’s household moves while it needs review', () => {
  const document = audit4()
  for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items.push({ id: 'x', name: 'Unknown', categoryId: snapshot.items[0]!.categoryId, entryAmountPence: 1000, amountPence: 1000, frequency: 'monthly', destination: { kind: 'pot', potId: 'groceries' }, funding: 'single' })
  const plans = payday(document)
  expect(plans.needsReview.map(row => row.accountId)).toEqual(['joint'])
  expect(plans.household.map(row => row.accountId)).toEqual(['saving'])
})
