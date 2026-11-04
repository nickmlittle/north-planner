// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { budgetStorageKey } from './state/useBudgetDocument'
import { newBudgetDocument } from './domain/budgetDocument'

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, '', '/'); vi.unstubAllGlobals() })

async function completeSetup() {
  fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Alex household' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add an adult' }))
  fireEvent.change(screen.getByLabelText('Adult 1 name'), { target: { value: 'Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Budget' }))
  await screen.findByRole('heading', { name: 'Budget your month' })
}

it('starts with household setup and saves only the new budget key', async () => {
  localStorage.setItem('north.household.v2', '{"old":"data"}')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Budget' }))
  expect(screen.getByRole('alert')).toHaveTextContent('at least one adult')
  await completeSetup()
  expect(screen.getByRole('heading', { name: 'Budget your month' })).toBeVisible()
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!)).toMatchObject({ household: { name: 'Alex household', adults: [{ name: 'Alex' }] } })
  expect(localStorage.getItem('north.household.v2')).toBe('{"old":"data"}')
})

it('keeps the sidebar controls and routes between Household and Budget', async () => {
  render(<App />)
  await completeSetup()
  fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
  expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getAllByText('north.')).toHaveLength(1)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  fireEvent.click(within(nav).getByRole('button', { name: 'Household' }))
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  expect(window.location.search).toContain('view=household')
  fireEvent.click(within(nav).getByRole('button', { name: 'Budget' }))
  expect(await screen.findByRole('heading', { name: 'Budget your month' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')
})

it('keeps the selected mobile destination and month in the URL and browser history', async () => {
  render(<App />)
  await completeSetup()
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  const transfers = within(nav).getByRole('button', { name: 'Transfers' })
  const plan = within(nav).getByRole('button', { name: 'Plan' })
  expect(plan).toHaveAttribute('aria-current', 'page')
  const firstLength = window.history.length
  fireEvent.click(plan)
  expect(window.history.length).toBe(firstLength)
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  const selectedMonth = new URLSearchParams(window.location.search).get('month')
  expect(selectedMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
  fireEvent.click(transfers)
  expect(window.location.search).toContain('budgetView=transfers')
  expect(new URLSearchParams(window.location.search).get('month')).toBe(selectedMonth)
  expect(transfers).toHaveAttribute('aria-current', 'page')
  fireEvent.click(within(nav).getByRole('button', { name: 'Household' }))
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  fireEvent.click(transfers)
  expect(await screen.findByRole('heading', { name: 'Budget your month' })).toBeVisible()
  expect(transfers).toHaveAttribute('aria-current', 'page')
  expect(new URLSearchParams(window.location.search).get('month')).toBe(selectedMonth)
})

it('opens the mobile account and save status sheet and closes it with Escape', async () => {
  render(<App />)
  await completeSetup()
  const trigger = screen.getByRole('button', { name: 'Account and save status' })
  trigger.focus()
  fireEvent.click(trigger)
  const sheet = screen.getByRole('dialog', { name: 'Account and save status' })
  expect(within(sheet).getByText('Saved')).toBeVisible()
  expect(within(sheet).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(document.querySelector('.planner-app-shell')?.closest('[inert]')).not.toBeNull()
  fireEvent.keyDown(sheet, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Account and save status' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('maps removed page URLs to the retained screens', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=dashboard&settings=tax&budgetView=amex')
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Budget your month' })).toBeVisible()
  expect(screen.queryByText('Amex statement')).not.toBeInTheDocument()
})

it('opens direct Transfers URLs and keeps budget search mounted across tab changes', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  await screen.findByRole('heading', { name: 'Budget your month' })
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  expect(within(nav).getByRole('button', { name: 'Transfers' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'February 2026' })).toBeInTheDocument()
  fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
  const search = screen.getByPlaceholderText('Search budget')
  fireEvent.change(search, { target: { value: 'Groceries' } })
  fireEvent.click(within(nav).getByRole('button', { name: 'Transfers' }))
  fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
  expect(search).toHaveValue('Groceries')
  expect(screen.getByRole('button', { name: 'February 2026' })).toBeInTheDocument()
})

it('gates direct Budget URLs until household setup is complete', () => {
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  expect(within(nav).getByRole('button', { name: 'Transfers' })).toBeDisabled()
  expect(within(nav).getByRole('button', { name: 'Household' })).toHaveAttribute('aria-current', 'page')
})

it('preserves the saved check icon and removes the mobile drawer', async () => {
  render(<App />)
  await completeSetup()
  const saved = document.querySelector('.sidebar-status')!
  expect(saved.querySelector('path')?.getAttribute('d')).toBe('M20 6 9 17l-5-5')
  expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument()
  expect(document.querySelector('.mobile-sidebar-scrim')).toBeNull()
})

it('returns from an old settings URL to Budget through browser navigation', async () => {
  render(<App />)
  await completeSetup()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: 'Household' }))
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  window.history.replaceState(null, '', '/?view=settings&settings=tax')
  fireEvent(window, new PopStateEvent('popstate'))
  expect(await screen.findByRole('heading', { name: 'Budget your month' })).toBeVisible()
})

it('keeps budget ownership aligned after an adult name is edited', () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  saved.budget.accounts = [{ id: 'account', name: 'Joint Monzo', ownerPersonIds: ['alex'] }]
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=household')
  render(<App />)
  const input = screen.getByLabelText('Adult 1 name')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.blur(input)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'Alexandra' } })
  fireEvent.blur(input)
  const next = JSON.parse(localStorage.getItem(budgetStorageKey)!)
  expect(next.household.adults[0].name).toBe('Alexandra')
  expect(next.budget.accounts[0].ownerPersonIds).toEqual(['alex'])
})
