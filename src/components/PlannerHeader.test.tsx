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

it('offers the same Plan, Transfers and Household destinations in the desktop sidebar as on the phone', () => {
  const selectBudgetView = vi.fn(), selectView = vi.fn()
  render(<PlannerHeader currentView="budget" budgetView="transfers" setupComplete onSelectView={selectView} onSelectBudgetView={selectBudgetView} />)
  const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  const phone = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
  const labels = sidebar.getAllByRole('button').map(button => button.getAttribute('aria-label'))
  expect(labels).toEqual(['Plan', 'Transfers', 'Household'])
  expect(phone.getAllByRole('button').map(button => button.textContent)).toEqual(labels)
  expect(sidebar.getByRole('button', { name: 'Transfers' })).toHaveAttribute('aria-current', 'page')
  expect(sidebar.getByRole('button', { name: 'Plan' })).not.toHaveAttribute('aria-current')
  fireEvent.click(sidebar.getByRole('button', { name: 'Plan' }))
  expect(selectBudgetView).toHaveBeenCalledWith('plan')
  fireEvent.click(sidebar.getByRole('button', { name: 'Household' }))
  expect(selectView).toHaveBeenCalledWith('household')
})
