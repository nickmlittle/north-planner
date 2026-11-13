// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AllocationMeter, AllocationMeterMini } from './AllocationMeter'

afterEach(cleanup)

it.each([
  { available: 834000, planned: 831700, text: '£23.00 left', state: 'is-surplus', now: '100', over: false },
  { available: 650000, planned: 764187, text: '£1,141.87 over', state: 'is-deficit', now: '100', over: true },
  { available: 500000, planned: 500000, text: 'Balanced', state: 'is-balanced', now: '100', over: false },
  { available: 400000, planned: 100000, text: '£3,000.00 left', state: 'is-surplus', now: '25', over: false },
])('leads with the figure: $text', ({ available, planned, text, state, now, over }) => {
  render(<AllocationMeter availablePence={available} plannedPence={planned} onEditIncome={() => {}}/>)
  const summary = screen.getByRole('region', { name: 'Plan summary' })
  expect(summary).toHaveClass(state)
  const balance = summary.querySelector('.allocation-meter-balance')!
  expect(balance).toHaveTextContent(text)
  // Red only on an amount that's over.
  expect(balance.classList.contains('is-over')).toBe(over)
  expect(screen.getByRole('meter', { name: 'Planned' })).toHaveAttribute('aria-valuenow', now)
})

it('fills the bar to the planned share, with a hatched end when over', () => {
  const { rerender } = render(<AllocationMeter availablePence={400000} plannedPence={100000} onEditIncome={() => {}}/>)
  expect(document.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe('25%')
  expect(screen.getByText('£1,000.00 planned of £4,000.00 · 25%')).toBeVisible()
  expect(document.querySelector('.allocation-meter-over')).toBeNull()
  rerender(<AllocationMeter availablePence={650000} plannedPence={764187} onEditIncome={() => {}}/>)
  expect(document.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe(`${650000 / 764187 * 100}%`)
  expect(document.querySelector('.allocation-meter-over')).toBeInTheDocument()
})

it('shows Available with its basis only when it isn’t all salary, and Edit income', () => {
  const edit = vi.fn()
  render(<AllocationMeter availablePence={834000} plannedPence={831700} basis="£7,940.00 salary + £400.00 other" onEditIncome={edit}/>)
  expect(screen.getByText('Available £8,340.00')).toBeVisible()
  expect(document.querySelector('.allocation-meter-basis')).toHaveTextContent('£7,940.00 salary + £400.00 other')
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  expect(edit).toHaveBeenCalledOnce()
  cleanup()
  render(<AllocationMeter availablePence={834000} plannedPence={831700} basis="all from salary" onEditIncome={() => {}}/>)
  expect(screen.queryByText(/from salary/)).not.toBeInTheDocument()
})

it('keeps phones to one line and a bar, with no share and no basis', () => {
  render(<AllocationMeter compact availablePence={834000} plannedPence={831700} basis="£7,940.00 salary + £400.00 other" onEditIncome={() => {}}/>)
  expect(document.querySelector('.allocation-meter-line')).toHaveTextContent('£23.00 left£8,317.00 of £8,340.00')
  expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  expect(screen.queryByText(/salary/)).not.toBeInTheDocument()
  cleanup()
  render(<AllocationMeter availablePence={0} plannedPence={1000} onEditIncome={() => {}}/>)
  expect(screen.getByRole('meter', { name: 'Planned' })).toHaveAttribute('aria-valuetext', 'No income yet')
})

const nick = { personId: 'nick', name: 'Nick', availablePence: 390000, plannedPence: 341132 }
const immy = { personId: 'immy', name: 'Immy', availablePence: 260000, plannedPence: 278722 }

it('shows the household figure, one bar per person with their own figure, and reviews whoever is over', () => {
  const review = vi.fn()
  render(<AllocationMeter availablePence={650000} plannedPence={619854} people={[nick, immy]} onReview={review} onEditIncome={() => {}}/>)
  const summary = screen.getByRole('region', { name: 'Plan summary' })
  expect(summary).toHaveClass('is-deficit')
  expect(summary.querySelector('.allocation-meter-balance')).toHaveTextContent('£301.46 left')
  expect(summary).not.toHaveTextContent(/is £|both over|covers/)
  const rows = within(summary).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Nick£488.68 left')
  expect(rows[1]).toHaveTextContent('Immy£187.22 over')
  expect(rows[1]).toHaveClass('is-over')
  expect(within(rows[1]!).getByRole('meter', { name: 'Immy: £2,787.22 planned of £2,600.00 available' })).toBeInTheDocument()
  expect(rows[1]!.querySelector('.allocation-meter-over')).toBeInTheDocument()
  expect(rows[0]!.querySelector('.allocation-meter-over')).toBeNull()
  expect(screen.getByText('Available £3,900.00 + £2,600.00')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Review Immy’s items' }))
  expect(review).toHaveBeenCalledWith('immy')
})

it.each([
  { people: [{ ...nick, plannedPence: 348800 }, { ...immy, plannedPence: 251360 }], balance: '£498.40 left', mini: '£498.40 left' },
  { people: [{ ...nick, plannedPence: 402000 }, { ...immy, plannedPence: 284000 }], balance: '£360.00 over', mini: 'Both over · £360.00' },
])('reads $balance when nobody or everybody is over', ({ people, balance, mini }) => {
  const planned = people.reduce((sum, person) => sum + person.plannedPence, 0)
  render(<><AllocationMeter availablePence={650000} plannedPence={planned} people={people}/><AllocationMeterMini availablePence={650000} plannedPence={planned} people={people}/></>)
  expect(document.querySelector('.allocation-meter-balance')).toHaveTextContent(balance)
  expect(document.querySelector('.allocation-meter-mini-balance')).toHaveTextContent(mini)
})

it('docks the worst figure in the mini meter, with a bar per person', () => {
  render(<AllocationMeterMini availablePence={650000} plannedPence={619854} people={[nick, immy]}/>)
  expect(document.querySelector('.allocation-meter-mini')).toHaveClass('is-deficit')
  expect(document.querySelector('.allocation-meter-mini-balance')).toHaveTextContent('Immy £187.22 over')
  expect(document.querySelectorAll('.allocation-meter-mini-person')).toHaveLength(2)
})
