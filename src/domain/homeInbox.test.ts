import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { homeCount, homeInbox } from './homeInbox'
import { resolveBudget } from './monthlyBudget'
import { orderTransferAccounts, personTransferPlans } from './personTransfers'
import { buildTransferInstructions } from './transferInstructions'
import { planSteps } from './transferTicks'

const month = '2026-11'
const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
/** Pots by name, as the pages name them (the domain doesn't). */
const potName = (document: BudgetDocument) => (destination: { kind: string; potId?: string }) => destination.kind === 'pot' ? document.budget.pots.find(pot => pot.id === destination.potId)?.name ?? 'Pot' : 'Account'
const inbox = (document: BudgetDocument, today = '2026-11-11', forMonth = month) => homeInbox(document, { month: forMonth, today, nameDestination: potName(document) })
const titles = (rows: Array<{ title: string }>) => rows.map(row => row.title)

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  document.workflow.setupComplete = true
  document.budget.categories = [{ id: 'bills', name: 'Bills' }, { id: 'gifts', name: 'Gifts' }]
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['nick', 'immy'] },
    { id: 'immy-own', name: 'Current', provider: 'Monzo', ownerPersonIds: ['immy'] },
  ]
  document.budget.pots = [{ id: 'bills-pot', name: 'Bills', accountId: 'joint' }]
  document.budget.incomeSources = [
    { id: 'n', personId: 'nick', name: 'Job', type: 'employment', baseAmountPence: 300000, changes: {} },
    { id: 'i', personId: 'immy', name: 'Job', type: 'employment', baseAmountPence: 100000, changes: {} },
  ]
  const rent = { id: 'rent', name: 'Rent', categoryId: 'bills', destination: { kind: 'pot' as const, potId: 'bills-pot' }, entryAmountPence: 200000, amountPence: 200000, frequency: 'monthly' as const, funding: 'proportional' as const }
  document.budget.snapshots[month] = { items: [rent, { id: 'gifts', name: 'Christmas presents', categoryId: 'gifts', destination: { kind: 'account', accountId: 'immy-own' }, entryAmountPence: 60000, amountPence: 60000, frequency: 'monthly', funding: 'single', singleFunderId: 'immy' }] }
  return document
}

/** Tick every payday step of a month, as Month would. */
function tickAll(document: BudgetDocument, forMonth = month): BudgetDocument {
  const ids = document.household.adults.map(person => person.id)
  const transfers = budgetTransfers(document.budget, ids, forMonth, resolveBudget(document.budget, forMonth).items)
  const plans = personTransferPlans(orderTransferAccounts(transfers.accounts, buildTransferInstructions(document, forMonth), document.budget.accounts, ids, new Map()), buildTransferInstructions(document, forMonth), ids)
  const steps = Object.fromEntries(plans.people.flatMap(planSteps).map(step => [step.key, { amountPence: step.amountPence, at: '2026-11-02T09:00:00Z' }]))
  return { ...document, ticks: { ...document.ticks, [forMonth]: steps } }
}

/** One card with an October statement that has closed but has no final export yet. */
function withCard(): BudgetDocument {
  const document = household()
  document.budget.incomeSources[0]!.payday = { day: 28, ifNotWorkingDay: 'next' }
  document.budget.incomeSources[1]!.payday = { day: 28, ifNotWorkingDay: 'previous' }
  const line = (pence: number) => ({ lines: [{ amountPence: pence, destination: { kind: 'pot' as const, potId: 'bills-pot' } }], by: 'person' as const, at: 'x' })
  const tx = (id: string, date: string, pence: number, statementKey: string) => ({ id, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence: pence, kind: 'purchase' as const, cardSuffix: '41001', statementKey, importedAt: 'x', sort: line(pence) })
  document.card = {
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    transactions: [tx('a', '2026-10-10', 5000, 'amex:2026-10-24'), tx('b', '2026-11-04', 21250, 'amex:2026-11-24')],
    rules: [], statements: {}, months: {}, pots: {},
    imports: [{ at: '2026-11-09T19:30:00.000Z', cardId: 'amex', fileName: 'a.xlsx', statementKey: 'amex:2026-11-24', rows: 2, added: 2, skipped: 0, sortedByRules: 0, latestDate: '2026-11-04', matchesSummary: true }],
  }
  return document
}

describe('homeInbox on the seed (Wed 11 Nov)', () => {
  const result = inbox(seed())
  it('builds the strip: Plan over in red, Spent with the worst pot, and the open Amex statement', () => {
    expect(result.strip.plan).toEqual({ value: '£1,141.87 over', tone: 'critical', detail: 'Ada £429.66 over · Ben £712.21 over' })
    expect(result.strip.spent).toMatchObject({ value: '£272.59', sub: 'of £5,262.33', detailTone: 'warning' })
    expect(result.strip.spent!.detail).toMatch(/^Groceries .*£62 ahead of pace$/)
    expect(result.strip.card).toEqual({ name: 'Amex', value: '£649.23', sub: 'this statement', detail: '£312.85 set aside · closes Tue 24 Nov' })
    expect(result.stage).toBe('In progress · 19 days left')
  })
  it('lists seven rows in order: settle, close, fund, sort, set aside, over plan, then the pace heads-up', () => {
    expect(result.todo.map(row => [row.kind, row.title, row.meta, row.trailing ?? row.chip, row.trailingMeta])).toEqual([
      ['settle', 'Settle the October statement', 'All 12 sorted · matches Amex’s summary', '£646.88', 'due Wed 18 Nov'],
      ['close', 'Close October', 'Groceries £88.58 over · 3 pots with money left', 'Ended 31 Oct', undefined],
      ['fund', 'Fund November', 'Ada 0 of 9 · Ben 0 of 9', '18 steps', undefined],
      ['sort', 'Sort 4 Amex transactions', 'Brought in Mon 9 Nov', '£195.79', undefined],
      ['set-aside', 'Set aside in the Amex pot', '3 transactions sorted since the last move', '£140.59', undefined],
      ['over-plan', 'Bring the plan back to Available', 'Ada £429.66 over · Ben £712.21 over', '£1,141.87 over', undefined],
    ])
    expect(result.todo.find(row => row.kind === 'over-plan')).toMatchObject({ tone: 'critical', target: { view: 'plan', reviewPersonId: 'ben' } })
    expect(result.todo.filter(row => row.tone === 'critical')).toHaveLength(1)
    expect(titles(result.headsUp)).toEqual([expect.stringMatching(/^Groceries .*is £62 ahead of pace$/)])
    expect(result.headsUp[0]).toMatchObject({ meta: 'At this rate it runs out around Fri 20 Nov', trailing: '£143.57 left', tone: 'warning' })
    expect(homeCount(result)).toBe(7)
  })
  it('opens each row in the right place', () => {
    const target = (kind: string) => result.todo.find(row => row.kind === kind)!.target
    expect(target('settle')).toEqual({ view: 'spending', section: 'statements', statementKey: 'amex:2026-10-24' })
    expect(target('close')).toEqual({ view: 'month', month: '2026-10', close: true })
    expect(target('fund')).toEqual({ view: 'month', month: '2026-11' })
    expect(target('sort')).toEqual({ view: 'spending', section: 'sort' })
    expect(result.headsUp[0]!.target).toMatchObject({ view: 'month', month: '2026-11', potId: expect.any(String) })
  })
  it('keeps the open November statement out of To do and puts its dates in Coming up, with paydays', () => {
    expect(result.todo.some(row => row.title.includes('November statement'))).toBe(false)
    expect(result.comingUp.map(row => [row.date, row.title, row.meta])).toEqual([
      ['2026-11-24', 'November statement closes', '£649.23 so far'],
      ['2026-11-27', 'Ada’s pay arrives', 'December’s money'],
      ['2026-11-30', 'Ben’s pay arrives', 'December’s money'],
      ['2026-12-19', 'November statement due', undefined],
      ['2026-12-24', 'Ada’s pay arrives', 'January’s money'],
    ])
    expect(titles(result.done)).toEqual(['All October transactions sorted'])
  })
  it('asks to bring in once the last import is 3 days old, and flags a statement closing tomorrow', () => {
    expect(titles(inbox(seed(), '2026-11-14').todo)).toContain('Bring in Amex transactions')
    expect(inbox(seed(), '2026-11-14').todo.find(row => row.kind === 'bring-in')).toMatchObject({ meta: 'Last done Mon 9 Nov', target: { view: 'spending', section: 'sort', bringIn: true } })
    expect(inbox(seed(), '2026-11-23').comingUp[0]).toMatchObject({ title: 'November statement closes', meta: expect.stringMatching(/^Tomorrow · £[\d,.]+ so far$/) })
  })
})

describe('homeInbox task kinds', () => {
  it('asks for the final export of a closed statement, and waits to settle it', () => {
    const result = inbox(withCard(), '2026-11-12')
    expect(result.todo.find(row => row.kind === 'final-export')).toMatchObject({ title: 'Bring in the final October export', trailingMeta: 'due Wed 18 Nov', target: { view: 'spending', section: 'statements', statementKey: 'amex:2026-10-24' } })
    expect(result.todo.some(row => row.kind === 'settle')).toBe(false)
    expect(result.todo.find(row => row.kind === 'close')).toMatchObject({ title: 'Close October' })
  })

  it('shows Fund for next month once its steps have started, and moves it to Done when all are ticked', () => {
    const started = tickAll(withCard(), '2026-12')
    const key = Object.keys(started.ticks!['2026-12']!)[0]!
    const partly = { ...started, ticks: { ...started.ticks, '2026-12': { [key]: started.ticks!['2026-12']![key]! } } }
    expect(titles(inbox(partly, '2026-11-12').todo)).toContain('Fund December')
    expect(titles(inbox(withCard(), '2026-11-12').todo)).not.toContain('Fund December')
    // Within a week of December's money arriving (Fri 27 Nov), it joins To do anyway.
    expect(titles(inbox(withCard(), '2026-11-21').todo)).toContain('Fund December')
    expect(titles(inbox(started, '2026-11-12').done)).toContain('December funded')
  })

  it('counts steps changed since ticked', () => {
    const done = tickAll(household())
    const changed = structuredClone(done)
    const key = Object.keys(changed.ticks![month]!).find(step => step.startsWith('nick:fund'))!
    changed.ticks![month]![key]!.amountPence -= 5000
    const fund = inbox(changed).todo.find(row => row.kind === 'fund')!
    expect(fund.note).toBe('1 changed since ticked')
    expect(fund.progress!.map(row => [row.name, row.done, row.total])).toEqual([['Nick', 1, 2], ['Immy', 3, 3]])
    expect(titles(inbox(done).done)).toEqual(['November funded'])
  })

  it('says who is over the plan even when the household isn’t', () => {
    const over = inbox(household()).todo.find(row => row.kind === 'over-plan')!
    expect(over).toMatchObject({ meta: 'Immy £100.00 over', trailing: '£100.00 over', tone: 'critical', target: { view: 'plan', reviewPersonId: 'immy' } })
  })

  it('flags accounts that need review', () => {
    const document = household()
    document.budget.accounts[0]!.ownerPersonIds = []
    const review = inbox(document).todo.find(row => row.kind === 'review-accounts')
    expect(review).toMatchObject({ title: '1 account needs review' })
  })

  it('says a pot is over as a heads-up', () => {
    const document = withCard()
    document.card!.transactions.push({ ...document.card!.transactions[1]!, id: 'c', amountPence: 400000, sort: { lines: [{ amountPence: 400000, destination: { kind: 'pot', potId: 'bills-pot' } }], by: 'person', at: 'x' } })
    const pace = inbox(document, '2026-11-12').headsUp[0]!
    expect(pace).toMatchObject({ kind: 'pace', title: expect.stringMatching(/^Bills .*is £[\d,.]+ over$/), meta: 'Covered when November closes' })
  })

  it('has nothing to do once everything is done, and says what comes next', () => {
    const document = household()
    document.budget.snapshots[month]!.items.pop()
    const result = inbox(tickAll(document))
    expect(result.todo).toEqual([])
    expect(homeCount(result)).toBe(0)
  })

  it('starts a first run with Plan November, and no claim that anything fits', () => {
    const document = household()
    document.budget.snapshots = {}
    const result = inbox(document)
    expect(result.firstRun).toBe(true)
    expect(result.strip).toEqual({ plan: { value: 'Nothing planned for November yet' } })
    expect(result.todo.map(row => [row.title, row.target])).toEqual([['Plan November', { view: 'plan' }]])
  })

  it('mentions next month’s budget only when it changes', () => {
    const document = seed()
    expect(inbox(document, '2026-11-20').comingUp.some(row => row.title.startsWith('December budget'))).toBe(false)
    document.budget.snapshots['2026-12'] = { items: [...resolveBudget(document.budget, month).items, { ...resolveBudget(document.budget, month).items[0]!, id: 'new-item', name: 'Gym' }] }
    expect(inbox(document, '2026-11-20').comingUp.find(row => row.title === 'December budget: new items')).toMatchObject({ date: '2026-12-01', meta: 'Gym' })
  })
})
