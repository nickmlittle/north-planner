import { describe, expect, it } from 'vitest'
import { newBudgetDocument, type BudgetDocument } from './budgetDocument'
import { clearWaiting, markWaiting, sortTransaction, transactionsWaiting } from './cardSorting'
import { emptyCardTracker, type CardTransaction } from './cardTracker'
import { goThroughCounts, goThroughStep, handleRow, startGoThrough, type GoThrough } from './goThrough'

// Go through them (audit 6, W9, WP8): a waiting group, one row at a time, with the queue fixed when it opens.
const NOV = 'amex:2026-11-24'
const now = new Date('2026-11-23T10:00:00Z')
const askAda = { kind: 'person', personId: 'ada' } as const, discuss = { kind: 'discuss' } as const
const tx = (id: string, date: string, amountPence: number): CardTransaction => ({
  id, cardId: 'amex', date, description: id.toUpperCase(), merchant: id.toUpperCase(), amountPence, kind: 'purchase', cardSuffix: '41001', personId: 'ada', statementKey: NOV, importedAt: 'x',
})
const toGroceries = (amountPence: number) => [{ amountPence, destination: { kind: 'pot' as const, potId: 'groceries' } }]

/** Zara, Boots and The Works ask Ada (newest first: Zara, Boots, Works); John Lewis is to discuss; Tesco is to sort. */
function household(): BudgetDocument {
  let document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.budget.accounts = [{ id: 'joint', name: 'Monzo Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }]
  document.card = {
    ...emptyCardTracker(),
    cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }] }],
    transactions: [tx('zara', '2026-11-19', 6800), tx('boots', '2026-11-17', 2345), tx('works', '2026-11-14', 2099), tx('lewis', '2026-11-20', 3800), tx('tesco', '2026-11-22', 3270)],
  }
  for (const id of ['zara', 'boots', 'works']) document = markWaiting(document, id, askAda, undefined, now)
  return markWaiting(document, 'lewis', discuss, undefined, now)
}
const adaGroup = (document: BudgetDocument): GoThrough => startGoThrough(transactionsWaiting(document)[0]!)

describe('the go-through queue', () => {
  it('starts on the group’s first row, in the group’s order, with its count and total fixed', () => {
    const document = household()
    const state = adaGroup(document)
    expect(state).toEqual({ on: askAda, ids: ['zara', 'boots', 'works'], totalPence: 6800 + 2345 + 2099, handled: [] })
    const step = goThroughStep(document, state)!
    expect([step.current.id, step.position, step.next?.id]).toEqual(['zara', 1, 'boots'])
  })

  it('Skip keeps the mark and moves on; the last row has no next', () => {
    const document = household()
    let state = handleRow(adaGroup(document), 'zara')
    expect(goThroughStep(document, state)).toMatchObject({ current: { id: 'boots' }, position: 2, next: { id: 'works' } })
    state = handleRow(state, 'boots')
    const last = goThroughStep(document, state)!
    expect([last.current.id, last.position, last.next]).toEqual(['works', 3, undefined])
    expect(document.card!.transactions.find(row => row.id === 'zara')!.waiting).toBeDefined()
  })

  it('placing a row moves on, since it is no longer waiting', () => {
    let document = household()
    const state = adaGroup(document)
    document = sortTransaction(document, 'zara', toGroceries(6800), now)
    expect(goThroughStep(document, handleRow(state, 'zara'))?.current.id).toBe('boots')
  })

  it('a row sorted elsewhere drops out, and “1 of 3” keeps its count', () => {
    let document = household()
    const state = adaGroup(document)
    document = sortTransaction(document, 'boots', toGroceries(2345), now)
    expect(goThroughStep(document, state)).toMatchObject({ current: { id: 'zara' }, position: 1, next: { id: 'works' } })
    expect(goThroughStep(document, handleRow(state, 'zara'))).toMatchObject({ current: { id: 'works' }, position: 3 })
  })

  it('rows marked after it opens wait for the next go-through (WP8)', () => {
    let document = household()
    const state = adaGroup(document)
    document = markWaiting(document, 'tesco', askAda, undefined, now)
    let step = state
    const seen: string[] = []
    for (let current = goThroughStep(document, step); current; current = goThroughStep(document, step)) { seen.push(current.current.id); step = handleRow(step, current.current.id) }
    expect(seen).toEqual(['zara', 'boots', 'works'])
    expect(adaGroup(document).ids).toContain('tesco')
  })

  it('ends once every row is dealt with', () => {
    const document = household()
    const state = ['zara', 'boots', 'works'].reduce(handleRow, adaGroup(document))
    expect(goThroughStep(document, state)).toBeUndefined()
  })
})

describe('what a go-through did', () => {
  it('counts sorted, back in To sort and still waiting from the document', () => {
    let document = household()
    let state = adaGroup(document)
    document = sortTransaction(document, 'zara', toGroceries(6800), now); state = handleRow(state, 'zara')
    document = clearWaiting(document, 'boots'); state = handleRow(state, 'boots')
    document = markWaiting(document, 'works', discuss, 'Ask about the bag', now); state = handleRow(state, 'works')
    expect(goThroughCounts(document, state)).toEqual({ passed: 3, sorted: 1, waiting: 1, back: 1, all: true })
  })

  it('closed part way: only the rows gone through, and not all', () => {
    let document = household()
    const opened = adaGroup(document)
    document = sortTransaction(document, 'zara', toGroceries(6800), now)
    expect(goThroughCounts(document, handleRow(opened, 'zara'))).toEqual({ passed: 1, sorted: 1, waiting: 0, back: 0, all: false })
    // Sorted elsewhere while it was open: gone through all the same.
    expect(goThroughCounts(document, opened)).toMatchObject({ passed: 1, sorted: 1 })
  })

  it('a skipped row counts as still waiting', () => {
    const document = household()
    const state = ['zara', 'boots'].reduce(handleRow, adaGroup(document))
    expect(goThroughCounts(document, state)).toEqual({ passed: 2, sorted: 0, waiting: 2, back: 0, all: false })
  })
})
