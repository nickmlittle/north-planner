// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { decodeBudgetDocument } from '../domain/budgetDocument'
import { potSum } from '../domain/potSum'
import { PotDetail } from './SpendingMonth'

afterEach(cleanup)

// jsdom has no matchMedia, so this is the phone layout.
const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const TODAY = '2026-11-11'
const sumRows = () => [...screen.getByLabelText('Groceries: in the pot').querySelectorAll(':scope > div')].map(row => row.textContent)

it('shows a Tracked pot’s sum, and asks for a check before it has In the pot (D2)', () => {
  const document = seed()
  delete document.card!.pots.groceries?.checkedBalance
  render(<PotDetail document={document} setDocument={() => {}} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}}/>)
  const sum = potSum(document, 'groceries', '2026-11', TODAY)
  expect(sumRows()[0]).toMatch(/^Left this month/)
  expect(sumRows().at(-1)).toBe('In the pot—')
  expect(sumRows().some(row => row?.startsWith('Waiting to move · November bill'))).toBe(sum.waitingPence !== 0)
  expect(screen.getByText(/^Not checked against Monzo yet/)).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Check against Monzo' }).length).toBeGreaterThan(1)
})

it('shows what doesn’t add up as Not explained, and the bank’s figure as checked (P1)', () => {
  const document = seed()
  const sum = potSum(document, 'groceries', '2026-11', TODAY)
  const parts = sum.leftPence! + sum.waitingPence + (sum.carriedOverPence ?? 0)
  // Checked today at £10 more than the parts: £10.00 not explained, and nothing has moved since.
  document.card!.pots.groceries = { ...document.card!.pots.groceries, checkedBalance: { pence: parts + 1000, at: new Date(`${TODAY}T23:00:00`).toISOString() } }
  render(<PotDetail document={document} setDocument={() => {}} potId="groceries" month="2026-11" today={TODAY} onBack={() => {}}/>)
  expect(sumRows()).toContain('Not explained£10.00')
  expect(sumRows().at(-1)).toMatch(/^In the pot£/)
  expect(screen.getByText(/^Checked against Monzo Wed 11 Nov/)).toBeInTheDocument()
})
