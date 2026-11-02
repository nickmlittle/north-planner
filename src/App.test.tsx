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
  expect(screen.getAllByText('north.')).toHaveLength(2)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  fireEvent.click(within(nav).getByRole('button', { name: 'Household' }))
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  expect(window.location.search).toContain('view=household')
  fireEvent.click(within(nav).getByRole('button', { name: 'Budget' }))
  expect(await screen.findByRole('heading', { name: 'Budget your month' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')
})

it('closes the mobile drawer with Escape and a navigation choice', async () => {
  render(<App />)
  await completeSetup()
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  expect(screen.getByRole('button', { name: 'Close navigation menu', expanded: true })).toBeVisible()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navigation menu' })).getByRole('button', { name: 'Household' }))
  expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
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

it('closes the mobile drawer with the page strip and preserves the agreed saved icon', async () => {
  render(<App />)
  await completeSetup()
  const saved = document.querySelector('.sidebar-status')!
  expect(saved.querySelector('path')?.getAttribute('d')).toBe('M20 6 9 17l-5-5')
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  const scrim = document.querySelector('.mobile-sidebar-scrim') as HTMLButtonElement
  fireEvent.click(scrim)
  expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
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
