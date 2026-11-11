// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

it.each([
  ['Saving…', 'Saving…', '◌'],
  ['Unsaved changes', 'Unsaved changes', '◌'],
  ['Loading budget…', 'Loading…', '◌'],
  ['Choose a version', 'Choose a version', '!'],
  ['Not saved', 'Save failed', '!'],
])('shows a status only when it isn’t Saved: %s', (saveStatus, label, mark) => {
  render(<PlannerHeader currentView="budget" budgetView="plan" setupComplete saveStatus={saveStatus} onSelectView={() => {}} onSelectBudgetView={() => {}} />)
  expect(screen.getByRole('button', { name: 'Account and save status' })).toHaveTextContent(mark)
  expect(document.querySelector('.sidebar-status')).toHaveAttribute('aria-label', label)
})

it('shows no status mark when saved, but the sheet still says Saved', () => {
  render(<PlannerHeader currentView="budget" budgetView="plan" setupComplete saveStatus="Saved" onSelectView={() => {}} onSelectBudgetView={() => {}} />)
  const trigger = screen.getByRole('button', { name: 'Account and save status' })
  expect(trigger.textContent).toBe('')
  expect(document.querySelector('.sidebar-status')).toBeNull()
  fireEvent.click(trigger)
  expect(within(screen.getByRole('dialog', { name: 'Account and save status' })).getByText('Saved')).toBeInTheDocument()
})

it('offers the same Home, Plan, Spending, Transfers and Household destinations in the desktop sidebar as on the phone', () => {
  const selectBudgetView = vi.fn(), selectView = vi.fn()
  render(<PlannerHeader currentView="budget" budgetView="transfers" setupComplete onSelectView={selectView} onSelectBudgetView={selectBudgetView} />)
  const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  const phone = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
  const labels = sidebar.getAllByRole('button').map(button => button.getAttribute('aria-label'))
  expect(labels).toEqual(['Home', 'Plan', 'Spending', 'Transfers', 'Household'])
  expect(phone.getAllByRole('button').map(button => button.textContent)).toEqual(labels)
  expect(sidebar.getByRole('button', { name: 'Transfers' })).toHaveAttribute('aria-current', 'page')
  expect(sidebar.getByRole('button', { name: 'Plan' })).not.toHaveAttribute('aria-current')
  fireEvent.click(sidebar.getByRole('button', { name: 'Plan' }))
  expect(selectBudgetView).toHaveBeenCalledWith('plan')
  fireEvent.click(sidebar.getByRole('button', { name: 'Household' }))
  expect(selectView).toHaveBeenCalledWith('household')
  fireEvent.click(phone.getByRole('button', { name: 'Spending' }))
  expect(selectView).toHaveBeenCalledWith('spending')
})

it('pins only the header bar once its rows scroll away, keeping the header’s height so the page does not jump', () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180)
  try {
    render(<PlannerHeader currentView="household" budgetView="plan" setupComplete onSelectView={() => {}} onSelectBudgetView={() => {}} />)
    const header = document.querySelector<HTMLElement>('.mobile-app-header')!
    expect(header).not.toHaveClass('is-collapsed')
    // jsdom has no stylesheet, so the bar's safe-area padding reads as 0 and the pinned bar is one 48px row.
    scrollY.mockReturnValue(140)
    act(() => { window.dispatchEvent(new Event('scroll')) })
    expect(header).toHaveClass('is-collapsed')
    expect(header.style.height).toBe('180px')
    scrollY.mockReturnValue(120)
    act(() => { window.dispatchEvent(new Event('scroll')) })
    expect(header).not.toHaveClass('is-collapsed')
    expect(header.style.height).toBe('')
  } finally {
    height.mockRestore()
    scrollY.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('marks the current page in the phone nav with the icon pill', () => {
  render(<PlannerHeader currentView="budget" budgetView="transfers" setupComplete onSelectView={() => {}} onSelectBudgetView={() => {}} />)
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  const current = within(nav).getByRole('button', { name: 'Transfers' })
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(current.querySelector('.mobile-nav-icon')).toHaveAttribute('aria-hidden', 'true')
  expect(within(nav).getByRole('button', { name: 'Plan' })).not.toHaveAttribute('aria-current')
})
