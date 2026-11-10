// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AllocationMeter, AllocationMeterMini } from './AllocationMeter'

afterEach(cleanup)

it.each([
  { available: 834000, planned: 831700, text: '£23.00 left', state: 'is-surplus', now: '100' },
  { available: 650000, planned: 764187, text: '£1,141.87 over', state: 'is-deficit', now: '100' },
  { available: 500000, planned: 500000, text: 'Balanced', state: 'is-balanced', now: '100' },
  { available: 400000, planned: 100000, text: '£3,000.00 left', state: 'is-surplus', now: '25' },
])('leads with $text', ({ available, planned, text, state, now }) => {
  render(<AllocationMeter availablePence={available} plannedPence={planned} onEditIncome={() => {}}/>)
  const summary = screen.getByRole('region', { name: 'Plan summary' })
  expect(summary).toHaveClass(state)
  expect(summary.querySelector('.allocation-meter-balance')).toHaveTextContent(text)
  expect(screen.getByRole('meter', { name: 'Planned' })).toHaveAttribute('aria-valuenow', now)
})

it('fills the bar to the planned share, with a hatched end when over', () => {
  const { rerender } = render(<AllocationMeter availablePence={400000} plannedPence={100000} onEditIncome={() => {}}/>)
  expect(document.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe('25%')
  expect(screen.getByText('25% planned')).toBeVisible()
  expect(document.querySelector('.allocation-meter-over')).toBeNull()
  rerender(<AllocationMeter availablePence={650000} plannedPence={764187} onEditIncome={() => {}}/>)
  // Over: pine for the part available money covers, a hatched end for the rest.
  expect(document.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe(`${650000 / 764187 * 100}%`)
  expect(document.querySelector('.allocation-meter-over')).toBeInTheDocument()
  expect(screen.getByText('117.6% planned')).toBeVisible()
})

it('states planned of available with the basis, and the pencil edits income', () => {
  const edit = vi.fn()
  render(<AllocationMeter availablePence={834000} plannedPence={831700} basis="£7,940.00 salary + £400.00 other" onEditIncome={edit}/>)
  expect(document.querySelector('.allocation-meter-detail')).toHaveTextContent('£8,317.00 planned of £8,340.00 available(£7,940.00 salary + £400.00 other)')
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  expect(edit).toHaveBeenCalledOnce()
})

it('drops the share and basis when compact, and has no share without income', () => {
  render(<AllocationMeter compact availablePence={834000} plannedPence={831700} basis="all from salary" onEditIncome={() => {}}/>)
  expect(screen.queryByText(/% planned/)).not.toBeInTheDocument()
  expect(screen.queryByText(/all from salary/)).not.toBeInTheDocument()
  cleanup()
  render(<AllocationMeter availablePence={834000} plannedPence={831700} onEditIncome={() => {}}/>)
  expect(screen.getByText('99.7% planned')).toBeVisible()
  cleanup()
  render(<AllocationMeter availablePence={0} plannedPence={1000} onEditIncome={() => {}}/>)
  expect(screen.queryByText(/% planned/)).not.toBeInTheDocument()
  expect(screen.getByRole('meter', { name: 'Planned' })).toHaveAttribute('aria-valuetext', 'No income yet')
})

const nick = { personId: 'nick', name: 'Nick', availablePence: 390000, plannedPence: 341132 }
const immy = { personId: 'immy', name: 'Immy', availablePence: 260000, plannedPence: 278722 }

it('leads with whoever is over, one bar each, and the household on its own line', () => {
  const review = vi.fn()
  render(<AllocationMeter availablePence={650000} plannedPence={619854} people={[nick, immy]} onReview={review} onEditIncome={() => {}}/>)
  const summary = screen.getByRole('region', { name: 'Plan summary' })
  expect(summary).toHaveClass('is-deficit')
  expect(summary.querySelector('.allocation-meter-balance')).toHaveTextContent('Immy is £187.22 over')
  const rows = screen.getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Nick£488.68 left£3,411.32 planned of £3,900.00 available')
  expect(rows[1]).toHaveTextContent('Immy£187.22 over£2,787.22 planned of £2,600.00 available')
  expect(rows[1]).toHaveClass('is-over')
  expect(rows[1]!.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe(`${260000 / 278722 * 100}%`)
  expect(rows[1]!.querySelector('.allocation-meter-over')).toBeInTheDocument()
  expect(rows[0]!.querySelector('.allocation-meter-over')).toBeNull()
  expect(summary.querySelector('.allocation-meter-household')).toHaveTextContent('Household£6,198.54 planned of £6,500.00£301.46 left')
  expect(summary).toHaveTextContent('Nick’s £488.68 left covers Immy’s £187.22.')
  fireEvent.click(screen.getByRole('button', { name: 'Review Immy’s items' }))
  expect(review).toHaveBeenCalledWith('immy')
})

it.each([
  { people: [{ ...nick, plannedPence: 348800 }, { ...immy, plannedPence: 251360 }], headline: '£498.40 left', hint: 'Everyone’s planned spending fits.', mini: '£498.40 left' },
  { people: [{ ...nick, plannedPence: 402000 }, { ...immy, plannedPence: 284000 }], headline: 'You’re both over', hint: 'The household plan is £360.00 more than what’s available.', mini: 'Both over · £360.00' },
])('reads $headline when nobody or everybody is over', ({ people, headline, hint, mini }) => {
  const planned = people.reduce((sum, person) => sum + person.plannedPence, 0)
  render(<><AllocationMeter availablePence={650000} plannedPence={planned} people={people}/><AllocationMeterMini availablePence={650000} plannedPence={planned} people={people}/></>)
  expect(document.querySelector('.allocation-meter-balance')).toHaveTextContent(headline)
  expect(screen.getByRole('region', { name: 'Plan summary' })).toHaveTextContent(hint)
  expect(document.querySelector('.allocation-meter-mini-balance')).toHaveTextContent(mini)
})

it('docks the worst figure in the mini meter, with a bar per person', () => {
  render(<AllocationMeterMini availablePence={650000} plannedPence={619854} people={[nick, immy]}/>)
  expect(document.querySelector('.allocation-meter-mini')).toHaveClass('is-deficit')
  expect(document.querySelector('.allocation-meter-mini-balance')).toHaveTextContent('Immy £187.22 over')
  expect(document.querySelectorAll('.allocation-meter-mini-person')).toHaveLength(2)
})
