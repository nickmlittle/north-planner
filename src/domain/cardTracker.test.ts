import { describe, expect, it } from 'vitest'
import { decodeBudgetDocument, newBudgetDocument, removeAdult, type BudgetDocument } from './budgetDocument'
import {
  addDays, cardDraftErrors, cardFromDraft, closeDateFor, daysBetween, daysInMonth, defaultRuleText, draftFromCard, dueDate, emptyCardTracker, merchantKey, monthOf,
  normaliseDescription, parsePence, parseStatementKey, penceFromAmount, removeCard, saveCard, shiftMonth, statementFor, statementKey, statementWindow, validCardTracker, validIsoDate,
  type CardAccount, type CardTracker, type CardTransaction,
} from './cardTracker'

const amex: CardAccount = { id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }] }

function household(): BudgetDocument {
  const document = newBudgetDocument()
  document.household = { name: 'Home', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] }
  document.workflow.setupComplete = true
  document.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] }, { id: 'ada-own', name: 'Current', provider: 'Starling', ownerPersonIds: ['ada'] }]
  document.budget.pots = [{ id: 'groceries', name: 'Groceries', accountId: 'joint' }, { id: 'bills', name: 'Bills', accountId: 'joint' }]
  return document
}

const purchase = (overrides: Partial<CardTransaction> = {}): CardTransaction => ({
  id: 'AT0000000000000000000001', cardId: 'amex', date: '2026-11-03', description: 'GREEN GROCER LONDON', merchant: 'GREEN GROCER', amountPence: 4250, kind: 'purchase',
  cardSuffix: '41001', statementKey: 'amex:2026-11-24', personId: 'ada', importedAt: '2026-11-05T09:00:00Z', ...overrides,
})

function tracker(overrides: Partial<CardTracker> = {}): CardTracker {
  return { ...emptyCardTracker(), cards: [amex], ...overrides }
}

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(validIsoDate('2026-02-28')).toBe(true)
    expect(validIsoDate('2026-02-29')).toBe(false)
    expect(validIsoDate('2028-02-29')).toBe(true)
    expect(validIsoDate('2026-13-01')).toBe(false)
    expect(validIsoDate('26-11-01')).toBe(false)
  })

  it('adds days, counts them and shifts months across year ends', () => {
    expect(addDays('2026-11-24', 25)).toBe('2026-12-19')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-11-24', '2026-12-19')).toBe(25)
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(shiftMonth('2026-11', -14)).toBe('2025-09')
    expect(monthOf('2026-11-03')).toBe('2026-11')
    expect([daysInMonth('2026-02'), daysInMonth('2028-02'), daysInMonth('2026-11'), daysInMonth('2026-12')]).toEqual([28, 29, 30, 31])
  })
})

describe('statements', () => {
  it('runs from the 25th to the 24th for a close day of 24', () => {
    expect(closeDateFor('2026-11-24', 24)).toBe('2026-11-24')
    expect(closeDateFor('2026-11-25', 24)).toBe('2026-12-24')
    expect(closeDateFor('2026-10-25', 24)).toBe('2026-11-24')
    expect(closeDateFor('2026-12-31', 24)).toBe('2027-01-24')
    expect(statementWindow('2026-11-24', 24)).toEqual({ from: '2026-10-25', to: '2026-11-24' })
    expect(statementWindow('2027-01-24', 24)).toEqual({ from: '2026-12-25', to: '2027-01-24' })
    expect(statementFor('2026-11-09', amex)).toBe('amex:2026-11-24')
  })

  it('works for an early close day too', () => {
    expect(closeDateFor('2026-11-02', 2)).toBe('2026-11-02')
    expect(closeDateFor('2026-11-03', 2)).toBe('2026-12-02')
    expect(statementWindow('2026-12-02', 2)).toEqual({ from: '2026-11-03', to: '2026-12-02' })
  })

  it('is due the set number of days after closing', () => {
    expect(dueDate('2026-11-24', amex)).toBe('2026-12-19')
  })

  it('round-trips statement keys', () => {
    expect(statementKey('amex', '2026-11-24')).toBe('amex:2026-11-24')
    expect(parseStatementKey('amex:2026-11-24')).toEqual({ cardId: 'amex', closeDate: '2026-11-24' })
    expect(parseStatementKey('amex:2026-11-31')).toBeNull()
    expect(parseStatementKey('2026-11-24')).toBeNull()
  })
})

describe('text and money', () => {
  it('normalises descriptions for matching', () => {
    expect(normaliseDescription('  Green   grocer\nLondon ')).toBe('GREEN GROCER LONDON')
  })

  it('takes the merchant before the padding, without digits or stars', () => {
    expect(merchantKey('B&M Retail - 10742 B&M  Dartford')).toBe('B&M RETAIL - B&M')
    expect(merchantKey('SQ *CORNER CAFE 0042        BRISTOL')).toBe('SQ CORNER CAFE')
    expect(merchantKey('Corner shop')).toBe('CORNER SHOP')
  })

  it('suggests a rule from the first word or two of the merchant', () => {
    expect(defaultRuleText('GREEN GROCER')).toBe('GREEN')
    expect(defaultRuleText('B&M RETAIL - B&M')).toBe('B&M RETAIL')
  })

  it('turns spreadsheet floats into exact pence', () => {
    expect(penceFromAmount(61.12)).toBe(6112)
    expect(penceFromAmount(18.0)).toBe(1800)
    expect(penceFromAmount(0.1 + 0.2)).toBe(30)
    expect(penceFromAmount(-1234.56)).toBe(-123456)
    expect(Object.is(penceFromAmount(-0.001), 0)).toBe(true)
  })

  it.each([
    ['12', 1200], ['12.3', 1230], ['12.34', 1234], ['£1,234.56', 123456], ['-£4.50', -450], ['- 4.50', -450], ['.5', 50], ['0', 0],
  ])('parses %s as %i pence', (text, pence) => expect(parsePence(text)).toBe(pence))

  it.each(['', '£', '12.345', '1,23', 'abc', '1.2.3'])('rejects %j', text => expect(parsePence(text)).toBeNull())
})

describe('validation', () => {
  const people = new Set(['ada', 'ben'])
  const budget = household().budget

  it('accepts an empty tracker and a populated one', () => {
    expect(validCardTracker(emptyCardTracker(), budget, people)).toBe(true)
    expect(validCardTracker(tracker({
      transactions: [purchase({ sort: { lines: [{ amountPence: 2000, destination: { kind: 'pot', potId: 'groceries' } }, { amountPence: 2250, destination: { kind: 'account', accountId: 'joint' }, item: 'Wine' }], by: 'person', at: '2026-11-05T10:00:00Z' } })],
      rules: [{ id: 'r1', contains: 'GREEN', destination: { kind: 'pot', potId: 'groceries' }, createdAt: '2026-11-01T00:00:00Z' }, { id: 'r2', contains: 'OCADO', split: [{ destination: { kind: 'pot', potId: 'groceries' }, percent: 50 }, { destination: { kind: 'pot', potId: 'bills' }, percent: 50 }], createdAt: '2026-11-01T00:00:00Z' }],
      statements: { 'amex:2026-11-24': { cardId: 'amex', closeDate: '2026-11-24', ticks: { 'settle:pay': { amountPence: 4250, at: '2026-11-30T00:00:00Z' } } } },
      months: { '2026-10': { closedAt: '2026-11-04T00:00:00Z', covers: [{ potId: 'groceries', amountPence: 3500, source: { kind: 'next-month' } }], leftovers: { bills: 1200 } } },
      pots: { bills: { carriesOver: true, pace: 'none', checkedBalance: { pence: 124000, at: '2026-11-09T00:00:00Z' } }, groceries: { pace: 'steady', buildUpLimit: 3 } },
      imports: [{ at: '2026-11-05T09:00:00Z', cardId: 'amex', fileName: 'activity.xlsx', statementKey: 'amex:2026-11-24', rows: 1, added: 1, skipped: 0, sortedByRules: 1, latestDate: '2026-11-03', matchesSummary: true }],
    }), budget, people)).toBe(true)
  })

  it.each([
    ['a close day past 28', tracker({ cards: [{ ...amex, closeDay: 31 }] })],
    ['an unknown pay-from account', tracker({ cards: [{ ...amex, payFromAccountId: 'nope' }] })],
    ['a cardholder who is not an adult', tracker({ cards: [{ ...amex, cardholders: [{ suffix: '1', personId: 'zed' }] }] })],
    ['a repeated suffix', tracker({ cards: [{ ...amex, cardholders: [{ suffix: '1', personId: 'ada' }, { suffix: '1', personId: 'ben' }] }] })],
    ['split lines that do not add up', tracker({ transactions: [purchase({ sort: { lines: [{ amountPence: 100, destination: { kind: 'pot', potId: 'groceries' } }], by: 'person', at: 'x' } })] })],
    ['a sort on a payment', tracker({ transactions: [purchase({ kind: 'payment', amountPence: -4250, sort: { lines: [{ amountPence: -4250, destination: { kind: 'account', accountId: 'joint' } }], by: 'person', at: 'x' } })] })],
    ['a line to a missing pot', tracker({ transactions: [purchase({ sort: { lines: [{ amountPence: 4250, destination: { kind: 'pot', potId: 'gone' } }], by: 'person', at: 'x' } })] })],
    ['an impossible date', tracker({ transactions: [purchase({ date: '2026-11-31' })] })],
    ['a statement on another card', tracker({ transactions: [purchase({ statementKey: 'visa:2026-11-24' })] })],
    ['a fractional amount', tracker({ transactions: [purchase({ amountPence: 42.5 })] })],
    ['duplicate transaction ids', tracker({ transactions: [purchase(), purchase()] })],
    ['a rule with nowhere to go', tracker({ rules: [{ id: 'r', contains: 'X', createdAt: 'x' }] })],
    ['a split rule that is not 100%', tracker({ rules: [{ id: 'r', contains: 'X', split: [{ destination: { kind: 'pot', potId: 'bills' }, percent: 60 }], createdAt: 'x' }] })],
    ['a statement record under the wrong key', tracker({ statements: { 'amex:2026-11-24': { cardId: 'amex', closeDate: '2026-10-24' } } })],
    ['a bad month key', tracker({ months: { '2026-13': {} } })],
    ['settings for a missing pot', tracker({ pots: { gone: { pace: 'steady' } } })],
    ['a zero build-up limit', tracker({ pots: { bills: { buildUpLimit: 0 } } })],
    ['a negative import count', tracker({ imports: [{ at: 'x', cardId: 'amex', fileName: 'f', statementKey: 'amex:2026-11-24', rows: -1, added: 0, skipped: 0, sortedByRules: 0, latestDate: '', matchesSummary: true }] })],
  ])('rejects %s', (_, value) => expect(validCardTracker(value, budget, people)).toBe(false))
})

describe('the budget document', () => {
  it('still loads documents with no card data', () => {
    const document = household()
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('round-trips a document with a card through save and load', () => {
    const document = { ...household(), card: tracker({ transactions: [purchase()] }) }
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('makes the document invalid when the card data is', () => {
    expect(decodeBudgetDocument({ ...household(), card: { cards: 'nope' } })).toBeNull()
    expect(decodeBudgetDocument({ ...household(), card: tracker({ cards: [{ ...amex, cardholders: [{ suffix: '1', personId: 'zed' }] }] }) })).toBeNull()
  })

  it('keeps a cardholder from being removed', () => {
    const base = household()
    base.household.adults.push({ id: 'cal', name: 'Cal' })
    expect(removeAdult(base, 'cal').household.adults).toHaveLength(2)
    const document = { ...base, card: tracker({ cards: [{ ...amex, cardholders: [{ suffix: '41002', personId: 'cal' }] }] }) }
    expect(removeAdult(document, 'cal')).toBe(document)
  })
})

describe('card settings', () => {
  const budget = household().budget

  it('requires the closing day and days until due, with no silent defaults', () => {
    const draft = draftFromCard(undefined, budget)
    expect(draft).toMatchObject({ name: 'Amex', closeDay: '', dueDays: '', payFromAccountId: 'joint', buffer: '' })
    expect(cardDraftErrors(draft, budget)).toEqual({ closeDay: 'Enter a day from 1 to 28.', dueDays: 'Enter a number of days from 1 to 60.' })
    expect(cardDraftErrors({ ...draft, closeDay: '24', dueDays: '25' }, budget)).toEqual({})
    expect(cardDraftErrors({ ...draft, closeDay: '29', dueDays: '2.5' }, budget)).toMatchObject({ closeDay: expect.any(String), dueDays: expect.any(String) })
  })

  it('checks card endings', () => {
    const draft = { ...draftFromCard(undefined, budget), closeDay: '24', dueDays: '25' }
    expect(cardDraftErrors({ ...draft, cardholders: [{ suffix: '12', personId: 'ada' }] }, budget).cardholders).toBe('A card ending is 4 to 6 digits.')
    expect(cardDraftErrors({ ...draft, cardholders: [{ suffix: '41001', personId: '' }] }, budget).cardholders).toBe('Choose whose card it is.')
    expect(cardDraftErrors({ ...draft, cardholders: [{ suffix: '-41001', personId: 'ada' }, { suffix: '41001', personId: 'ben' }] }, budget).cardholders).toBe('Each card ending can only be listed once.')
  })

  it('builds a card, dropping a buffer that is just the pay-from account and the minus on endings', () => {
    const draft = { ...draftFromCard(undefined, budget), closeDay: '24', dueDays: '25', buffer: 'account:joint', cardholders: [{ suffix: '-41001', personId: 'ada' }, { suffix: '', personId: '' }] }
    expect(cardFromDraft(draft, 'amex')).toEqual({ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }] })
    expect(cardFromDraft({ ...draft, buffer: 'pot:bills' }, 'amex').bufferDestination).toEqual({ kind: 'pot', potId: 'bills' })
    expect(draftFromCard(cardFromDraft({ ...draft, buffer: 'pot:bills' }, 'amex'), budget)).toMatchObject({ closeDay: '24', dueDays: '25', buffer: 'pot:bills' })
  })

  it('saves a card and gives unmapped transactions their person', () => {
    const document = { ...household(), card: tracker({ cards: [{ ...amex, cardholders: [] }], transactions: [purchase({ personId: undefined })] }) }
    const saved = saveCard(document, amex)
    expect(saved.card?.cards).toEqual([amex])
    expect(saved.card?.transactions[0]?.personId).toBe('ada')
    expect(saveCard(household(), amex).card?.cards).toEqual([amex])
    expect(decodeBudgetDocument(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })
})

describe('removeCard', () => {
  const card: CardAccount = { id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [] }
  it('removes a card with no history, and keeps one with transactions or statements', () => {
    const fresh = { card: { ...emptyCardTracker(), cards: [card] } }
    expect(removeCard(fresh, 'amex').card!.cards).toEqual([])
    const used = { card: { ...emptyCardTracker(), cards: [card], statements: { 'amex:2026-10-24': { cardId: 'amex', closeDate: '2026-10-24' } } } }
    expect(removeCard(used, 'amex')).toBe(used)
  })
})
