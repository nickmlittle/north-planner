import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { decodeBudgetDocument } from './budgetDocument'
import { resolveBudget } from './monthlyBudget'
import { buildTransferInstructions } from './transferInstructions'

it('keeps the reusable UX baseline fixture valid and financially reconciled', () => {
  const raw = JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8'))
  const document = decodeBudgetDocument(raw)
  expect(document).not.toBeNull()
  if (!document) return
  expect(document.budget.snapshots['2026-10']?.items).toHaveLength(40)
  const instructions = buildTransferInstructions(document, '2026-11')
  expect(instructions.incomplete).toBe(false)
  expect(instructions.totals.plannedPence).toBe(764187)
  expect(instructions.totals.allocatedFundingPence).toBe(764187)
  expect(instructions.accounts.find(account => account.accountId === 'joint')?.fundingRequirements.reduce((sum, step) => sum + step.amountPence, 0)).toBe(376772)
})

it('carries synthetic card data on the real 25th–24th statements', () => {
  const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))!
  const card = document.card!
  expect(card.cards[0]).toMatchObject({ closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'joint' })
  expect(card.transactions.filter(row => row.kind !== 'payment' && !row.sort)).toHaveLength(4)
  expect(new Set(card.transactions.map(row => row.statementKey))).toEqual(new Set(['amex:2026-10-24', 'amex:2026-11-24']))
  // Each statement's rows add up to the Amex summary stored for it.
  for (const [key, statement] of Object.entries(card.statements)) {
    const rows = card.transactions.filter(row => row.statementKey === key)
    expect(rows.filter(row => row.amountPence > 0).reduce((sum, row) => sum + row.amountPence, 0)).toBe(statement.amexSummary?.chargesPence)
  }
  expect(card.pots.bills?.carriesOver).toBe(true)
})

it('carries synthetic recurring bills in Bills, matching the design canvas', () => {
  const document = decodeBudgetDocument(JSON.parse(readFileSync(new URL('../../docs/fixtures/plan-transfers-baseline.json', import.meta.url), 'utf8')))!
  const bills = resolveBudget(document.budget, '2026-11').items.filter(item => item.bill)
  expect(bills.every(item => item.destination.kind === 'pot' && item.destination.potId === 'bills')).toBe(true)
  expect(bills.filter(item => item.frequency === 'monthly').map(item => [item.name, item.bill!.paidBy, item.bill!.cardId ?? null, item.bill!.day])).toEqual([
    ['Council tax', 'direct-debit', null, 1], ['Electricity', 'direct-debit', null, 18], ['Streamflix', 'card', 'amex', 2],
    ['Water', 'direct-debit', null, 5], ['Broadband', 'direct-debit', null, 22], ['Mobile plans', 'card', null, 9],
  ])
  expect(bills.filter(item => item.frequency === 'annually').map(item => [item.name, item.bill!.paidBy, item.bill!.cardId ?? null, item.bill!.day, item.bill!.month])).toEqual([
    ['Home insurance', 'direct-debit', null, 12, 1], ['Car insurance', 'direct-debit', null, 3, 3],
    ['Breakdown cover', 'card', 'amex', 6, 12], ['TV licence', 'direct-debit', null, 1, 4],
  ])
  // The yearly bills keep their monthly amount, so the plan's totals above are unchanged.
  expect(bills.filter(item => item.frequency === 'annually').every(item => item.entryAmountPence === item.amountPence * 12)).toBe(true)
})
