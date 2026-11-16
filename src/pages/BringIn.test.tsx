// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { importAmexExport, readAmexExport } from '../domain/amexImport'
import { decodeBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { BringInSheet } from './BringInSheet'
import { Home } from './Home'
import { monthHeads } from './spendingFormat'
import { Spending } from './Spending'

afterEach(cleanup)

const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const sample = () => new Uint8Array(readFileSync(resolve(process.cwd(), 'docs/fixtures/amex-export-sample.xlsx')))
const NOW = new Date('2026-11-12T09:00:00Z')

function Sheet({ initial }: { initial: BudgetDocument }) {
  const [document, setDocument] = useState(initial)
  return <BringInSheet document={document} setDocument={setDocument} onClose={() => {}} onSort={() => {}} now={() => NOW}/>
}

it('the Bring in result says where the rows went, which are an earlier month’s, how the month moved and the bill', async () => {
  render(<Sheet initial={seed()}/>)
  fireEvent.change(screen.getByLabelText('Choose the Excel file'), { target: { files: [new File([sample()], 'activity.xlsx')] } })
  await waitFor(() => expect(screen.getByText('activity.xlsx')).toBeInTheDocument())
  const dialog = screen.getByRole('dialog', { name: 'Bring in transactions' })
  // The sample runs from 25 Oct, so some rows are October's.
  expect(within(dialog).getByText('Earlier months')).toBeInTheDocument()
  expect(within(dialog).getByText(/are October’s\. They count in their own month\./)).toBeInTheDocument()
  expect(within(dialog).getByText('November bill so far')).toBeInTheDocument()
})

it('Home shows "Just brought in" between the verdict and To do, and it goes after three days', async () => {
  const parsed = await readAmexExport(sample())
  const document = importAmexExport(seed(), seed().card!.cards[0]!.id, parsed, 'activity.xlsx', NOW).document
  const onOpen = vi.fn()
  const { rerender } = render(<Home document={document} setDocument={vi.fn()} month="2026-11" today="2026-11-12" onOpen={onOpen}/>)
  const card = screen.getByRole('region', { name: 'Just brought in' })
  expect(card).toHaveTextContent('Thu 12 Nov')
  expect(card).toHaveTextContent('to sort')
  const verdict = screen.getByRole('region', { name: 'How November is going' })
  const todo = screen.getByRole('heading', { name: /^To do/ })
  expect(verdict.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(card.compareDocumentPosition(todo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(card).getByRole('button', { name: /^Sort \d+ transactions?$/ }))
  expect(onOpen).toHaveBeenCalledWith({ view: 'spending', section: 'sort' })
  rerender(<Home document={document} setDocument={vi.fn()} month="2026-11" today="2026-11-15" onOpen={onOpen}/>)
  expect(screen.queryByRole('region', { name: 'Just brought in' })).not.toBeInTheDocument()
})

it('To sort lists earlier-month rows under their own month, only when there is more than one', async () => {
  const parsed = await readAmexExport(sample())
  const document = importAmexExport(seed(), seed().card!.cards[0]!.id, parsed, 'activity.xlsx', NOW).document
  render(<Spending document={document} setDocument={vi.fn()} view="sort" onSelectView={() => {}} onOpenCardSettings={() => {}} onOpenMonth={() => {}} today="2026-11-12"/>)
  const list = screen.getByRole('list', { name: 'To sort' })
  const heads = [...list.querySelectorAll('.spending-month-head')].map(node => node.textContent)
  expect(heads).toEqual(['November', 'October · earlier month'])
})

it('monthHeads: no headings for one month; a heading where each month starts', () => {
  const rows = [{ id: 'a', date: '2026-11-10' }, { id: 'b', date: '2026-11-02' }, { id: 'c', date: '2026-10-28' }]
  expect(monthHeads(rows.slice(0, 2), '2026-11-12').size).toBe(0)
  expect([...monthHeads(rows, '2026-11-12')]).toEqual([['a', { month: '2026-11', name: 'November', earlier: false }], ['c', { month: '2026-10', name: 'October', earlier: true }]])
})
