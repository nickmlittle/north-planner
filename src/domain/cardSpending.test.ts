import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { cumulativeByDay, destinationTransactions, leftByDestination, monthSpending, paceIfPlaced, potSettings, savePotSettings } from './cardSpending'
import { impactText, impactTone, optionPaceText, tippedText } from '../formatting/paceLabels'
import { emptyCardTracker, type CardTransaction, type SplitLine } from './cardTracker'
import type { BudgetDestination } from './monthlyBudget'

const pot = (potId: string): BudgetDestination => ({ kind: 'pot', potId })
const joint: BudgetDestination = { kind: 'account', accountId: 'joint' }
let next = 0
const tx = (date: string, lines: Array<[BudgetDestination, number]> | null, overrides: Partial<CardTransaction> = {}): CardTransaction => {
  const amountPence = overrides.amountPence ?? (lines ?? []).reduce((sum, [, pence]) => sum + pence, 0)
  return {
    id: `t${next++}`, cardId: 'amex', date, description: 'SHOP', merchant: 'SHOP', amountPence, kind: amountPence < 0 ? 'refund' : 'purchase', cardSuffix: '41001', statementKey: 'amex:2026-11-24', importedAt: 'x',
    ...lines ? { sort: { lines: lines.map(([destination, pence]): SplitLine => ({ amountPence: pence, destination })), by: 'person' as const, at: 'x' } } : {}, ...overrides,
  }
}

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.categories = [{ id: 'c', name: 'Spending' }]
  document.budget.accounts = [
    { id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
    { id: 'ada-own', name: 'Ada', provider: 'Starling', ownerPersonIds: ['ada'] },
    { id: 'ben-own', name: 'Ben', provider: 'Nationwide', ownerPersonIds: ['ben'] },
    { id: 'saver', name: 'Saver', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'], accountTypeId: 'savings-account' },
  ]
  document.budget.pots = [
    { id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'eating', name: 'Eating out', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' },
    { id: 'treats', name: 'Treats', accountId: 'ada-own' }, { id: 'fuel', name: 'Fuel', accountId: 'ben-own' }, { id: 'rainy', name: 'Rainy day', accountId: 'saver' },
  ]
  const item = (id: string, potId: string, pence: number) => ({ id, name: id, categoryId: 'c', entryAmountPence: pence, amountPence: pence, frequency: 'monthly' as const, destination: pot(potId), funding: 'equal' as const })
  document.budget.snapshots['2026-10'] = { items: [item('g', 'groceries', 52000), item('e', 'eating', 15000), item('b', 'bills', 15000), item('t', 'treats', 20000), item('f', 'fuel', 12000), item('r', 'rainy', 50000)] }
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }],
    // Treats and Fuel sit in one person's account, so they'd default to Funded only; here they're chosen as Tracked.
    pots: { bills: { carriesOver: true }, treats: { kind: 'tracked' }, fuel: { kind: 'tracked', pace: 'none' } },
    transactions: [
      tx('2026-11-01', [[pot('groceries'), 7490]]), tx('2026-11-03', [[pot('groceries'), 8835]]), tx('2026-11-05', [[pot('groceries'), 4460]]), tx('2026-11-07', [[pot('groceries'), 4120]]),
      tx('2026-11-08', [[pot('groceries'), 2715]]), tx('2026-11-10', [[pot('groceries'), 6240]]),
      tx('2026-11-06', [[pot('eating'), 6400]]),
      // A split: part Treats, part one-offs on the joint account.
      tx('2026-11-04', [[pot('treats'), 21250], [joint, 11281]]),
      tx('2026-11-06', [[pot('fuel'), 5820]]), tx('2026-11-05', [[pot('bills'), 4197]]),
      tx('2026-10-31', [[pot('groceries'), 9999]]), tx('2026-12-01', [[pot('groceries'), 9999]]),
      tx('2026-11-09', null, { amountPence: 5000 }),
      tx('2026-11-08', null, { amountPence: -35000, kind: 'payment' }),
    ],
  }
  return document
}

describe('pot settings', () => {
  it('defaults to a steady pace, none for carry-over and savings pots, and a 2× build-up limit', () => {
    const document = household()
    expect(potSettings(document, 'groceries')).toEqual({ pace: 'steady', carriesOver: false, buildUpLimit: 2 })
    expect(potSettings(document, 'bills')).toEqual({ pace: 'none', carriesOver: true, buildUpLimit: 2 })
    expect(potSettings(document, 'rainy').pace).toBe('none')
    expect(potSettings(savePotSettings(document, 'groceries', { buildUpLimit: 3, pace: 'none' }), 'groceries')).toEqual({ pace: 'none', carriesOver: false, buildUpLimit: 3 })
    expect(potSettings(savePotSettings(newBudgetDocument(), 'x', { carriesOver: true }), 'x').carriesOver).toBe(true)
  })
})

describe('monthSpending', () => {
  it('works out planned, spent, left and pace on day 12 of November', () => {
    const month = monthSpending(household(), '2026-11', '2026-11-12')
    expect(month).toMatchObject({ when: 'current', day: 12, daysInMonth: 30, daysLeft: 18, needsCare: 2, sortedTo: '2026-12-01' })
    const row = (key: string) => month.rows.find(item => item.key === key)!
    expect(row('pot:groceries')).toMatchObject({ group: 'joint', plannedPence: 52000, spentPence: 33860, leftPence: 18140, status: 'ahead', expectedPence: 20800, aheadPence: 13060, runsOut: '2026-11-19', needsCare: true })
    // A little ahead but within the threshold: on track, though at this rate it would run out a day early.
    expect(row('pot:eating')).toMatchObject({ spentPence: 6400, leftPence: 8600, status: 'on-track', needsCare: false, runsOut: '2026-11-29' })
    expect(row('pot:treats')).toMatchObject({ group: 'ada', spentPence: 21250, leftPence: -1250, status: 'over', needsCare: true })
    expect(row('pot:fuel')).toMatchObject({ group: 'ben', pace: 'none', leftPence: 6180, status: 'left' })
    expect(row('pot:bills')).toMatchObject({ carriesOver: true, spentPence: 4197, status: 'left' })
    expect(row('account:joint')).toMatchObject({ group: 'accounts', plannedPence: 0, spentPence: 11281, status: 'one-offs' })
    // A savings pot with a plan but no card spending stays off the list.
    expect(month.rows.some(item => item.key === 'pot:rainy')).toBe(false)
    expect(month.rows.map(item => item.key)).toEqual(['pot:eating', 'pot:groceries', 'pot:bills', 'pot:treats', 'pot:fuel', 'account:joint'])
    // Spending this month is the Tracked pots (D4): not Bills (carries over) or an account's one-offs. Unsorted
    // spending and payments don't count; October's and December's rows stay in their months.
    expect(month.spentPence).toBe(33860 + 6400 + 21250 + 5820)
    expect(month.plannedPence).toBe(52000 + 15000 + 20000 + 12000)
  })

  it('gives a Funded only pot no Left, no pace and no share of Spent, and lists it with its plan (D3, D4)', () => {
    const document = household()
    document.card!.pots.treats = {}
    const month = monthSpending(document, '2026-11', '2026-11-12')
    expect(month.rows.find(item => item.key === 'pot:treats')).toMatchObject({ kind: 'funded-only', pace: 'none', plannedPence: 20000, spentPence: 21250, leftPence: 0, status: 'funded', needsCare: false })
    expect(month.needsCare).toBe(1)
    expect(month.spentPence).toBe(33860 + 6400 + 5820)
    expect(month.plannedPence).toBe(52000 + 15000 + 12000)
    // Moved in but nothing on the Amex yet: still listed, with what was moved in.
    const quiet = monthSpending({ ...document, card: { ...document.card!, transactions: document.card!.transactions.filter(row => !row.sort?.lines.some(line => line.destination.kind === 'pot' && line.destination.potId === 'treats')) } }, '2026-11', '2026-11-12')
    expect(quiet.rows.find(item => item.key === 'pot:treats')).toMatchObject({ kind: 'funded-only', plannedPence: 20000, spentPence: 0, status: 'funded' })
  })

  it('treats a Saving pot as having no Left either, listed once something comes out of it', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-09', [[pot('rainy'), 4000]]))
    const rainy = monthSpending(document, '2026-11', '2026-11-12').rows.find(item => item.key === 'pot:rainy')
    expect(rainy).toMatchObject({ kind: 'saving', pace: 'none', plannedPence: 50000, spentPence: 4000, leftPence: 0, status: 'saving' })
  })

  it('lowers spent with a refund in the month it arrives', () => {
    const document = household()
    document.card!.transactions.push(tx('2026-11-11', [[pot('groceries'), -2500]]))
    expect(monthSpending(document, '2026-11', '2026-11-12').rows.find(row => row.key === 'pot:groceries')).toMatchObject({ spentPence: 31360, leftPence: 20640 })
  })

  it('takes last month’s next-month covers off what’s left', () => {
    const document = household()
    document.card!.months['2026-10'] = { covers: [{ potId: 'eating', amountPence: 3500, source: { kind: 'next-month' } }, { potId: 'groceries', amountPence: 1000, source: joint }] }
    const row = monthSpending(document, '2026-11', '2026-11-12').rows.find(item => item.key === 'pot:eating')!
    expect(row).toMatchObject({ takenPence: 3500, leftPence: 5100 })
    expect(monthSpending(document, '2026-11', '2026-11-12').rows.find(item => item.key === 'pot:groceries')!.takenPence).toBe(0)
  })

  it('has no pace on the first day until something is spent, and none for past months', () => {
    const document = household()
    const first = monthSpending(document, '2026-11', '2026-11-01').rows.find(row => row.key === 'pot:eating')!
    expect(first).toMatchObject({ spentPence: 6400, status: 'ahead', expectedPence: 500 })
    const past = monthSpending(document, '2026-11', '2026-12-03')
    expect(past).toMatchObject({ when: 'past', day: 30, daysLeft: 0 })
    expect(past.rows.find(row => row.key === 'pot:groceries')).toMatchObject({ status: 'left' })
    expect(past.rows.find(row => row.key === 'pot:groceries')).not.toHaveProperty('expectedPence')
    expect(past.rows.find(row => row.key === 'pot:treats')!.status).toBe('over')
  })

  it('handles the last day of a 31-day month and a month with no plan', () => {
    const document = household()
    document.card!.transactions = [tx('2026-12-31', [[pot('groceries'), 52000]]), tx('2026-12-02', [[pot('eating'), 100]])]
    const december = monthSpending(document, '2026-12', '2026-12-31')
    expect(december).toMatchObject({ day: 31, daysInMonth: 31, daysLeft: 0 })
    expect(december.rows.find(row => row.key === 'pot:groceries')).toMatchObject({ expectedPence: 52000, status: 'on-track', leftPence: 0 })
    const empty = household()
    empty.budget.snapshots = {}
    empty.card!.transactions = [tx('2026-11-03', [[pot('groceries'), 1000]])]
    expect(monthSpending(empty, '2026-11', '2026-11-12').rows).toEqual([expect.objectContaining({ key: 'pot:groceries', plannedPence: 0, status: 'one-offs' })])
  })

  it('is empty for a future month', () => {
    expect(monthSpending(household(), '2027-01', '2026-11-12')).toMatchObject({ when: 'future', day: 0, daysLeft: 31, spentPence: 0 })
  })
})

describe('pot detail', () => {
  it('builds a cumulative line by day and lists the pot’s transactions', () => {
    const document = household()
    const points = cumulativeByDay(document.card!, '2026-11', pot('groceries'), 12)
    expect(points).toHaveLength(12)
    expect(points[0]).toEqual([1, 7490])
    expect(points[11]).toEqual([12, 33860])
    expect(destinationTransactions(document.card!, '2026-11', pot('groceries')).map(row => row.date)).toEqual(['2026-11-10', '2026-11-08', '2026-11-07', '2026-11-05', '2026-11-03', '2026-11-01'])
  })

  it('gives the sort sheet what’s left for each planned pot', () => {
    const left = leftByDestination(household(), '2026-11')
    expect(left.get('pot:groceries')).toBe(18140)
    // Rainy day is in a savings account, so it's Saving and has no Left.
    expect(left.has('pot:rainy')).toBe(false)
    expect(left.has('pot:bills')).toBe(false)
  })
})

describe('carry-over pots', () => {
  async function bills() {
    const { annualCosts } = await import('./cardSpending')
    const { potBalance, checkPotBalance } = await import('./potBalances')
    const document = household()
    document.budget.snapshots['2026-10']!.items.push({ id: 'car-ins', name: 'Car insurance', categoryId: 'c', entryAmountPence: 61200, amountPence: 5100, frequency: 'annually', destination: pot('bills'), funding: 'equal' })
    document.card!.transactions = [
      tx('2026-10-10', [[pot('bills'), 8600]], { statementKey: 'amex:2026-10-24' }),
      tx('2026-10-28', [[pot('bills'), 1299]], { statementKey: 'amex:2026-11-24' }),
      tx('2026-11-05', [[pot('bills'), 1999]], { statementKey: 'amex:2026-11-24' }),
      tx('2026-09-20', [[pot('bills'), 5000]], { statementKey: 'amex:2026-09-24' }),
    ]
    document.card!.statements = {
      'amex:2026-09-24': { cardId: 'amex', closeDate: '2026-09-24', ticks: { 'settle:out:bills': { amountPence: 5000, at: '2026-10-01T09:00:00Z' } } },
      'amex:2026-10-24': { cardId: 'amex', closeDate: '2026-10-24' },
    }
    return { document, potBalance, checkPotBalance, annualCosts }
  }

  it('has no figure until the balance has been checked, but knows what’s waiting to settle', async () => {
    const { document, potBalance } = await bills()
    expect(potBalance(document, 'bills')).toEqual({ potId: 'bills', since: [], setAside: false, waitingPence: 11898, billsDuePence: 0, waiting: [
      { statementKey: 'amex:2026-10-24', closeDate: '2026-10-24', pence: 8600 },
      { statementKey: 'amex:2026-11-24', closeDate: '2026-11-24', pence: 3298 },
    ] })
  })

  it('works out Free: checked + moved in since − out since − waiting to move', async () => {
    const { document, potBalance, checkPotBalance } = await bills()
    let checked = checkPotBalance(document, 'bills', 124000, new Date('2026-11-09T12:00:00Z'))
    checked = { ...checked, ticks: { '2026-11': { 'ada:move:bills': { amountPence: 7500, at: '2026-11-10T09:00:00Z' }, 'ben:move:bills': { amountPence: 7500, at: '2026-11-01T09:00:00Z' }, 'ada:move:groceries': { amountPence: 100, at: '2026-11-10T09:00:00Z' } } } }
    expect(potBalance(checked, 'bills')).toMatchObject({ checked: { pence: 124000 }, since: [{ flow: 'payday', pence: 7500 }], freePence: 124000 + 7500 - 8600 - 3298 })
    // Settling October out of Bills after the check: it leaves the pot, and stops waiting.
    checked.card!.statements['amex:2026-10-24'] = { cardId: 'amex', closeDate: '2026-10-24', ticks: { 'settle:out:bills': { amountPence: 8600, at: '2026-11-25T09:00:00Z' } } }
    expect(potBalance(checked, 'bills')).toMatchObject({ since: [{ flow: 'payday', pence: 7500 }, { flow: 'settled', pence: -8600 }], waiting: [{ closeDate: '2026-11-24', pence: 3298 }], freePence: 124000 + 7500 - 8600 - 3298 })
    // A late refund after settling shows as a negative wait (money to come back).
    checked.card!.transactions.push(tx('2026-10-20', [[pot('bills'), -600]], { statementKey: 'amex:2026-10-24' }))
    expect(potBalance(checked, 'bills').waiting[0]).toEqual({ statementKey: 'amex:2026-10-24', closeDate: '2026-10-24', pence: -600 })
  })

  it('lists the pot’s annual costs from the Plan', async () => {
    const { document, annualCosts } = await bills()
    expect(annualCosts(document, 'bills', '2026-11')).toEqual([{ id: 'car-ins', name: 'Car insurance', yearlyPence: 61200, monthlyPence: 5100 }])
  })
})

describe('pace if placed (Spending ↔ Month link F5)', () => {
  const today = '2026-11-12'
  const unsorted = (document: BudgetDocument) => document.card!.transactions.find(row => !row.sort && row.kind === 'purchase')!

  it('tips an on-track pot into ahead, with the run-out date', () => {
    const document = household()
    const impact = paceIfPlaced(document, unsorted(document), pot('eating'), today)
    expect(impact).toMatchObject({ before: { status: 'on-track', spentPence: 6400 }, after: { status: 'ahead', spentPence: 11400, aheadPence: 5400, runsOut: '2026-11-16' }, same: false, tipped: true })
    expect(impactText('Eating out', impact)).toBe('Eating out: On track → £54 ahead · runs out ~Mon 16 Nov')
    expect(impactTone(impact)).toBe('warning')
    expect(tippedText('Eating out', impact)).toBe('Eating out is now £54 ahead of pace')
    // The document itself is untouched.
    expect(unsorted(document).sort).toBeUndefined()
  })

  it('tips into over, and says when it’s covered', () => {
    const document = household()
    const big = { ...unsorted(document), amountPence: 10000 }
    document.card!.transactions = document.card!.transactions.map(row => row.id === big.id ? big : row)
    const impact = paceIfPlaced(document, big, pot('fuel'), today)
    expect(impact).toMatchObject({ before: { status: 'left', leftPence: 6180 }, after: { status: 'over', leftPence: -3820 }, tipped: true })
    expect(impactText('Fuel', impact)).toBe('Fuel: £61.80 left → £38.20 over · covered when November closes')
    expect(impactTone(impact)).toBe('critical')
    expect(tippedText('Fuel', impact)).toBe('Fuel is now £38.20 over')
  })

  it('doesn’t tip a pot that’s already ahead or over, and shows Left when the pace doesn’t move', () => {
    const document = household()
    const ahead = paceIfPlaced(document, unsorted(document), pot('groceries'), today)
    expect(ahead).toMatchObject({ before: { status: 'ahead', aheadPence: 13060 }, after: { status: 'ahead', aheadPence: 18060 }, tipped: false })
    expect(impactText('Groceries', ahead)).toBe('Groceries: £131 ahead → £181 ahead · runs out ~Tue 17 Nov')
    expect(tippedText('Groceries', ahead)).toBe('')
    expect(paceIfPlaced(document, unsorted(document), pot('treats'), today)).toMatchObject({ before: { status: 'over' }, after: { status: 'over' }, tipped: false })
    const small = { ...unsorted(document), amountPence: 100 }
    document.card!.transactions = document.card!.transactions.map(row => row.id === small.id ? small : row)
    const steady = paceIfPlaced(document, small, pot('eating'), today)
    expect(steady).toMatchObject({ after: { status: 'on-track' }, tipped: false })
    expect(impactText('Eating out', steady)).toBe('Eating out: £86.00 left → £85.00 left')
    expect(impactTone(steady)).toBeUndefined()
  })

  it('lets a refund bring a pot back, never tipping it', () => {
    const document = household()
    const refund = tx('2026-11-11', null, { amountPence: -10000 })
    document.card!.transactions.push(refund)
    const impact = paceIfPlaced(document, refund, pot('groceries'), today)
    expect(impact).toMatchObject({ before: { status: 'ahead' }, after: { status: 'on-track', spentPence: 23860 }, tipped: false })
    expect(impactText('Groceries', impact)).toBe('Groceries: £131 ahead → On track')
  })

  it('says a pot has nothing planned, and has nothing for an account or the pot it’s already in', () => {
    const document = household()
    document.budget.pots.push({ id: 'gifts', name: 'Gifts', accountId: 'joint' })
    expect(impactText('Gifts', paceIfPlaced(document, unsorted(document), pot('gifts'), today))).toBe('Gifts has nothing planned in November')
    expect(impactText('Joint', paceIfPlaced(document, unsorted(document), joint, today))).toBe('')
    const placed = document.card!.transactions.find(row => row.sort?.lines[0]?.destination.kind === 'pot' && row.sort.lines[0].destination.potId === 'eating')!
    const same = paceIfPlaced(document, placed, pot('eating'), today)
    expect(same).toMatchObject({ same: true, tipped: false })
    expect(impactText('Eating out', same)).toBe('')
  })

  it('shows what’s spare in a carry-over pot once its balance is checked', () => {
    const document = household()
    expect(impactText('Bills', paceIfPlaced(document, unsorted(document), pot('bills'), today))).toBe('')
    document.card!.pots.bills = { carriesOver: true, checkedBalance: { pence: 30000, at: '2026-11-01T09:00:00.000Z' } }
    const impact = paceIfPlaced(document, unsorted(document), pot('bills'), today)
    expect(impact.freeAfter).toBe(impact.freeBefore! - 5000)
    expect(impactText('Bills', impact)).toMatch(/^Bills: £[\d,.]+ spare → £[\d,.]+ spare$/)
    expect(impact.tipped).toBe(false)
  })

  it('words each picker option', () => {
    const month = monthSpending(household(), '2026-11', today)
    const row = (key: string) => month.rows.find(item => item.key === key)
    expect(optionPaceText(row('pot:groceries'))).toBe('£181.40 left · £131 ahead')
    expect(optionPaceText(row('pot:eating'))).toBe('£86.00 left')
    expect(optionPaceText(row('pot:treats'))).toBe('£12.50 over')
    expect(optionPaceText(row('pot:fuel'))).toBe('£61.80 left')
    expect(optionPaceText(row('pot:bills'))).toBe('')
    expect(optionPaceText(row('pot:bills'), 8000)).toBe('£80.00 spare')
    expect(optionPaceText(row('account:joint'))).toBe('')
    expect(optionPaceText({ destination: pot('gifts'), status: 'one-offs', leftPence: 0, carriesOver: false })).toBe('nothing planned')
    expect(optionPaceText(undefined)).toBe('')
  })
})
