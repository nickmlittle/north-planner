// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { checkBuffer } from '../domain/buffer'
import { Home } from './Home'
import { MonthPage } from './MonthPage'

afterEach(cleanup)

// jsdom has no matchMedia, so this is the phone layout.
const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const joint = { kind: 'account' as const, accountId: 'joint' }
const answer = () => window.document.getElementById('pot-try-answer')!.textContent
const home = (document: BudgetDocument, today = '2026-11-11') => render(<Home document={document} setDocument={vi.fn()} month="2026-11" today={today} onOpen={vi.fn()}/>)

it('Home opens Can we afford… with a pot and an amount, and answers without saving', () => {
  const document = seed()
  const before = JSON.stringify(document)
  home(document)
  fireEvent.click(screen.getByRole('button', { name: 'Can we afford…' }))
  const dialog = screen.getByRole('dialog', { name: 'Can we afford…' })
  const pots = within(dialog).getByLabelText('Which pot')
  expect([...(pots as HTMLSelectElement).options].map(option => option.text)).toContain('Groceries')
  fireEvent.change(pots, { target: { value: 'groceries' } })
  fireEvent.change(within(dialog).getByLabelText('Before you spend it'), { target: { value: '10' } })
  expect(answer()).toMatch(/^Yes\. £[\d,.]+ left for the last 19 days\./)
  expect(JSON.stringify(document)).toBe(before)
})

it('says the buffer covers an over pot, with its balance and when it was checked', () => {
  const document = checkBuffer(seed(), joint, 50000, new Date('2026-11-09T10:00:00Z'))
  home(document)
  fireEvent.click(screen.getByRole('button', { name: 'Can we afford…' }))
  fireEvent.change(screen.getByLabelText('Which pot'), { target: { value: 'groceries' } })
  fireEvent.change(screen.getByLabelText('Before you spend it'), { target: { value: '300' } })
  expect(answer()).toMatch(/^£[\d,.]+ over\..+, the buffer, covers it when November closes \(£500\.00, checked Mon 9 Nov/)
})

it('says how short the buffer is when it can’t cover it', () => {
  const document = checkBuffer(seed(), joint, 1000, new Date('2026-11-09T10:00:00Z'))
  home(document)
  fireEvent.click(screen.getByRole('button', { name: 'Can we afford…' }))
  fireEvent.change(screen.getByLabelText('Which pot'), { target: { value: 'groceries' } })
  fireEvent.change(screen.getByLabelText('Before you spend it'), { target: { value: '300' } })
  expect(answer()).toMatch(/the buffer, is £[\d,.]+ short of covering it \(£10\.00, checked Mon 9 Nov\)/)
})

it('names the month on an overlap day, once the next month’s pay has landed', () => {
  const document = seed()
  home(document, '2026-11-28')
  fireEvent.click(screen.getByRole('button', { name: 'Can we afford…' }))
  fireEvent.change(screen.getByLabelText('Which pot'), { target: { value: 'groceries' } })
  fireEvent.change(screen.getByLabelText('Before you spend it'), { target: { value: '5' } })
  expect(answer()).toMatch(/This counts in November\. December’s Groceries \(£[\d,.]+\) starts on Tue 1 Dec\.$/)
})

it('is not offered on Home for another month than this one', () => {
  render(<Home document={seed()} setDocument={vi.fn()} month="2026-10" today="2026-11-11" onOpen={vi.fn()}/>)
  expect(screen.queryByRole('button', { name: 'Can we afford…' })).not.toBeInTheDocument()
})

function MonthHarness({ initial, onChange }: { initial: BudgetDocument; onChange: (document: BudgetDocument) => void }) {
  const [document, setDocument] = useState(initial)
  return <MonthPage document={document} month="2026-11" onMonthChange={() => {}} payday={null} onOpenPot={() => {}} onSort={() => {}} today="2026-11-11"
    setDocument={update => setDocument(current => { const next = typeof update === 'function' ? update(current) : update; onChange(next); return next })}/>
}

it('Check balances has a row for a buffer that is an account’s main balance, and saves it as that account’s check (P9)', () => {
  let saved: BudgetDocument | undefined
  render(<MonthHarness initial={seed()} onChange={next => { saved = next }}/>)
  fireEvent.click(screen.getByRole('button', { name: 'More Month options' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Check balances' }))
  const dialog = screen.getByRole('dialog', { name: 'Check balances' })
  const row = within(dialog).getByLabelText(/main balance/)
  expect(row).toHaveAccessibleName(/Not checked yet$/)
  fireEvent.change(row, { target: { value: '500' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 balance' }))
  expect(saved!.card!.accounts!.joint!.checkedBalance!.pence).toBe(50000)
  expect(saved!.card!.pots).not.toHaveProperty('account:joint')
})
