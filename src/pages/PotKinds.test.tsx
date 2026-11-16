// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { decodeBudgetDocument } from '../domain/budgetDocument'
import { savePotKind } from '../domain/potKinds'
import { PotDetail } from './SpendingMonth'

afterEach(cleanup)

// jsdom has no matchMedia, so this is the phone layout.
const seed = () => decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))!
const TODAY = '2026-11-11'
const page = (document: ReturnType<typeof seed>, potId: string, today = TODAY) => render(<PotDetail document={document} setDocument={() => {}} potId={potId} month="2026-11" today={today} onBack={() => {}}/>)
const tryAmount = (value: string) => fireEvent.change(screen.getByLabelText('Before you spend it'), { target: { value } })
const answer = () => window.document.getElementById('pot-try-answer')!.textContent

it('a Tracked pot shows This week and a typical shop under its Left (P3, P4)', () => {
  page(seed(), 'groceries')
  expect(screen.getByText('This week').parentElement).toHaveTextContent(/^This week £\d[\d,.]+ · to Sun 15 Nov$/)
  expect(screen.getByText(/^A typical shop is £\d/)).toHaveTextContent(/average of \d+/)
})

it('switches to This weekend from Friday, and shows £0.00 for a pot that is over (P3)', () => {
  page(seed(), 'groceries', '2026-11-13')
  expect(screen.getByText('This weekend')).toBeInTheDocument()
  cleanup()
  const over = seed()
  over.card!.transactions.push({ ...over.card!.transactions.find(row => row.sort?.lines[0]?.destination.kind === 'pot' && row.date.startsWith('2026-11'))!, id: 'big', amountPence: 90000, sort: { lines: [{ amountPence: 90000, destination: { kind: 'pot', potId: 'groceries' } }], by: 'person', at: 'x' } })
  page(over, 'groceries')
  expect(screen.getByText('This week').parentElement).toHaveTextContent(/^This week £0\.00 · nothing to spend$/)
})

it('Try an amount answers yes or over and saves nothing (affordCheck)', () => {
  const document = seed()
  const before = JSON.stringify(document)
  page(document, 'groceries')
  expect(answer()).toBe('Nothing is saved.')
  tryAmount('10')
  expect(answer()).toMatch(/^Yes\. £[\d,.]+ left for the last 19 days\./)
  tryAmount('5000')
  expect(answer()).toMatch(/^£[\d,.]+ over\.Covered when November closes\./)
  tryAmount('abc')
  expect(answer()).toBe('Enter an amount, like 42.50.')
  expect(JSON.stringify(document)).toBe(before)
})

it('Try it fills the amount with a typical shop', () => {
  page(seed(), 'groceries')
  fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
  expect((screen.getByLabelText('Before you spend it') as HTMLInputElement).value).toMatch(/^\d+\.\d{2}$/)
  expect(answer()).toMatch(/^(Yes|£)/)
})

it('a Funded only pot leads with what payday moved in and its Amex spend, with no Left (D3)', () => {
  page(seed(), 'ada-spend')
  expect(screen.getByText('To move in on payday')).toBeInTheDocument()
  expect(screen.getByText(/on the Amex$/)).toBeInTheDocument()
  expect(screen.queryByText(/Left this month|Over this month|a day/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'In the pot' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check Starling' })).toBeInTheDocument()
  tryAmount('20')
  expect(answer()).toBe('Check Starling: North only sees what goes on the Amex.If it goes on the Amex, it moves to the Amex pot at your next move.')
})

it('a Funded only pot says moved in once payday’s Move is ticked', () => {
  const document = seed()
  document.ticks = { '2026-11': { 'ada:move:ada-spend': { amountPence: 113542, at: '2026-11-01T09:00:00.000Z' } } }
  page(document, 'ada-spend')
  expect(screen.getByText('Moved in on payday').nextElementSibling).toHaveTextContent('£1,135.42')
})

it('a Saving pot leads with Built up, with no pace and no Try an amount (D2)', () => {
  const document = savePotKind(seed(), 'holidays', 'saving')
  document.ticks = { '2026-11': { 'household:move:holidays': { amountPence: 158636, at: '2026-11-01T09:00:00.000Z' } } }
  page(document, 'holidays')
  expect(screen.getByText('Built up')).toBeInTheDocument()
  expect(screen.getByText('Put by November').nextElementSibling).toHaveTextContent('£1,586.36')
  expect(screen.queryByRole('heading', { name: 'Try an amount' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Left this month|Over this month/)).not.toBeInTheDocument()
})

it('lists Carried over by month and the last 3 months on a Tracked pot (D13)', () => {
  const document = seed()
  document.card!.months['2026-10'] = { closedAt: 'x', leftovers: { groceries: 5000 } }
  page(document, 'groceries')
  const carried = screen.getByLabelText('Carried over by month')
  expect(within(carried).getByText('October 2026').nextElementSibling).toHaveTextContent('£50.00')
  expect(screen.getByRole('heading', { name: /^Carried over/ })).toBeInTheDocument()
  const months = screen.getByRole('region', { name: 'Last 3 months' })
  expect(within(months).getByText('October 2026')).toBeInTheDocument()
  expect(months).toHaveTextContent(/£[\d,.]+ of £[\d,.]+/)
})

it('has no Carried over or Last 3 months with nothing to show', () => {
  const document = seed()
  document.card!.transactions = document.card!.transactions.filter(row => row.date.startsWith('2026-11'))
  page(document, 'groceries')
  expect(screen.queryByRole('heading', { name: /^Carried over/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Last 3 months' })).not.toBeInTheDocument()
})
