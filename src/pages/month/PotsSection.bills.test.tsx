// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../../domain/budgetDocument'
import { PotsSection } from './PotsSection'
import { PotDetail } from '../SpendingMonth'

afterEach(cleanup)

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const TODAY = '2026-11-11'

it('shows what’s due on a pot with bills, and on a monthly pot as part of Left', () => {
  const document: BudgetDocument = seed()
  // A veg box by direct debit on the 20th, in the steady Groceries pot.
  for (const snapshot of Object.values(document.budget.snapshots)) snapshot.items = [...snapshot.items, { ...snapshot.items[0]!, id: 'veg', name: 'Veg box', entryAmountPence: 3000, amountPence: 3000, funding: 'equal', bill: { paidBy: 'direct-debit', day: 20 } }]
  render(<PotsSection document={document} month="2026-11" today={TODAY} onOpenPot={() => {}}/>)
  // Bills: electricity and broadband are still to come.
  expect(screen.getByRole('button', { name: /^Bills · carries over: .+ free\. £154\.17 due this month$/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Groceries: .+ left\. .+ · £30\.00 of it due$/ })).toBeInTheDocument()
})

it('shows the bills paid and still due in how a pot’s balance is worked out', () => {
  render(<PotDetail document={seed()} setDocument={() => {}} potId="bills" month="2026-11" today={TODAY} onBack={() => {}}/>)
  const sums = [...window.document.body.querySelectorAll('.carry-over-sums > div')].map(row => row.textContent)
  expect(sums).toContain('Bills paid since−£234.82')
  expect(sums).toContain('Bills still due this month−£154.17')
  expect(sums.some(row => row?.startsWith('Free'))).toBe(true)
})
