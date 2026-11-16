// @vitest-environment jsdom
// Ticked steps are stored under keys; moving the rows onto StepRow must not change them, or saved ticks would be lost.
// The expected keys were recorded on main before StepRow (audit 3 PR 04) by ticking every step of the baseline fixture.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../../domain/budgetDocument'
import { MonthlyBudget } from '../../pages/MonthlyBudget'
import { Spending } from '../../pages/Spending'
import type { SpendingSection } from '../../state/navigation'
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear() })

const fixture = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(__dirname, '../../../docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const desktop = () => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
const tickEverything = () => { for (let round = 0; round < 3; round++) for (const tick of screen.queryAllByRole('button', { name: / done$/, pressed: false })) fireEvent.click(tick) }

function tickMonth(month: string, start: (document: BudgetDocument) => BudgetDocument = document => document) {
  desktop()
  let saved: BudgetDocument | undefined
  function Harness() {
    const [document, setDocument] = useState(() => start(fixture()))
    saved = document
    return <MonthlyBudget document={document} setDocument={setDocument} view="month" month={month}/>
  }
  render(<Harness/>)
  tickEverything()
  return Object.keys(saved!.ticks?.[month] ?? {}).sort()
}

it('stores November’s payday ticks under the same keys', () => {
  // A month already ticked under the per-person steps keeps them (P5): one of its old joint pot moves is ticked.
  expect(tickMonth('2026-11', document => ({ ...document, ticks: { '2026-11': { 'ada:move:bills': { amountPence: 51962, at: '2026-11-01T09:00:00.000Z' } } } }))).toEqual(PAYDAY_KEYS)
})

it('stores a new month’s payday ticks with the joint pot moves once for the household', () => {
  expect(tickMonth('2026-12')).toEqual(HOUSEHOLD_KEYS)
})

it('stores the October statement’s settle-up ticks under the same keys', () => {
  let saved: BudgetDocument | undefined
  function Harness() {
    const [document, setDocument] = useState(fixture)
    const [view, setView] = useState<SpendingSection>('statements')
    const [statement, setStatement] = useState<string | null>('amex:2026-10-24')
    saved = document
    return <Spending document={document} setDocument={setDocument} view={view} onSelectView={setView} onOpenCardSettings={() => {}} onOpenMonth={() => {}} statementKey={statement} onOpenStatement={setStatement} today="2026-11-12"/>
  }
  render(<Harness/>)
  // The steps are on the statement's page itself (audit 3 PR 14).
  tickEverything()
  expect(Object.keys(saved!.card?.statements['amex:2026-10-24']?.ticks ?? {}).sort()).toEqual(SETTLE_KEYS)
})

const PAYDAY_KEYS = ['ada:fund:ada', 'ada:fund:ben', 'ada:fund:joint', 'ada:fund:saving', 'ada:move:ada-spend', 'ada:move:bills', 'ada:move:emergency', 'ada:move:groceries', 'ada:move:holidays',
  'ben:fund:ada', 'ben:fund:ben', 'ben:fund:joint', 'ben:fund:saving', 'ben:move:ben-spend', 'ben:move:bills', 'ben:move:emergency', 'ben:move:groceries', 'ben:move:holidays']
// D6: the household layout's joint pot moves end in `:move:<potId>` like a person's, so balances read them unchanged.
const HOUSEHOLD_KEYS = ['ada:fund:ada', 'ada:fund:ben', 'ada:fund:joint', 'ada:fund:saving', 'ada:move:ada-spend',
  'ben:fund:ada', 'ben:fund:ben', 'ben:fund:joint', 'ben:fund:saving', 'ben:move:ben-spend',
  'household:move:bills', 'household:move:emergency', 'household:move:groceries', 'household:move:holidays']
const SETTLE_KEYS = ['settle:out:ada-spend', 'settle:out:ben-spend', 'settle:out:bills', 'settle:out:groceries', 'settle:out:holidays', 'settle:pay', 'settle:send:ada', 'settle:send:ben']
