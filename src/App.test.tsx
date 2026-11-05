// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function savedTransferDocument() {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }, { id: 'sam', name: 'Sam' }] }
  saved.workflow.setupComplete = true
  saved.budget.accounts = [{ id: 'account-1', name: 'Current account', provider: 'Monzo', accountTypeId: 'current-account', ownerPersonIds: ['alex'] }]
  saved.budget.categories = [{ id: 'bills', name: 'Bills' }]
  saved.budget.snapshots['2026-02'] = { items: [{ id: 'bill', name: 'Rent', categoryId: 'bills', destination: { kind: 'account', accountId: 'account-1' }, entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly', funding: 'equal' }] }
  return saved
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

it('opens a destination URL and restores the overview with Back and browser Forward', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  const row = await screen.findByRole('button', { name: /Alex · Monzo · Current account, £100 allocated/ })
  row.focus()
  const originalLength = window.history.length
  fireEvent.click(row)
  expect(window.location.search).toContain('transferAccount=account-1')
  expect(window.history.length).toBe(originalLength + 1)
  const detail = await screen.findByRole('dialog', { name: 'Monzo · Current account' })
  const heading = within(detail).getByRole('heading', { name: 'Monzo · Current account' })
  const back = within(detail).getByRole('button', { name: 'Back to Transfers' })
  expect(heading).toHaveFocus()
  fireEvent.keyDown(detail, { key: 'Tab' })
  expect(back).toHaveFocus()
  within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Plan' }).focus()
  expect(heading).toHaveFocus()
  expect(detail).toHaveTextContent('Alex · February 2026')
  expect(detail).toHaveTextContent('Alex£50Sam£50')
  expect(document.body.style.position).toBe('fixed')
  expect(document.querySelector('.planner-app-shell')?.closest('[inert]')).not.toBeNull()
  fireEvent.click(back)
  await waitFor(() => expect(window.location.search).not.toContain('transferAccount'))
  expect(screen.queryByRole('dialog', { name: 'Monzo · Current account' })).not.toBeInTheDocument()
  expect(row).toHaveFocus()
  expect(document.body.style.position).toBe('')
  window.history.forward()
  expect(await screen.findByRole('dialog', { name: 'Monzo · Current account' })).toBeInTheDocument()
})

it('finds a matrix item in the selected month Plan and retains editor, Back and focus behaviour', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Preview matrix' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expand details for Alex · Current account' }))
  const handoff = screen.getByRole('button', { name: 'Find Rent in Plan for Alex · Current account: Direct to account' })
  handoff.focus()
  const historyLength = window.history.length
  fireEvent.click(handoff)
  expect(window.history.length).toBe(historyLength + 1)
  expect(window.location.search).toContain('budgetView=plan')
  expect(window.location.search).toContain('month=2026-02')
  expect(window.location.search).not.toContain('transferAccount=')
  const item = await screen.findByRole('button', { name: 'Rent' })
  await waitFor(() => expect(item).toHaveFocus())
  fireEvent.click(item)
  const form = screen.getByRole('form', { name: 'Edit budget item' })
  expect(form).toHaveTextContent('February 2026')
  expect(within(form).getByLabelText('Item name')).toHaveValue('Rent')
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(form).not.toBeInTheDocument()
  expect(item).toHaveFocus()
  fireEvent.click(item)
  const saving = screen.getByRole('form', { name: 'Edit budget item' })
  fireEvent.change(within(saving).getByLabelText('Amount'), { target: { value: '125' } })
  fireEvent.click(within(saving).getByRole('button', { name: 'Save item' }))
  expect(saving).not.toBeInTheDocument()
  expect(item).toHaveFocus()
  expect(window.location.search).toContain('budgetView=plan')
  window.history.back()
  const account = await screen.findByRole('button', { name: 'Expand details for Alex · Current account' })
  await waitFor(() => expect(account).toHaveFocus())
  expect(window.location.search).toContain('budgetView=transfers')
  expect(window.location.search).toContain('month=2026-02')
  expect(screen.getByRole('region', { name: 'Transfer matrix' })).toHaveTextContent('£125')
  window.history.forward()
  await waitFor(() => expect(window.location.search).toContain('budgetView=plan'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rent' })).toHaveFocus())
})

it('keeps Plan removal available after matrix handoff and restores a safe focus target', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Preview matrix' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expand details for Alex · Current account' }))
  fireEvent.click(screen.getByRole('button', { name: 'Find Rent in Plan for Alex · Current account: Direct to account' }))
  const menu = await screen.findByLabelText('More actions for Rent')
  fireEvent.click(menu)
  fireEvent.click(within(menu.closest('details')!).getByRole('button', { name: 'Remove' }))
  expect(confirm).toHaveBeenCalledWith('Remove “Rent” from the February 2026 budget?')
  expect(screen.getByText('That budget item is no longer available for February 2026.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Rent' })).not.toBeInTheDocument()
  window.history.back()
  const previewToggle = await screen.findByRole('button', { name: 'Return to account view' })
  await waitFor(() => expect(previewToggle).toHaveFocus())
  expect(screen.getByText(/No transfers planned/)).toBeVisible()
  window.history.forward()
  await waitFor(() => expect(screen.getByText('That budget item is no longer available for February 2026.')).toBeVisible())
  expect(screen.getByPlaceholderText('Search budget')).toHaveFocus()
})

it('replaces a direct detail URL when closing and clears an invalid destination', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')
  render(<App />)
  const detail = await screen.findByRole('dialog', { name: 'Monzo · Current account' })
  const length = window.history.length
  fireEvent.keyDown(detail, { key: 'Escape' })
  await waitFor(() => expect(window.location.search).not.toContain('transferAccount'))
  expect(window.history.length).toBe(length)
  cleanup()
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02&transferAccount=missing')
  render(<App />)
  await waitFor(() => expect(window.location.search).not.toContain('transferAccount'))
  expect(screen.getByRole('status')).toHaveTextContent('Destination is no longer available')
})

it('dismisses mobile detail when the viewport becomes desktop', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  const listeners = new Set<() => void>()
  let matches = true
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return matches }, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) })))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')
  render(<App />)
  expect(await screen.findByRole('dialog', { name: 'Monzo · Current account' })).toBeInTheDocument()
  matches = false
  listeners.forEach(listener => listener())
  await waitFor(() => expect(window.location.search).not.toContain('transferAccount'))
  expect(screen.queryByRole('dialog', { name: 'Monzo · Current account' })).not.toBeInTheDocument()
  matches = true
  listeners.forEach(listener => listener())
  expect(screen.queryByRole('dialog', { name: 'Monzo · Current account' })).not.toBeInTheDocument()
})
