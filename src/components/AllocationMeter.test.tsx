// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AllocationMeter } from './AllocationMeter'

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

it('fills the bar to the planned share and clamps it when over', () => {
  const { rerender } = render(<AllocationMeter availablePence={400000} plannedPence={100000} onEditIncome={() => {}}/>)
  expect(document.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe('25%')
  expect(screen.getByText('25% planned')).toBeVisible()
  rerender(<AllocationMeter availablePence={650000} plannedPence={764187} onEditIncome={() => {}}/>)
  expect(document.querySelector<HTMLElement>('.allocation-meter-fill')!.style.width).toBe('100%')
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
