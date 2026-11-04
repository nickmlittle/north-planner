// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PlannerHeader } from './PlannerHeader'

afterEach(cleanup)

it('keeps save failures visible and exposes account actions in the utility sheet', () => {
  const signOut = vi.fn()
  render(<PlannerHeader currentView="budget" budgetView="transfers" setupComplete warning="The latest changes could not be saved to cloud storage." saveStatus="Unsaved changes" email="person@example.com" onSignOut={signOut} onSelectView={() => {}} onSelectBudgetView={() => {}} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
  fireEvent.click(screen.getByRole('button', { name: 'Account and save status' }))
  const sheet = screen.getByRole('dialog', { name: 'Account and save status' })
  expect(within(sheet).getByText('Save failed')).toBeInTheDocument()
  expect(within(sheet).getByText('The latest changes could not be saved to cloud storage.')).toBeInTheDocument()
  expect(within(sheet).getByText('person@example.com')).toBeInTheDocument()
  fireEvent.click(within(sheet).getByRole('button', { name: 'Sign out' }))
  expect(signOut).toHaveBeenCalledOnce()
})
