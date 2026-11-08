// Deterministic, fictitious data for the item 1.3 UX audit.
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
  { id: 'holidays', name: 'Holidays', accountId: 'joint' },
  { id: 'emergency', name: 'Emergency', accountId: 'saving' },
  { id: 'ada-spend', name: 'Spending', accountId: 'ada' },
  { id: 'ben-spend', name: 'Spending', accountId: 'ben' },
]
const items = names.map((name, i) => {
  const amountPence = i === 0 ? 32547 : 4500 + i * 713
  const destination = i === 0 || i < 12 ? { kind: 'pot', potId: 'bills' }
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
const document = {
  version: 3,
  household: { name: 'Baseline household', adults: [{ id: 'ada', name: 'Ada' }, { id: 'ben', name: 'Ben' }] },
  workflow: { setupComplete: true },
  budget: {
    accounts, pots, categories,
    snapshots: { '2026-10': { items }, '2027-03': { items } },
    incomeSources: [
      { id: 'pay-ada', personId: 'ada', name: 'Salary', type: 'employment', baseAmountPence: 400000, changes: {} },
      { id: 'pay-ben', personId: 'ben', name: 'Salary', type: 'employment', baseAmountPence: 250000, changes: {} },
    ],
    incomePolicies: [],
  },
}
writeFileSync(new globalThis.URL('../docs/fixtures/plan-transfers-baseline.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`)
