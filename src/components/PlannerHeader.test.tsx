// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PlannerHeader } from './PlannerHeader'

afterEach(cleanup)

it('keeps save failures visible and exposes account actions in the utility sheet', () => {
  const signOut = vi.fn()
  render(<PlannerHeader currentView="month" setupComplete warning="The latest changes could not be saved to cloud storage." saveStatus="Unsaved changes" email="person@example.com" onSignOut={signOut} onSelectView={() => {}} />)
  // Cloud saves get the page's own Notice (App); the header keeps the status in its account button.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }))
  const sheet = screen.getByRole('dialog', { name: 'Account and settings' })
  expect(within(sheet).getByText('Save failed')).toBeInTheDocument()
  expect(within(sheet).getByText('The latest changes could not be saved to cloud storage.')).toBeInTheDocument()
  expect(within(sheet).getByText('person@example.com')).toBeInTheDocument()
  fireEvent.click(within(sheet).getByRole('button', { name: 'Sign out' }))
  expect(signOut).toHaveBeenCalledOnce()
  cleanup()
  render(<PlannerHeader currentView="month" setupComplete warning="Your browser storage is full." saveStatus="Saved" onSelectView={() => {}}/>)
  expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
})

it.each([
  ['Saving…', 'Saving…', '◌'],
  ['Unsaved changes', 'Unsaved changes', '◌'],
  ['Loading budget…', 'Loading…', '◌'],
  ['Choose a version', 'Choose a version', '!'],
  ['Not saved', 'Save failed', '!'],
])('shows a status only when it isn’t Saved: %s', (saveStatus, label, mark) => {
  render(<PlannerHeader currentView="plan" setupComplete saveStatus={saveStatus} onSelectView={() => {}} />)
  expect(screen.getByRole('button', { name: 'Account and settings' })).toHaveTextContent(mark)
  expect(document.querySelector('.sidebar-status')).toHaveAttribute('aria-label', label)
})

it('shows no status mark when saved, but the sheet still says Saved', () => {
  render(<PlannerHeader currentView="plan" setupComplete saveStatus="Saved" onSelectView={() => {}} />)
  const trigger = screen.getByRole('button', { name: 'Account and settings' })
  expect(trigger.textContent).toBe('')
  expect(document.querySelector('.sidebar-status')).toBeNull()
  fireEvent.click(trigger)
  expect(within(screen.getByRole('dialog', { name: 'Account and settings' })).getByText('Saved')).toBeInTheDocument()
})

it('offers Home, Month, Plan and Spending in the sidebar and on the phone, with Settings at the sidebar foot', () => {
  const selectView = vi.fn()
  render(<PlannerHeader currentView="month" setupComplete counts={{ spending: 4 }} onSelectView={selectView} />)
  const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  const phone = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
  expect(sidebar.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Home', 'Month', 'Plan', 'Spending, 4 to sort', 'Search North', 'Settings'])
  expect(phone.getAllByRole('button').map(button => button.textContent)).toEqual(['Home', 'Month', 'Plan', 'Spending'])
  expect(phone.getByRole('button', { name: 'Spending, 4 to sort' })).toBeInTheDocument()
  expect(sidebar.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
  expect(sidebar.getByRole('button', { name: 'Plan' })).not.toHaveAttribute('aria-current')
  fireEvent.click(sidebar.getByRole('button', { name: 'Plan' }))
  expect(selectView).toHaveBeenCalledWith('plan')
  fireEvent.click(sidebar.getByRole('button', { name: 'Settings' }))
  expect(selectView).toHaveBeenCalledWith('settings')
  fireEvent.click(phone.getByRole('button', { name: /^Spending/ }))
  expect(selectView).toHaveBeenCalledWith('spending')
})

it('offers only Settings until setup is done', () => {
  render(<PlannerHeader currentView="settings" setupComplete={false} onSelectView={() => {}} />)
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Settings'])
  expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
})

it.each(['home', 'month', 'plan', 'spending', 'settings'] as const)('keeps the account button top right on %s, opening Settings, save status and Sign out', view => {
  const selectView = vi.fn(), signOut = vi.fn()
  render(<PlannerHeader currentView={view} setupComplete saveStatus="Saved" email="ada@example.com" onSignOut={signOut} onSelectView={selectView} />)
  const bar = document.querySelector('.mobile-header-bar')!
  expect(bar.lastElementChild).toHaveAccessibleName('Account and settings')
  fireEvent.click(within(bar as HTMLElement).getByRole('button', { name: 'Account and settings' }))
  const sheet = within(screen.getByRole('dialog', { name: 'Account and settings' }))
  expect(sheet.getByText('Saved')).toBeInTheDocument()
  expect(sheet.getByText('ada@example.com')).toBeInTheDocument()
  fireEvent.click(sheet.getByRole('button', { name: 'Settings' }))
  expect(selectView).toHaveBeenCalledWith('settings')
  expect(screen.queryByRole('dialog', { name: 'Account and settings' })).not.toBeInTheDocument()
})

it('expands the sidebar on wide windows unless someone collapsed it, and remembers the toggle', () => {
  const media = (wide: boolean) => vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('1280') ? wide : false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  try {
    localStorage.removeItem('north.sidebar')
    media(true)
    const { unmount } = render(<PlannerHeader currentView="home" setupComplete onSelectView={() => {}} />)
    const toggle = () => screen.getByRole('button', { name: /sidebar$/ })
    expect(document.querySelector('.planner-sidebar')).toHaveClass('desktop-expanded')
    expect(toggle()).toHaveAccessibleName('Collapse sidebar')
    fireEvent.click(toggle())
    expect(document.querySelector('.planner-sidebar')).not.toHaveClass('desktop-expanded')
    expect(localStorage.getItem('north.sidebar')).toBe('collapsed')
    unmount()
    render(<PlannerHeader currentView="home" setupComplete onSelectView={() => {}} />)
    expect(document.querySelector('.planner-sidebar')).not.toHaveClass('desktop-expanded')
    cleanup()
    localStorage.removeItem('north.sidebar')
    media(false)
    render(<PlannerHeader currentView="home" setupComplete onSelectView={() => {}} />)
    expect(document.querySelector('.planner-sidebar')).not.toHaveClass('desktop-expanded')
    fireEvent.click(toggle())
    expect(document.querySelector('.planner-sidebar')).toHaveClass('desktop-expanded')
    expect(localStorage.getItem('north.sidebar')).toBe('expanded')
  } finally { vi.unstubAllGlobals(); localStorage.removeItem('north.sidebar') }
})

it('pins only the header bar once its rows scroll away, keeping the header’s height so the page does not jump', () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180)
  try {
    render(<PlannerHeader currentView="settings" setupComplete onSelectView={() => {}} />)
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
  render(<PlannerHeader currentView="month" setupComplete onSelectView={() => {}} />)
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  const current = within(nav).getByRole('button', { name: 'Month' })
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(current.querySelector('.mobile-nav-icon')).toHaveAttribute('aria-hidden', 'true')
  expect(within(nav).getByRole('button', { name: 'Plan' })).not.toHaveAttribute('aria-current')
})
