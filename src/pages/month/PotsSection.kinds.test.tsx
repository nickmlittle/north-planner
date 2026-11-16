// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../../domain/budgetDocument'
import { savePotKind } from '../../domain/potKinds'
import { pickerPace } from '../sortPace'
import { PotsSection } from './PotsSection'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const TODAY = '2026-11-11'
const potId = (document: BudgetDocument, name: string, owner?: string) => document.budget.pots.find(pot => pot.name === name && (!owner || document.budget.accounts.find(account => account.id === pot.accountId)?.ownerPersonIds.includes(owner)))!.id
const headings = () => [...window.document.querySelectorAll('.pots-card-title')].map(heading => heading.textContent)

it('groups Month › Pots by kind on a phone, with a Funded only pot leading on what was moved in', () => {
  const document = seed()
  render(<PotsSection document={document} month="2026-11" today={TODAY} onOpenPot={() => {}}/>)
  expect(headings()).toEqual(expect.arrayContaining(['Tracked', 'Funded only']))
  expect(headings().indexOf('Tracked')).toBeLessThan(headings().indexOf('Funded only'))
  const funded = within(screen.getByRole('region', { name: 'Funded only' }))
  // One row per person's Spending pot, named with its account, leading on the plan and then the Amex spend. No Left.
  const rows = funded.getAllByRole('button')
  expect(rows).toHaveLength(2)
  for (const row of rows) {
    expect(row.getAttribute('aria-label')).toMatch(/^Spending · .+: £[\d,.]+ moved in\. (£[\d,.]+ on the Amex|Nothing on the Amex)$/)
    expect(row).not.toHaveTextContent(/left|over|ahead|pace/i)
  }
})

it('counts Tracked pots only in the Pots header, not Bills or a person’s own pot (D4)', () => {
  const document = seed()
  render(<PotsSection document={document} month="2026-11" today={TODAY} onOpenPot={() => {}}/>)
  const tracked = within(screen.getByRole('region', { name: 'Tracked' })).getAllByRole('button').length
  expect(tracked).toBeGreaterThan(0)
  expect(screen.getByRole('heading', { level: 2, name: /^Pots£[\d,.]+ spent of £[\d,.]+$/ })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Funded only' })!.textContent).not.toContain('Groceries')
})

it('moves a pot to another group when its kind is chosen, and says so in the sort sheet', () => {
  const document = seed()
  const spending = potId(document, 'Spending', 'ada')
  const asPicker = (doc: BudgetDocument, id: string) => pickerPace(doc, '2026-11', TODAY)({ kind: 'pot', potId: id })
  expect(asPicker(document, spending)).toEqual({ text: 'Funded only' })
  const tracked = savePotKind(document, spending, 'tracked')
  expect(asPicker(tracked, spending).text).toMatch(/left|nothing planned|over/)
  expect(asPicker(savePotKind(document, spending, 'saving'), spending)).toEqual({ text: 'Saving' })
  render(<PotsSection document={tracked} month="2026-11" today={TODAY} onOpenPot={() => {}}/>)
  expect(within(screen.getByRole('region', { name: 'Tracked' })).getAllByRole('button').some(row => /^Spending · /.test(row.getAttribute('aria-label') ?? ''))).toBe(true)
})
