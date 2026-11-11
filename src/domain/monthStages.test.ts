import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { setSettleTick, settleSteps, allSettleSteps, settleWithoutFinal } from './cardStatements'
import { builtUp, closeMonth, closeMonthPlan, coverStepStatus, keepBuiltUp, markAllIn, monthStage, moveBuiltUp, paydayProgress, setCover, setCoverTick } from './monthStages'
import { buildTransferInstructions } from './transferInstructions'
import { budgetTransfers } from './budgetTransfers'
import { orderTransferAccounts, personTransferPlans } from './personTransfers'
import { planSteps } from './transferTicks'
import { resolveBudget, type BudgetDestination } from './monthlyBudget'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
let next = 0
const tx = (date: string, destination: BudgetDestination | null, amountPence: number, statementKey = 'amex:2026-10-24'): CardTransaction => ({
  id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey, importedAt: 'x',
  ...destination ? { sort: { lines: [{ amountPence, destination }], by: 'person' as const, at: 'x' } } : {},
})
const now = new Date('2026-11-04T09:00:00Z')

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'car', name: 'Car', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }, { id: 'buffer', name: 'Buffer', accountId: 'joint' }]
  document.budget.incomeSources = [{ id: 'a', personId: 'ada', name: 'Pay', type: 'employment', baseAmountPence: 300000, changes: {} }, { id: 'b', personId: 'ben', name: 'Pay', type: 'employment', baseAmountPence: 200000, changes: {} }]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'proportional' as const })
  document.budget.snapshots['2026-10'] = { items: [item('g', 'groceries', 52000), item('e', 'eating', 15000), item('c', 'car', 8000), item('b', 'bills', 15000)] }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    pots: { bills: { carriesOver: true } },
    transactions: [tx('2026-10-05', pot('groceries'), 51180), tx('2026-10-10', pot('eating'), 18500), tx('2026-10-12', pot('car'), 3500), tx('2026-10-28', pot('bills'), 4000, 'amex:2026-11-24')],
    imports: [{ at: '2026-11-04T08:00:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 1, added: 1, skipped: 0, sortedByRules: 0, latestDate: '2026-10-28', matchesSummary: true }],
  }
  return document
}

function tickPayday(document: BudgetDocument, month: string, count = Infinity): BudgetDocument {
  const ids = document.household.adults.map(person => person.id)
  const instructions = buildTransferInstructions(document, month)
  const plans = personTransferPlans(orderTransferAccounts(budgetTransfers(document.budget, ids, month, resolveBudget(document.budget, month).items).accounts, instructions, document.budget.accounts, ids, new Map()), instructions, ids)
  const steps = plans.people.flatMap(planSteps).slice(0, count)
  return { ...document, ticks: { ...document.ticks, [month]: Object.fromEntries(steps.map(step => [step.key, { amountPence: step.amountPence, at: 'x' }])) } }
}

describe('month stages', () => {
  it('goes upcoming → funding → funded before the month, then in progress, closing, to settle and settled', () => {
    let document = household()
    expect(paydayProgress(document, '2026-12')).toMatchObject({ total: 10, done: 0 })
    expect(monthStage(document, '2026-12', '2026-11-20').stage).toBe('upcoming')
    expect(monthStage(tickPayday(document, '2026-12', 2), '2026-12', '2026-11-28')).toMatchObject({ stage: 'funding', funding: { done: 2, total: 10 } })
    expect(monthStage(tickPayday(document, '2026-12'), '2026-12', '2026-11-28').stage).toBe('funded')
    expect(monthStage(document, '2026-11', '2026-11-12').stage).toBe('in-progress')
    expect(monthStage(document, '2026-10', '2026-11-04')).toMatchObject({ stage: 'closing', statements: ['amex:2026-10-24', 'amex:2026-11-24'] })
    document = closeMonth(markAllIn(document, '2026-10', now), '2026-10', '2026-11-04', now)
    expect(monthStage(document, '2026-10', '2026-11-04')).toMatchObject({ stage: 'to-settle', unsettled: ['amex:2026-10-24', 'amex:2026-11-24'] })
    for (const key of ['amex:2026-10-24', 'amex:2026-11-24']) {
      document = settleWithoutFinal(document, key, now)
      for (const step of allSettleSteps(settleSteps(document, key)!)) document = setSettleTick(document, key, step.key, step.amountPence, now)
    }
    expect(monthStage(document, '2026-10', '2026-11-26')).toMatchObject({ stage: 'settled', unsettled: [] })
  })
})

describe('closing a month', () => {
  it('waits for every transaction to be sorted and the last postings, unless all are said to be in', () => {
    const document = household()
    document.card!.imports[0]!.at = '2026-11-02T08:00:00.000Z'
    expect(closeMonthPlan(document, '2026-10', '2026-11-02')!.readiness).toMatchObject({ toSort: 0, postingsIn: false, canClose: false })
    expect(closeMonthPlan(markAllIn(document, '2026-10', now), '2026-10', '2026-11-02')!.readiness).toMatchObject({ allIn: true, canClose: true })
    document.card!.imports[0]!.at = '2026-11-03T08:00:00.000Z'
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.readiness.canClose).toBe(true)
    document.card!.transactions.push(tx('2026-10-30', null, 100))
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.readiness).toMatchObject({ toSort: 1, canClose: false })
    expect(closeMonthPlan(document, '2026-11', '2026-11-20')!.readiness.canClose).toBe(false)
  })

  it('covers an overspend from the buffer by default, or another pot with money left, or next month', () => {
    let document = household()
    const plan = closeMonthPlan(document, '2026-10', '2026-11-04')!
    expect(plan.overspends).toHaveLength(1)
    expect(plan.overspends[0]).toMatchObject({ potId: 'eating', overPence: 3500, cover: { potId: 'eating', amountPence: 3500, source: { kind: 'account', accountId: 'joint' } }, stepKey: 'cover:eating' })
    expect(plan.overspends[0]!.options).toEqual([
      { source: { kind: 'account', accountId: 'joint' } },
      { source: pot('car'), leftPence: 4500 },
      { source: pot('groceries'), leftPence: 820 },
      { source: { kind: 'next-month' } },
    ])
    document = setCover(document, '2026-10', { potId: 'eating', amountPence: 3500, source: pot('car') })
    const fromCar = closeMonthPlan(document, '2026-10', '2026-11-04')!
    expect(fromCar.overspends[0]!.cover.source).toEqual(pot('car'))
    expect(fromCar.leftovers.find(row => row.potId === 'car')!.leftPence).toBe(1000)
    // Ticking the step, then choosing another source, drops the tick.
    document = setCoverTick(document, '2026-10', 'eating', 3500, now)
    expect(coverStepStatus(document.card!.months['2026-10'], fromCar.overspends[0]!).state).toBe('done')
    document = setCover(document, '2026-10', { potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } })
    expect(document.card!.months['2026-10']!.coverTicks).toBeUndefined()
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('records covers, leftovers and what was spent, and shows changes after closing', () => {
    let document = household()
    document = closeMonth(document, '2026-10', '2026-11-04', now)
    const record = document.card!.months['2026-10']!
    expect(record).toMatchObject({ closedAt: '2026-11-04T09:00:00.000Z', covers: [{ potId: 'eating', amountPence: 3500, source: { kind: 'account', accountId: 'joint' } }], leftovers: { groceries: 820, car: 4500 } })
    expect(record.closedSpent).toEqual({ 'pot:groceries': 51180, 'pot:eating': 18500, 'pot:car': 3500, 'pot:bills': 4000 })
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.changedSinceClosed).toEqual([])
    document.card!.transactions.push(tx('2026-10-31', pot('groceries'), 500))
    expect(closeMonthPlan(document, '2026-10', '2026-11-06')!.changedSinceClosed).toEqual([{ key: 'pot:groceries', destination: pot('groceries'), closedPence: 51180, nowPence: 51680 }])
    document = closeMonth(document, '2026-10', '2026-11-06', now)
    expect(document.card!.months['2026-10']!.leftovers).toEqual({ groceries: 320, car: 4500 })
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('next month’s cover moves no money and takes from next month’s pot', () => {
    let document = setCover(household(), '2026-10', { potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } })
    document = closeMonth(document, '2026-10', '2026-11-04', now)
    expect(closeMonthPlan(document, '2026-11', '2026-11-12')!.figures.rows.find(row => row.key === 'pot:eating')).toMatchObject({ takenPence: 3500, leftPence: 11500 })
  })

  it('flags a pot that has built up more than its limit, until it’s moved or kept', () => {
    let document = household()
    document.card!.months = { '2026-07': { closedAt: 'x', leftovers: { car: 4500 } }, '2026-08': { closedAt: 'x', leftovers: { car: 4500 } }, '2026-09': { closedAt: 'x', leftovers: { car: 4500 } } }
    expect(builtUp(document.card!, 'car')).toBe(13500)
    const flagged = closeMonthPlan(document, '2026-10', '2026-11-04')!.leftovers.find(row => row.potId === 'car')!
    expect(flagged).toEqual({ potId: 'car', leftPence: 4500, plannedPence: 8000, builtUpPence: 18000, flag: { limitPence: 16000, movePence: 10000 } })
    expect(closeMonthPlan(keepBuiltUp(document, 'car', 18000), '2026-10', '2026-11-04')!.leftovers.find(row => row.potId === 'car')!.flag).toBeUndefined()
    document = moveBuiltUp(document, 'car', 10000, now)
    expect(builtUp(document.card!, 'car')).toBe(3500)
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.leftovers.find(row => row.potId === 'car')!).toMatchObject({ builtUpPence: 8000 })
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.leftovers.find(row => row.potId === 'car')!.flag).toBeUndefined()
    document.card!.pots.car = { ...document.card!.pots.car, buildUpLimit: 0.5 }
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.leftovers.find(row => row.potId === 'car')!.flag).toEqual({ limitPence: 4000, movePence: 0 })
  })

  it('lists carry-over pots with what’s free', () => {
    const plan = closeMonthPlan(household(), '2026-10', '2026-11-04')!
    expect(plan.carryOver).toEqual([{ potId: 'bills' }])
    const document = household()
    document.card!.transactions.push(tx('2026-10-02', pot('bills'), 1999))
    document.card!.pots.bills = { carriesOver: true, checkedBalance: { pence: 100000, at: '2026-11-01T00:00:00Z' } }
    expect(closeMonthPlan(document, '2026-10', '2026-11-04')!.carryOver).toEqual([{ potId: 'bills', freePence: 100000 - 1999 - 4000, checkedAt: '2026-11-01T00:00:00Z' }])
  })
})

describe('Home month cards', () => {
  async function load() { return import('./monthStages') }

  it('shows the closing month’s checklist, the current month and next month with when its money arrives', async () => {
    const { homeMonths } = await load()
    const document = household()
    document.budget.incomeSources[0]!.payday = { day: 28, ifNotWorkingDay: 'previous' }
    document.budget.incomeSources[1]!.payday = { day: 28, ifNotWorkingDay: 'next' }
    const cards = homeMonths(document, '2026-11-12')
    expect(cards.map(card => `${card.role}:${card.month}`)).toEqual(['previous:2026-10', 'current:2026-11', 'next:2026-12'])
    const previous = cards[0] as Extract<typeof cards[number], { role: 'previous' }>
    expect(previous.tasks.map(task => [task.kind, task.done, task.statementKey ?? ''])).toEqual([['sorted', true, ''], ['close', false, ''], ['settle', false, 'amex:2026-10-24'], ['settle', false, 'amex:2026-11-24']])
    expect(previous.overspends).toBe(1)
    const current = cards[1] as Extract<typeof cards[number], { role: 'current' }>
    expect(current.status.stage).toBe('in-progress')
    // Last brought in 4 Nov, eight days ago; the October statement closed without its final export.
    expect(current.tasks.map(task => task.kind)).toEqual(['bring-in', 'final-export'])
    const next = cards[2] as Extract<typeof cards[number], { role: 'next' }>
    expect(next).toMatchObject({ arrives: ['2026-11-27', '2026-11-30'], early: false, tasks: [] })
  })

  it('asks for the final export after a statement closes, and warns the day before', async () => {
    const { homeMonths } = await load()
    const document = household()
    document.card!.imports[0]!.at = '2026-11-22T08:00:00.000Z'
    const before = homeMonths(document, '2026-11-23').find(card => card.role === 'current')!
    expect(before.role === 'current' && before.tasks.map(task => `${task.kind}:${task.statementKey ?? ''}`)).toEqual(['closes-soon:amex:2026-11-24', 'final-export:amex:2026-10-24'])
    const after = homeMonths(document, '2026-11-25').find(card => card.role === 'current')!
    expect(after.role === 'current' && after.tasks.map(task => `${task.kind}:${task.statementKey ?? ''}`)).toEqual(['bring-in:', 'final-export:amex:2026-10-24', 'final-export:amex:2026-11-24'])
  })

  it('shows next month’s funding once a step is ticked, and early pay', async () => {
    const { homeMonths } = await load()
    let document = household()
    document.budget.incomeSources[0]!.payday = { day: 28, ifNotWorkingDay: 'previous' }
    document = tickPayday(document, '2027-01', 2)
    document.ticks!['2027-01'] = Object.fromEntries(Object.entries(document.ticks!['2027-01']!).map(([key, tick]) => [key, { ...tick, at: '2026-12-18T10:00:00Z' }]))
    const next = homeMonths(document, '2026-12-18').find(card => card.role === 'next')!
    expect(next).toMatchObject({ month: '2027-01', arrives: ['2026-12-24'], early: true, tasks: [{ kind: 'transfers', done: false }] })
    expect(next.role === 'next' && next.status.stage).toBe('funding')
  })

  it('folds a settled month to one line until the month after it settles', async () => {
    const { homeMonths } = await load()
    let document = household()
    document.card!.transactions = document.card!.transactions.filter(row => row.statementKey === 'amex:2026-10-24')
    document = closeMonth(markAllIn(document, '2026-10', now), '2026-10', '2026-11-04', now)
    document = settleWithoutFinal(document, 'amex:2026-10-24', now)
    for (const step of allSettleSteps(settleSteps(document, 'amex:2026-10-24')!)) document = setSettleTick(document, 'amex:2026-10-24', step.key, step.amountPence, new Date('2026-11-23T09:00:00Z'))
    const cards = homeMonths(document, '2026-11-25')
    expect(cards[0]).toEqual({ role: 'settled', month: '2026-10', settledAt: '2026-11-23T09:00:00.000Z' })
    expect(homeMonths({ ...document, card: undefined }, '2026-11-25')).toEqual([])
  })
})
