// @vitest-environment jsdom
// Month › Payday at the phone layout (jsdom has no matchMedia), on the household layout (D6, D7): each person's
// steps with one net transfer between them, then the joint pot moves once, by either of you.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useEffect, useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'
afterEach(() => { cleanup(); window.localStorage.clear(); window.sessionStorage.clear() })

/** Audit 4's household: pay lands in each person's own account, and Dining out has a joint Going out pot. */
function household() {
  const document = decodeBudgetDocument(JSON.parse(readFileSync(resolve(__dirname, '../../docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
  document.budget.pots.splice(2, 0, { id: 'going-out', name: 'Going out', accountId: 'joint' })
  for (const snapshot of Object.values(document.budget.snapshots)) for (const item of snapshot.items) if (item.name === 'Dining out') item.destination = { kind: 'pot', potId: 'going-out' }
  for (const source of document.budget.incomeSources) { source.baseAmountPence = source.personId === 'ada' ? 420000 : 350000; source.landsInAccountId = source.personId }
  return document
}
/** Month for one month, reporting each saved document. */
function Harness({ initial, month, onSave }: { initial: BudgetDocument; month: string; onSave?: (document: BudgetDocument) => void }) {
  const [document, setDocument] = useState(initial)
  useEffect(() => onSave?.(document), [document, onSave])
  return <MonthlyBudget document={document} setDocument={setDocument} view="month" month={month}/>
}
const steps = () => screen.getByRole('region', { name: 'Steps by person' })
const rows = (region: HTMLElement) => within(region).getAllByRole('listitem').map(row => row.textContent)

it('shows December’s 12 steps: one net transfer, and the joint pot moves once for either of you', () => {
  render(<Harness initial={household()} month="2026-12"/>)
  expect(screen.getByRole('heading', { name: 'Payday0 of 12' })).toBeInTheDocument()
  expect(within(steps()).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Ada0 of 4 · 3 to fund · 1 move', 'Ben0 of 3 · 2 to fund · 1 move', 'Either of you0 of 5 · 5 moves'])
  const ada = within(steps()).getByRole('region', { name: 'Ada steps' }), ben = within(steps()).getByRole('region', { name: 'Ben steps' })
  expect(rows(ada)).toContain('Starling Ada → Nationwide Ben£294.64£810.74 less Ben’s £516.10Ben moves £810.74 into Spending')
  // Ben's side is folded into Ada's transfer: shown, copyable, but not a step to tick.
  const netted = rows(ben).find(row => row?.includes('netted'))
  expect(netted).toBe('Nationwide Ben → Starling Ada: netted with Ada’s£516.10Ada sends the £294.64 difference insteadAda moves £516.10 into Spending')
  expect(within(ben).queryByRole('button', { name: /netted with Ada’s done/ })).not.toBeInTheDocument()
  const either = within(steps()).getByRole('region', { name: 'Either of you steps' })
  expect(rows(either)).toEqual([
    'Move to Bills£965.58Ada’s £488.93 and Ben’s £476.65', 'Move to Groceries£325.47Ada’s £162.74 and Ben’s £162.73',
    'Move to Going out£251.77Ada’s £151.06 and Ben’s £100.71', 'Move to Holidays£1,586.36Ada’s £940.81 and Ben’s £645.55',
    'Move to Emergency£1,237.46Ada’s £518.98 and Ben’s £718.48',
  ])
  expect(within(either).getByText('£4,366.64 into joint pots, once you’ve both sent your money')).toBeInTheDocument()
})

it('ticks a joint pot move once for the household, and keeps the household card whoever this phone shows', () => {
  let saved: BudgetDocument | undefined
  render(<Harness initial={household()} month="2026-12" onSave={document => { saved = document }}/>)
  fireEvent.click(within(screen.getByRole('group', { name: 'Whose steps' })).getByRole('button', { name: /^Ben/ }))
  expect(within(steps()).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Ben0 of 3 · 2 to fund · 1 move', 'Either of you0 of 5 · 5 moves'])
  // Ben's 3 and the household's 5.
  expect(screen.getByRole('heading', { name: 'Payday0 of 8' })).toBeInTheDocument()
  fireEvent.click(within(steps()).getByRole('button', { name: 'Move to Groceries done' }))
  expect(saved!.ticks?.['2026-12']).toEqual({ 'household:move:groceries': { amountPence: 32547, at: expect.any(String) } })
  expect(screen.getByRole('heading', { name: 'Payday1 of 8' })).toBeInTheDocument()
})

it('keeps November on its per-person steps once one of them is ticked (P5)', () => {
  const document = household()
  document.ticks = { '2026-11': { 'ada:move:groceries': { amountPence: 16274, at: '2026-10-28T09:00:00.000Z' } } }
  render(<Harness initial={document} month="2026-11"/>)
  expect(within(steps()).queryByRole('region', { name: 'Either of you steps' })).not.toBeInTheDocument()
  expect(rows(within(steps()).getByRole('region', { name: 'Ben steps' }))).toContain('Nationwide Ben → Starling Ada£516.10Ada moves it into Spending')
})
