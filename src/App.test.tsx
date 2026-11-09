// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { budgetStorageKey } from './state/useBudgetDocument'
import { newBudgetDocument } from './domain/budgetDocument'
// Small fixtures still drive search and filters; the threshold has its own test.
vi.mock('./pages/planListConfig', () => ({ PLAN_FILTER_MIN_ITEMS: 0 }))

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function completeSetup() {
  fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Alex household' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Adult 1 name'), { target: { value: 'Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  await screen.findByRole('heading', { name: 'Monthly budget' })
}

function expectNoBudgetNavigation() {
  expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  expect(sidebar.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Household'])
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

function savedMixedTransferDocument() {
  const saved = savedTransferDocument()
  saved.budget.pots = [{ id: 'bills-pot', name: 'Bills pot', accountId: 'account-1' }]
  saved.budget.snapshots['2026-02']!.items.push({ id: 'power', name: 'Power', categoryId: 'bills', destination: { kind: 'pot', potId: 'bills-pot' }, entryAmountPence: 5000, amountPence: 5000, frequency: 'monthly', funding: 'equal' })
  return saved
}

it('previews an edit and routes its saved account change to the same month in Transfers', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02')
  render(<App />)
  await screen.findByRole('heading', { name: 'Monthly budget' })
  fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rent' }))
  const form = screen.getByRole('form', { name: 'Edit budget item' })
  fireEvent.change(within(form).getByLabelText('Monthly amount'), { target: { value: '101' } })
  const impact = within(form).getByRole('region', { name: 'Impact preview' })
  expect(impact).toHaveTextContent('£100.00')
  expect(impact.compareDocumentPosition(within(form).getByRole('button', { name: 'Save item' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  fireEvent.click(screen.getByRole('button', { name: 'View affected transfers' }))
  expect(window.location.search).toContain('budgetView=transfers')
  expect(window.location.search).toContain('month=2026-02')
  expect(window.history.state.northAffectedTransfers.accounts).toMatchObject([{ accountId: 'account-1', beforePence: 10000, afterPence: 10100 }])
  expect(within(screen.getByRole('region', { name: 'Transfers by person' })).getAllByText('Changed by recent edit').length).toBeGreaterThan(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('starts with household setup and saves only the new budget key', async () => {
  localStorage.setItem('north.household.v2', '{"old":"data"}')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a household name.')
  await completeSetup()
  expect(screen.getByRole('heading', { name: 'Monthly budget' })).toBeVisible()
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!)).toMatchObject({ household: { name: 'Alex household', adults: [{ name: 'Alex' }] } })
  expect(localStorage.getItem('north.household.v2')).toBe('{"old":"data"}')
})

it('keeps the sidebar controls and routes between Household, Plan and Transfers', async () => {
  render(<App />)
  await completeSetup()
  fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
  expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getAllByText('north.')).toHaveLength(1)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  fireEvent.click(within(nav).getByRole('button', { name: 'Household' }))
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  expect(window.location.search).toContain('view=household')
  fireEvent.click(within(nav).getByRole('button', { name: 'Transfers' }))
  expect(await screen.findByRole('heading', { name: 'Monthly budget' })).toBeVisible()
  expect(window.location.search).toContain('budgetView=transfers')
  expect(within(nav).getByRole('button', { name: 'Transfers' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
  expect(window.location.search).toContain('budgetView=plan')
  expect(within(nav).getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
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
  expect(await screen.findByRole('heading', { name: 'Monthly budget' })).toBeVisible()
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
  expect(await screen.findByRole('heading', { name: 'Monthly budget' })).toBeVisible()
  expect(screen.queryByText('Amex statement')).not.toBeInTheDocument()
})

it('opens direct Transfers URLs and keeps budget search mounted across tab changes', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  await screen.findByRole('heading', { name: 'Monthly budget' })
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
  expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  expect(sidebar.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Household'])
})

it('walks setup one step at a time: Household, Adults, then Pay', async () => {
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-11')
  render(<App />)
  expect(screen.getByRole('list', { name: 'Setup steps' }).querySelector('[aria-current="step"]')).toHaveTextContent('Household')
  fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Home' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('heading', { name: 'Who’s in the household?' })).toHaveFocus()
  expectNoBudgetNavigation()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Add at least one adult and give each a name.')
  fireEvent.change(screen.getByLabelText('Adult 1 name'), { target: { value: 'Ada' } })
  fireEvent.click(screen.getByRole('button', { name: '+ Add an adult' }))
  fireEvent.change(screen.getByLabelText('Adult 2 name'), { target: { value: 'Ben' } })
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByLabelText('Household name')).toHaveValue('Home')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByLabelText('Adult 2 name')).toHaveValue('Ben')
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('heading', { name: 'Monthly pay' })).toHaveFocus()
  expectNoBudgetNavigation()
  fireEvent.change(screen.getByLabelText('Ada’s monthly take-home pay'), { target: { value: 'lots' } })
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter pay as an amount in pounds')
  expect(screen.getByRole('heading', { name: 'Monthly pay' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('Ada’s monthly take-home pay'), { target: { value: '2,450.50' } })
  fireEvent.change(screen.getByLabelText('Ben’s monthly take-home pay'), { target: { value: '1800' } })
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
  await screen.findByRole('heading', { name: 'Monthly budget' })
  expect(window.location.search).toContain('budgetView=plan')
  const saved = JSON.parse(localStorage.getItem(budgetStorageKey)!)
  const [ada, ben] = saved.household.adults
  expect(saved.workflow.setupComplete).toBe(true)
  expect(saved.budget.incomeSources).toMatchObject([
    { personId: ada.id, name: 'Pay', type: 'employment', baseAmountPence: 245050, baseEffectiveFrom: '2026-11' },
    { personId: ben.id, name: 'Pay', type: 'employment', baseAmountPence: 180000, baseEffectiveFrom: '2026-11' },
  ])
})

it('resumes setup at the first unfinished step and saves no income when pay is skipped', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Home', adults: [{ id: 'a', name: '' }] }
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  const first = render(<App />)
  expect(screen.getByRole('heading', { name: 'Who’s in the household?' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('Adult 1 name'), { target: { value: 'Ada' } })
  first.unmount()
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Monthly pay' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  await screen.findByRole('heading', { name: 'Monthly budget' })
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!).budget.incomeSources).toEqual([])
  expect(screen.getByRole('heading', { name: 'Start your plan' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add your first budget item' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add income' })).toBeVisible()
})

it('reopens on the Plan or Transfers view used last on this device', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Home', adults: [{ id: 'a', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  const first = render(<App />)
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Transfers' }))
  expect(window.location.search).toContain('budgetView=transfers')
  first.unmount()
  window.history.replaceState(null, '', '/')
  render(<App />)
  expect(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Transfers' })).toHaveAttribute('aria-current', 'page')
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
  expect(await screen.findByRole('heading', { name: 'Monthly budget' })).toBeVisible()
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

it('opens an account’s items in Plan from its step and comes back to that step with Back and Forward', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  const alex = await screen.findByRole('region', { name: 'Alex steps' })
  expect(within(alex).getAllByRole('listitem').map(step => step.textContent)).toEqual(['1Fund Alex · Monzo · Current account£50.00See 1 item'])
  const seeItems = within(alex).getByRole('button', { name: 'See 1 item for Alex · Monzo · Current account' })
  const originalLength = window.history.length
  fireEvent.click(seeItems)
  expect(window.location.search).toContain('budgetView=plan')
  expect(window.location.search).toContain('planDestination=account%3Aaccount-1')
  expect(window.location.search).toContain('month=2026-02')
  expect(window.history.length).toBe(originalLength + 1)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  expect(banner).toHaveTextContent('Showing 1 item')
  fireEvent.click(within(banner).getByRole('button', { name: 'Back to Transfers' }))
  await waitFor(() => expect(window.location.search).toContain('budgetView=transfers'))
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Alex steps' })).getByRole('button', { name: /^See 1 item/ })).toHaveFocus())
  window.history.forward()
  expect(await screen.findByRole('region', { name: 'Plan destination filter' })).toBeInTheDocument()
})

it('scopes Plan to a pot destination link for the selected month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=pot%3Abills-pot')
  render(<App />)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  expect(banner).toHaveTextContent('Showing 1 item for Bills pot · Alex · Current account · February 2026')
  expect(banner).toHaveTextContent('Matching total £50.00')
  expect(screen.queryByRole('button', { name: /Alex, 1 items/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Search and filter'))
  fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: 'unmatched' } })
  expect(banner).toHaveTextContent('Showing 0 items')
  expect(banner).toHaveTextContent('Matching total £0.00')
  fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: '' } })
  const item = screen.getByRole('button', { name: 'Power' })
  expect(screen.queryByRole('button', { name: 'Rent' })).not.toBeInTheDocument()
  fireEvent.click(item)
  const form = screen.getByRole('form', { name: 'Edit budget item' })
  expect(form).toHaveTextContent('February 2026')
  fireEvent.change(within(form).getByLabelText('Monthly amount'), { target: { value: '75' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(form).not.toBeInTheDocument()
  expect(banner).toHaveTextContent('Matching total £75.00')
})

it('distinguishes direct-account items and can clear the contextual Plan filter', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=direct%3Aaccount-1')
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Rent' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Power' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear destination filter' }))
  expect(window.location.search).not.toContain('planDestination')
  expect(screen.queryByRole('region', { name: 'Plan destination filter' })).not.toBeInTheDocument()
  window.history.back()
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('planDestination')).toBe('direct:account-1'))
  expect(screen.getByRole('region', { name: 'Plan destination filter' })).toHaveFocus()
})

it('shows both direct and pot items when a step opens its account in Plan', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  const alex = await screen.findByRole('region', { name: 'Alex steps' })
  fireEvent.click(within(alex).getByRole('button', { name: /^See 2 items/ }))
  expect(new URLSearchParams(window.location.search).get('planDestination')).toBe('account:account-1')
  expect(screen.getByRole('region', { name: 'Plan destination filter' })).toHaveTextContent('Showing 2 items')
  expect(screen.getByRole('button', { name: 'Rent' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Power' })).toBeInTheDocument()
})

it('keeps a direct Plan destination URL understandable when its pot is unavailable', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=pot%3Amissing')
  render(<App />)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  expect(banner).toHaveTextContent('Showing 0 items for Destination no longer available · February 2026')
  expect(screen.getByText(/No items go to Destination no longer available/)).toBeVisible()
  fireEvent.click(within(banner).getByRole('button', { name: 'Clear destination filter' }))
  expect(window.location.search).not.toContain('planDestination')
})

it('keeps a scoped empty Plan state after removal and returns to an empty Transfers', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  const alex = await screen.findByRole('region', { name: 'Alex steps' })
  fireEvent.click(within(alex).getByRole('button', { name: /^See 1 item/ }))
  const menu = await screen.findByLabelText('More actions for Rent')
  fireEvent.click(menu)
  fireEvent.click(within(menu.closest('details')!).getByRole('button', { name: 'Remove' }))
  const confirmDialog = screen.getByRole('dialog', { name: 'Remove Rent?' })
  expect(confirmDialog).toHaveTextContent('Changes apply: February 2026 onward. Later saved budgets stay unchanged.')
  fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Remove item' }))
  expect(screen.getByRole('region', { name: 'Plan destination filter' })).toHaveTextContent('Showing 0 items')
  expect(screen.getByText(/No items go to/)).toBeVisible()
  window.history.back()
  await waitFor(() => expect(window.location.search).toContain('budgetView=transfers'))
  expect(screen.getByText(/No transfers planned/)).toBeVisible()
  window.history.forward()
  await waitFor(() => expect(window.location.search).toContain('budgetView=plan'))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Plan destination filter' })).toHaveFocus())
  expect(screen.getByRole('region', { name: 'Plan destination filter' })).toHaveTextContent('Showing 0 items')
})

it('offers View Transfers for a direct filtered link in the selected month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=pot%3Abills-pot')
  render(<App />)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  fireEvent.click(within(banner).getByRole('button', { name: 'View Transfers' }))
  expect(window.location.search).toContain('budgetView=transfers')
  expect(window.location.search).toContain('month=2026-02')
  expect(await screen.findByRole('region', { name: 'Transfers by person' })).toBeInTheDocument()
})

it('has no matrix on phone Transfers', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  expect(await screen.findByRole('region', { name: 'Transfers by person' })).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Transfers view' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Matrix' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Transfer matrix' })).not.toBeInTheDocument()
})

it('shows the step list for an old destination detail link', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')
  render(<App />)
  expect(await screen.findByRole('region', { name: 'Transfers by person' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Sam steps' })).toHaveTextContent('Fund Alex · Monzo · Current account£50.00')
  // The retired parameter goes on the next navigation.
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Plan' }))
  expect(window.location.search).not.toContain('transferAccount')
})
