// Deterministic, fictitious data for the item 1.3 UX audit, and the card tracker's screens.
import { writeFileSync } from 'node:fs'

const names = [
  'Groceries', 'Rent', 'Council tax', 'Electricity', 'Gas', 'Water', 'Broadband', 'Mobile plans',
  'Home insurance', 'Car insurance', 'Fuel', 'Rail tickets', 'Childcare', 'School meals',
  'Streaming', 'Gym', 'Pharmacy', 'Dental', 'Clothing', 'Haircuts', 'Pet food', 'Vet',
  'Birthdays', 'Christmas', 'Holiday', 'Emergency savings', 'Home repairs', 'Garden',
  'Coffee', 'Dining out', 'Cinema', 'Books', 'Subscriptions', 'Parking', 'Road tax',
  'Charity', 'Pension top-up', 'Travel insurance', 'Appliances', 'Weekend trips',
]
const categories = ['Home', 'Utilities', 'Transport', 'Family', 'Lifestyle', 'Savings'].map((name, i) => ({ id: `c${i}`, name }))
const accounts = [
  { id: 'joint', name: 'Current account', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
  { id: 'ada', name: 'Current account', provider: 'Starling', ownerPersonIds: ['ada'] },
  { id: 'ben', name: 'Current account', provider: 'Nationwide', ownerPersonIds: ['ben'] },
  { id: 'saving', name: 'Savings account', provider: 'Monzo', ownerPersonIds: ['ada', 'ben'] },
]
const pots = [
  { id: 'bills', name: 'Bills', accountId: 'joint' },
  { id: 'groceries', name: 'Groceries', accountId: 'joint' },
  { id: 'holidays', name: 'Holidays', accountId: 'joint' },
  { id: 'emergency', name: 'Emergency', accountId: 'saving' },
  { id: 'ada-spend', name: 'Spending', accountId: 'ada' },
  { id: 'ben-spend', name: 'Spending', accountId: 'ben' },
  // The Amex pot: money is set aside in it as transactions are sorted, and the bill is paid from it.
  { id: 'amex-pot', name: 'Amex', accountId: 'joint', kind: 'credit-card' },
]
const items = names.map((name, i) => {
  const amountPence = i === 0 ? 32547 : 4500 + i * 713
  // Groceries has its own joint pot, so the card tracker has a steady pot to pace.
  const destination = i === 0 ? { kind: 'pot', potId: 'groceries' } : i < 12 ? { kind: 'pot', potId: 'bills' }
    : i < 18 ? { kind: 'account', accountId: 'joint' }
      : i < 26 ? { kind: 'pot', potId: 'holidays' }
        : i < 32 ? { kind: 'pot', potId: 'emergency' }
          : i < 36 ? { kind: 'pot', potId: 'ada-spend' } : { kind: 'pot', potId: 'ben-spend' }
  const funding = i % 9 === 0 ? 'equal' : i % 9 === 1 ? 'single' : i % 9 === 2 ? 'custom' : i % 9 === 3 ? 'fixed' : 'proportional'
  return {
    id: `item-${String(i + 1).padStart(2, '0')}`, name,
    categoryId: categories[Math.min(5, Math.floor(i / 7))].id,
    entryAmountPence: amountPence, amountPence, frequency: 'monthly', destination, funding,
    ...(funding === 'single' ? { singleFunderId: i % 2 ? 'ada' : 'ben' } : {}),
    ...(funding === 'custom' ? { customShares: { ada: 3, ben: 2 } } : {}),
    ...(funding === 'fixed' ? { contributions: [{ personId: 'ada', amountPence: Math.floor(amountPence / 2) }, { personId: 'ben', amountPence: amountPence - Math.floor(amountPence / 2) }] } : {}),
  }
})
// Card tracker (Spending): one Amex with Ada's and Ben's cards, statements 25th–24th, due 25 days later.
// October is all sorted; November has a few left to sort. Merchants, endings and references are fictitious.
const G = { kind: 'pot', potId: 'groceries' }, B = { kind: 'pot', potId: 'bills' }, A = { kind: 'pot', potId: 'ada-spend' }
const N = { kind: 'pot', potId: 'ben-spend' }, H = { kind: 'pot', potId: 'holidays' }, J = { kind: 'account', accountId: 'joint' }
const rules = [
  { id: 'rule-grocer', contains: 'GREEN GROCER', destination: G, createdAt: '2026-10-01T09:00:00.000Z' },
  { id: 'rule-deli', contains: 'MARKET HALL', destination: G, createdAt: '2026-10-01T09:00:00.000Z' },
  { id: 'rule-stream', contains: 'STREAMFLIX', destination: B, createdAt: '2026-10-01T09:00:00.000Z' },
  { id: 'rule-fuel', contains: 'FUEL STOP', cardSuffix: '41009', destination: N, createdAt: '2026-10-01T09:00:00.000Z' },
]
const octImport = '2026-10-27T08:00:00.000Z', novImport = '2026-11-09T19:30:00.000Z'
// [date, description, ending, pence, destination or null (to sort), rule id?, statement close]
const rows = [
  ['2026-10-02', 'GREEN GROCER LONDON', '41001', 6420, G, 'rule-grocer', '2026-10-24'],
  ['2026-10-03', 'CORNER CAFE 0042 BRISTOL', '41009', 980, N, null, '2026-10-24'],
  ['2026-10-05', 'STREAMFLIX LONDON', '41001', 1999, B, 'rule-stream', '2026-10-24'],
  ['2026-10-06', 'FUEL STOP 118 READING', '41009', 6140, N, 'rule-fuel', '2026-10-24'],
  ['2026-10-08', 'GREEN GROCER LONDON', '41009', 5875, G, 'rule-grocer', '2026-10-24'],
  ['2026-10-10', 'BOOK NOOK YORK', '41001', 1499, A, null, '2026-10-24'],
  ['2026-10-12', 'MARKET HALL DELI BATH', '41001', 4210, G, 'rule-deli', '2026-10-24'],
  ['2026-10-14', 'SEASIDE INN WHITBY', '41009', 18000, H, null, '2026-10-24'],
  ['2026-10-16', 'GREEN GROCER LONDON', '41001', 7135, G, 'rule-grocer', '2026-10-24'],
  ['2026-10-18', 'HOMEWARE HUT LEEDS', '41009', 4500, J, null, '2026-10-24'],
  ['2026-10-20', 'CORNER CAFE 0042 BRISTOL', '41001', 1240, A, null, '2026-10-24'],
  ['2026-10-22', 'GREEN GROCER LONDON', '41009', 6690, G, 'rule-grocer', '2026-10-24'],
  // Dated the 24th but posted later, so Amex put it on the November statement.
  ['2026-10-24', 'MARKET HALL DELI BATH', '41009', 2715, G, 'rule-deli', '2026-11-24'],
  ['2026-10-26', 'FUEL STOP 118 READING', '41009', 5510, N, 'rule-fuel', '2026-11-24'],
  ['2026-10-28', 'GREEN GROCER LONDON', '41001', 8360, G, 'rule-grocer', '2026-11-24'],
  ['2026-10-30', 'PHONE CO ONLINE', '41009', 1500, B, null, '2026-11-24'],
  ['2026-11-01', 'MARKET HALL DELI BATH', '41001', 7490, G, 'rule-deli', '2026-11-24'],
  ['2026-11-02', 'HOMEWARE HUT LEEDS', '41009', 8997, null, null, '2026-11-24'],
  ['2026-11-03', 'BOOK NOOK YORK', '41001', 1250, A, null, '2026-11-24'],
  ['2026-11-04', 'GREEN GROCER LONDON', '41009', 4460, G, 'rule-grocer', '2026-11-24'],
  ['2026-11-05', 'HOMEWARE HUT LEEDS', '41009', -2499, null, null, '2026-11-24'],
  ['2026-11-05', 'STREAMFLIX LONDON', '41001', 1999, B, 'rule-stream', '2026-11-24'],
  ['2026-11-06', 'FUEL STOP 118 READING', '41009', 5820, N, 'rule-fuel', '2026-11-24'],
  ['2026-11-07', 'CORNER CAFE 0042 BRISTOL', '41009', 1800, null, null, '2026-11-24'],
  ['2026-11-08', 'PAYMENT RECEIVED - THANK YOU', '41001', -35000, null, null, '2026-11-24'],
  ['2026-11-08', 'GREEN GROCER LONDON', '41001', 6240, G, 'rule-grocer', '2026-11-24'],
  ['2026-11-08', 'TRAIN TICKETS ONLINE', '41001', 11281, null, null, '2026-11-24'],
]
const merchant = description => description.toUpperCase().replace(/ (LONDON|BRISTOL|READING|YORK|BATH|WHITBY|LEEDS|ONLINE)$/, '').replace(/[\d*]/g, '').replace(/\s+/g, ' ').trim()
const transactions = rows.map(([date, description, ending, pence, destination, ruleId, close], index) => {
  const payment = description.startsWith('PAYMENT RECEIVED')
  const at = close === '2026-10-24' ? octImport : novImport
  return {
    id: `AT26${String(8000000000000000000n + BigInt(index + 1))}`, cardId: 'amex', date, description, merchant: merchant(description), amountPence: pence,
    kind: payment ? 'payment' : pence < 0 ? 'refund' : 'purchase', cardSuffix: ending, statementKey: `amex:${close}`, personId: ending === '41001' ? 'ada' : 'ben',
    ...(payment ? {} : { amexCategory: 'General Purchases' }), importedAt: at,
    ...(destination ? { sort: { lines: [{ amountPence: pence, destination }], by: ruleId ? 'rule' : 'person', ...(ruleId ? { ruleId } : {}), at } } : {}),
  }
})
const summaryFor = close => {
  const onIt = transactions.filter(row => row.statementKey === `amex:${close}`)
  const charges = onIt.filter(row => row.amountPence > 0).reduce((sum, row) => sum + row.amountPence, 0)
  const credits = onIt.filter(row => row.amountPence < 0).reduce((sum, row) => sum + row.amountPence, 0)
  const previous = close === '2026-10-24' ? 42000 : 0
  return { previousPence: previous, paymentsAndCreditsPence: credits, chargesPence: charges, totalPence: previous + credits + charges, at: close === '2026-10-24' ? octImport : novImport }
}
const count = close => transactions.filter(row => row.statementKey === `amex:${close}`).length
const byRules = close => transactions.filter(row => row.statementKey === `amex:${close}` && row.sort?.by === 'rule').length
// From the November statement, money goes into the Amex pot as it's sorted. One move on 6 Nov covered the sorted
// November-statement transactions up to 4 Nov; what's been sorted since is still to move.
const moves = [{
  id: 'move-1', cardId: 'amex', at: '2026-11-06T18:00:00.000Z',
  transactions: transactions.filter(row => row.statementKey === 'amex:2026-11-24' && row.sort && row.date <= '2026-11-04').map(row => ({ transactionId: row.id, lines: row.sort.lines })),
}]
const card = {
  cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint', cardholders: [{ suffix: '41001', personId: 'ada' }, { suffix: '41009', personId: 'ben' }], setAside: { potId: 'amex-pot', fromCloseDate: '2026-11-24' } }],
  transactions, rules, moves,
  statements: {
    'amex:2026-10-24': { cardId: 'amex', closeDate: '2026-10-24', amexSummary: summaryFor('2026-10-24'), finalImportAt: octImport },
    'amex:2026-11-24': { cardId: 'amex', closeDate: '2026-11-24', amexSummary: summaryFor('2026-11-24') },
  },
  months: {},
  // Balances checked against the bank on 31 Oct, after November's money went in.
  pots: {
    bills: { carriesOver: true, pace: 'none', checkedBalance: { pence: 124000, at: '2026-10-31T10:00:00.000Z' } }, emergency: { pace: 'none' },
    groceries: { checkedBalance: { pence: 84000, at: '2026-10-31T10:00:00.000Z' } }, 'amex-pot': { checkedBalance: { pence: 0, at: '2026-10-31T10:00:00.000Z' } },
  },
  imports: [
    { at: octImport, cardId: 'amex', fileName: 'activity.xlsx', statementKey: 'amex:2026-10-24', rows: count('2026-10-24'), added: count('2026-10-24'), skipped: 0, sortedByRules: byRules('2026-10-24'), latestDate: '2026-10-22', matchesSummary: true },
    { at: novImport, cardId: 'amex', fileName: 'activity (1).xlsx', statementKey: 'amex:2026-11-24', rows: count('2026-11-24'), added: count('2026-11-24'), skipped: 0, sortedByRules: byRules('2026-11-24'), latestDate: '2026-11-08', matchesSummary: true },
  ],
}
const document = {
  version: 3,
  household: { name: 'Baseline household', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] },
  workflow: { setupComplete: true },
  budget: {
    accounts, pots, categories,
    snapshots: { '2026-10': { items }, '2027-03': { items } },
    incomeSources: [
      { id: 'pay-ada', personId: 'ada', name: 'Salary', type: 'employment', baseAmountPence: 400000, changes: {}, payday: { day: 28, ifNotWorkingDay: 'previous' } },
      { id: 'pay-ben', personId: 'ben', name: 'Salary', type: 'employment', baseAmountPence: 250000, changes: {}, payday: { day: 28, ifNotWorkingDay: 'next' } },
    ],
    incomePolicies: [],
  },
  card,
}
writeFileSync(new globalThis.URL('../docs/fixtures/plan-transfers-baseline.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`)
