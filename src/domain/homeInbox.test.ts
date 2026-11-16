import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { budgetTransfers } from './budgetTransfers'
import { homeCount, homeInbox } from './homeInbox'
import { monthSpending } from './cardSpending'
import { paceHeadline } from '../formatting/paceLabels'
import { resolveBudget } from './monthlyBudget'
import { orderTransferAccounts, paydayPlans, personTransferPlans } from './personTransfers'
import { buildTransferInstructions } from './transferInstructions'
import { paydaySteps, planSteps } from './transferTicks'

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

describe('the Amex pot’s check on Home', () => {
  // The seed's Amex pot holds what's moved in (£312.85); a check on 10 Nov says otherwise.
  const checked = (pence: number) => { const document = seed(); document.card!.pots['amex-pot'] = { checkedBalance: { pence, at: '2026-11-10T09:00:00.000Z' } }; return document }
  const row = (document: BudgetDocument) => inbox(document).todo.find(item => item.key === 'gap:amex')
  it('asks for the extra to move to the buffer', () => {
    expect(row(checked(31285 + 580))).toMatchObject({ kind: 'set-aside', tone: 'warning', title: 'Move extra out of the Amex pot', meta: 'To Account · checked Tue 10 Nov', trailing: '£5.80', target: { view: 'month', month: '2026-11', potId: 'amex-pot' } })
  })
  it('says when the pot is short', () => {
    expect(row(checked(31285 - 920))).toMatchObject({ title: 'The Amex pot is short', meta: 'Less than its bills need · checked Tue 10 Nov', trailing: '£9.20' })
  })
  it('has nothing to say when it matches', () => {
    expect(row(checked(31285))).toBeUndefined()
  })
})

describe('homeInbox on the seed (Wed 11 Nov)', () => {
  const result = inbox(seed())
  it('builds the strip: Plan over in red, Spent with the worst pot, and the open Amex statement', () => {
    expect(result.strip.plan).toEqual({ value: '£1,141.87 over', tone: 'critical', detail: 'Ada £429.66 over · Ben £712.21 over' })
    // Tracked pots only (D4): the card spend of £272.59 less £90.69 on Funded only and Saving pots. The Bills pot's
    // assumed bills (£234.82) are Carries over, so they're not part of it.
    expect(result.strip.spent).toMatchObject({ value: '£181.90', sub: 'of £1,911.83', detailTone: 'warning' })
    expect(result.strip.spent!.detail).toMatch(/^Groceries .*£63 ahead of pace$/)
    // The bill (D1), named by its month: the open one, while no older bill is unpaid.
    expect(result.strip.card).toEqual({ name: 'Amex', value: '£649.23', sub: 'November bill so far', detail: '£312.85 in the Amex pot · closes Tue 24 Nov' })
    expect(result.stage).toBe('In progress · 19 days left')
  })
  it('keeps the oldest unpaid bill on Home once it closes, with its due date (D1)', () => {
    const card = inbox(seed(), '2026-11-26', '2026-11').strip.card!
    expect(card).toMatchObject({ value: '£649.23', sub: 'November bill' })
    expect(card.detail).toMatch(/^£312\.85 in the Amex pot · due /)
  })
  it('says unassigned, not left, when the plan is under Available (D5)', () => {
    const document = seed()
    document.household.adults.forEach(person => { const source = document.budget.incomeSources.find(row => row.personId === person.id)!; source.baseAmountPence += 200000; source.changes = {} })
    const plan = inbox(document).strip.plan
    expect(plan.value).toMatch(/^£[\d,.]+ unassigned$/)
    expect(plan.detail).toMatch(/unassigned/)
    expect(`${plan.value} ${plan.detail}`).not.toMatch(/\bleft\b/)
  })
  it('lists eight rows in order: settle, close, fund, sort, set aside, a renewal, over plan, then the pace heads-up', () => {
    expect(result.todo.map(row => [row.kind, row.title, row.meta, row.trailing ?? row.chip, row.trailingMeta])).toEqual([
      ['settle', 'Settle the October statement', 'All 12 sorted · matches Amex’s summary', '£646.88', 'due Wed 18 Nov'],
      ['close', 'Close October', 'Groceries £88.58 over · 1 pot with money left', 'Ended 31 Oct', undefined],
      ['fund', 'Fund November', 'Ada 0 of 5 · Ben 0 of 5 · Either of you 0 of 4', '14 steps', undefined],
      ['sort', 'Sort 4 Amex transactions', 'Brought in Mon 9 Nov', '£195.79', undefined],
      ['set-aside', 'Set aside in the Amex pot', '3 transactions sorted since the last move', '£140.59', undefined],
      ['renewal', 'Breakdown cover renews 6 Dec', 'In 3 weeks · £1,395.60 a year · Card · Amex', undefined, undefined],
      ['over-plan', 'Bring the plan back to Available', 'Ada £429.66 over · Ben £712.21 over', '£1,141.87 over', undefined],
    ])
    expect(result.todo.find(row => row.kind === 'over-plan')).toMatchObject({ tone: 'critical', target: { view: 'plan', reviewPersonId: 'ben' } })
    expect(result.todo.filter(row => row.tone === 'critical')).toHaveLength(1)
    expect(titles(result.headsUp)).toEqual([expect.stringMatching(/^Groceries .*£63 ahead of pace$/)])
    expect(result.headsUp[0]).toMatchObject({ meta: 'Mostly Green Grocer £107.00 · runs out ~Fri 20 Nov', trailing: '£143.57 left', tone: 'warning' })
    expect(homeCount(result)).toBe(8)
  })
  it('opens each row in the right place', () => {
    const target = (kind: string) => result.todo.find(row => row.kind === kind)!.target
    expect(target('settle')).toEqual({ view: 'spending', section: 'statements', statementKey: 'amex:2026-10-24' })
    expect(target('close')).toEqual({ view: 'month', month: '2026-10', close: true })
    expect(target('fund')).toEqual({ view: 'month', month: '2026-11' })
    expect(target('sort')).toEqual({ view: 'spending', section: 'sort' })
    expect(target('renewal')).toEqual({ view: 'renewal', itemId: expect.any(String), date: '2026-12-06' })
    expect(result.headsUp[0]!.target).toMatchObject({ view: 'month', month: '2026-11', potId: expect.any(String) })
  })
  it('keeps the open November statement out of To do and puts its dates in Coming up, with paydays and the week’s bills', () => {
    expect(result.todo.some(row => row.title.includes('November statement'))).toBe(false)
    expect(result.comingUp.map(row => [row.date, row.title, row.meta])).toEqual([
      ['2026-11-18', 'Electricity · £66.39', 'Direct debit · Bills'],
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
    expect(pace).toMatchObject({ kind: 'pace', title: expect.stringMatching(/^Bills.* £[\d,.]+ over$/), meta: 'Mostly Shop £4,212.50 · covered when November closes' })
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

describe('homeInbox renewals and bills', () => {
  const breakdown = (document: BudgetDocument) => resolveBudget(document.budget, month).items.find(item => item.name === 'Breakdown cover')!.id
  const renewals = (document: BudgetDocument, today: string) => inbox(document, today, today.slice(0, 7)).todo.filter(row => row.kind === 'renewal')

  it('asks once the reminder starts, and keeps asking after the date until answered', () => {
    expect(renewals(seed(), '2026-11-07')).toEqual([])
    expect(renewals(seed(), '2026-12-05')[0]).toMatchObject({ title: 'Breakdown cover renews 6 Dec', meta: 'Tomorrow · £1,395.60 a year · Card · Amex', due: '2026-12-06' })
    expect(renewals(seed(), '2026-12-10')[0]).toMatchObject({ title: 'Breakdown cover renewed 6 Dec', meta: '4 days ago · £1,395.60 a year · Card · Amex', tone: 'warning' })
  })

  it('moves an answered renewal to Done, and never asks with the reminder off', () => {
    const document = seed()
    const answered = { ...document, bills: { renewals: { [breakdown(document)]: '2026-12-06' } } }
    expect(renewals(answered, '2026-11-14')).toEqual([])
    expect(inbox(answered, '2026-11-14').done.find(row => row.kind === 'renewal')).toMatchObject({ title: 'Breakdown cover price checked', meta: 'Renews 6 Dec' })
    const off = { ...document, budget: { ...document.budget, snapshots: Object.fromEntries(Object.entries(document.budget.snapshots).map(([key, snapshot]) => [key, { ...snapshot, items: snapshot.items.map(item => item.bill?.month ? { ...item, bill: { ...item.bill, remindWeeks: 0 as const } } : item) }])) } }
    expect(renewals(off, '2026-11-14')).toEqual([])
  })

  it('lists the week’s bills in Coming up, but not a renewal already asking on To do', () => {
    const coming = (document: BudgetDocument) => inbox(document, '2026-11-30', '2026-11').comingUp.filter(row => row.key.startsWith('bill:'))
    expect(coming(seed()).map(row => [row.date, row.title, row.meta])).toEqual([
      ['2026-12-01', 'Council tax · £59.26', 'Direct debit · Bills'], ['2026-12-02', 'Streamflix · £73.52', 'Card · Amex · Bills'], ['2026-12-05', 'Water · £80.65', 'Direct debit · Bills'],
    ])
    expect(coming(seed())[0]!.target).toEqual({ view: 'month', month: '2026-12', potId: 'bills' })
    const document = seed()
    expect(coming({ ...document, bills: { renewals: { [breakdown(document)]: '2026-12-06' } } }).map(row => row.title)).toContain('Breakdown cover · £1,395.60')
  })
})

describe('homeInbox defects from audit 4', () => {
  it('lists a statement’s settle task once when two unsettled months have spend on it', () => {
    // The seed's November statement (25 Oct–24 Nov) holds late-October spend too. On 4 Dec, October (to settle) and
    // November (closing) both raise its settle task.
    const document = seed()
    document.card!.statements['amex:2026-11-24']!.finalImportAt = '2026-11-25T09:00:00.000Z'
    const result = inbox(document, '2026-12-04', '2026-12')
    expect(titles(result.todo).filter(title => title === 'Settle the November statement')).toHaveLength(1)
    const keys = [...result.todo, ...result.headsUp, ...result.done].map(row => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('words a pace gap as Month does: whole pounds rounded, not cut off', () => {
    const document = seed()
    const row = monthSpending(document, month, '2026-11-11').rows.find(each => each.status === 'ahead')!
    const headline = paceHeadline(row)
    const result = inbox(document)
    expect(result.strip.spent!.detail).toBe(`Groceries ${headline} of pace`)
    expect(titles(result.headsUp)).toEqual([`Groceries ${headline} of pace`])
  })
})

describe('the payday card (month-health PR 2, D10)', () => {
  /** Audit 4's household: Ada £4,200 (pay on Fri 27 Nov) and Ben £3,500 (Mon 30 Nov). */
  function audit4() {
    const document = seed()
    for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000; source.landsInAccountId = source.personId }
    return document
  }
  const decemberTicks = (document: BudgetDocument, keep?: (key: string) => boolean) => {
    const ids = document.household.adults.map(person => person.id), instructions = buildTransferInstructions(document, '2026-12')
    const plans = paydayPlans(document, '2026-12', orderTransferAccounts(budgetTransfers(document.budget, ids, '2026-12', resolveBudget(document.budget, '2026-12').items).accounts, instructions, document.budget.accounts, ids, new Map()), instructions)
    return Object.fromEntries(paydaySteps(plans).filter(step => !keep || keep(step.key)).map(step => [step.key, { amountPence: step.amountPence, at: '2026-11-28T09:00:00Z' }]))
  }

  it('leads Home from the first payday to the 1st, standing in for December’s Fund row', () => {
    const document = audit4()
    const result = inbox(document, '2026-11-27')
    expect(result.payday).toMatchObject({ month: '2026-12', totalPence: 770000, done: 0, total: 11, changed: 0, target: { view: 'month', month: '2026-12' } })
    expect(result.payday!.progress.map(row => `${row.name} ${row.done} of ${row.total}`)).toEqual(['Ada 0 of 4', 'Ben 0 of 3', 'Either of you 0 of 4'])
    expect(result.payday!.landed).toMatch(/^£7,700\.00 in all · Ada’s £4,200\.00 landed Fri 27 Nov · Ben’s £3,500\.00 lands /)
    expect(titles(result.todo)).not.toContain('Fund December')
    // The card counts as one thing to do.
    expect(homeCount(result)).toBe(result.todo.length + result.headsUp.length + 1)
  })

  it('shows what has landed on the Fund row before the first payday', () => {
    const result = inbox(audit4(), '2026-11-20')
    expect(result.payday).toBeUndefined()
    const fund = result.todo.find(task => task.key === 'fund:2026-12')!
    expect(fund.landed).toMatch(/^£7,700\.00 in all · Ada’s £4,200\.00 lands Fri 27 Nov · Ben’s £3,500\.00 lands /)
    expect(fund.progress!.map(row => row.name)).toEqual(['Ada', 'Ben', 'Either of you'])
  })

  it('counts every tick, including the household’s, and keeps leading until the last one', () => {
    const document = audit4()
    document.ticks = { '2026-12': decemberTicks(document, key => key !== 'household:move:bills') }
    expect(inbox(document, '2026-11-29').payday).toMatchObject({ done: 10, total: 11 })
    document.ticks = { '2026-12': decemberTicks(document) }
    expect(inbox(document, '2026-11-29').payday).toBeUndefined()
  })

  it('stops leading on the 1st, when December is the month Home is on, and for any other month', () => {
    const document = audit4()
    expect(inbox(document, '2026-12-01', '2026-12').payday).toBeUndefined()
    expect(inbox(document, '2026-11-27', '2026-10').payday).toBeUndefined()
  })
})
