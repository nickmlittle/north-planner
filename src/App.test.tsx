// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { isMac } from './state/shortcuts'
import { budgetStorageKey } from './state/useBudgetDocument'
import { decodeBudgetDocument, newBudgetDocument } from './domain/budgetDocument'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyCardTracker } from './domain/cardTracker'
// Small fixtures still drive search and filters; the threshold has its own test.
vi.mock('./pages/planListConfig', () => ({ PLAN_FILTER_MIN_ITEMS: 0 }))

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function completeSetup() {
  fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Alex household' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Adult 1 name'), { target: { value: 'Alex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
  await screen.findByRole('heading', { name: /^To do/ })
}
const planHeading = () => screen.findByRole('heading', { level: 1, name: /^Plan, / })
const monthHeading = () => screen.findByRole('heading', { level: 1, name: /^Month, / })

function expectNoBudgetNavigation() {
  expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  const sidebar = within(screen.getByRole('navigation', { name: 'Main navigation' }))
  expect(sidebar.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Settings'])
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

it('previews an edit and routes its saved account change to the same month on Month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=plan&month=2026-02')
  render(<App />)
  expect(await planHeading()).toHaveTextContent('Plan, February 2026')
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rent' }))
  const form = screen.getByRole('dialog', { name: 'Edit item' })
  fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '101' } })
  const impact = within(form).getByRole('region', { name: 'Impact preview' })
  expect(impact).toHaveTextContent('£100.00')
  expect(impact.compareDocumentPosition(within(form).getByRole('button', { name: 'Save item' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  fireEvent.click(screen.getByRole('button', { name: 'View affected Payday steps' }))
  expect(window.location.search).toContain('view=month')
  expect(window.location.search).toContain('month=2026-02')
  expect(window.history.state.northAffectedTransfers.accounts).toMatchObject([{ accountId: 'account-1', beforePence: 10000, afterPence: 10100 }])
  expect(within(screen.getByRole('region', { name: 'Steps by person' })).getAllByText('Changed by recent edit').length).toBeGreaterThan(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('starts with household setup and saves only the new budget key', async () => {
  localStorage.setItem('north.household.v2', '{"old":"data"}')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a household name.')
  await completeSetup()
  expect(window.location.search).toContain('view=home')
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!)).toMatchObject({ household: { name: 'Alex household', adults: [{ name: 'Alex' }] } })
  expect(localStorage.getItem('north.household.v2')).toBe('{"old":"data"}')
})

it('keeps the sidebar controls and routes between Settings, Plan and Month', async () => {
  render(<App />)
  await completeSetup()
  fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
  expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true')
  expect(within(screen.getByRole('complementary', { name: 'Application navigation' })).getAllByText('north.')).toHaveLength(1)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  fireEvent.click(within(nav).getByRole('button', { name: 'Settings' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  // jsdom gets the phone presentation: Settings is a list of its sections.
  expect(within(screen.getByRole('list', { name: 'Settings sections' })).getByRole('button', { name: /^Household/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Continue to Plan' })).not.toBeInTheDocument()
  expect(window.location.search).toContain('view=settings')
  fireEvent.click(within(nav).getByRole('button', { name: 'Month' }))
  expect(await monthHeading()).toBeVisible()
  expect(window.location.search).toContain('view=month')
  expect(within(nav).getByRole('button', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
  expect(window.location.search).toContain('view=plan')
  expect(within(nav).getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')
})

it('keeps the selected mobile destination and month in the URL and browser history', async () => {
  render(<App />)
  await completeSetup()
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  const month = within(nav).getByRole('button', { name: 'Month' })
  const plan = within(nav).getByRole('button', { name: 'Plan' })
  expect(within(nav).getByRole('button', { name: /^Home(, \d+ to do)?$/ })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(plan)
  await planHeading()
  expect(plan).toHaveAttribute('aria-current', 'page')
  const firstLength = window.history.length
  fireEvent.click(plan)
  expect(window.history.length).toBe(firstLength)
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  const selectedMonth = new URLSearchParams(window.location.search).get('month')
  expect(selectedMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
  fireEvent.click(month)
  expect(window.location.search).toContain('view=month')
  expect(new URLSearchParams(window.location.search).get('month')).toBe(selectedMonth)
  expect(month).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Account and settings' })).getByRole('button', { name: 'Settings' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  fireEvent.click(month)
  expect(await monthHeading()).toBeVisible()
  expect(month).toHaveAttribute('aria-current', 'page')
  expect(new URLSearchParams(window.location.search).get('month')).toBe(selectedMonth)
})

it('opens the mobile account and save status sheet and closes it with Escape', async () => {
  render(<App />)
  await completeSetup()
  const trigger = screen.getByRole('button', { name: 'Account and settings' })
  trigger.focus()
  fireEvent.click(trigger)
  const sheet = screen.getByRole('dialog', { name: 'Account and settings' })
  expect(within(sheet).getByText('Saved')).toBeVisible()
  expect(within(sheet).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  expect(document.querySelector('.planner-app-shell')?.closest('[inert]')).not.toBeNull()
  fireEvent.keyDown(sheet, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Account and settings' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('maps removed page URLs to the retained screens', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=dashboard&settings=tax&budgetView=amex')
  render(<App />)
  expect(await planHeading()).toBeVisible()
  expect(window.location.search).not.toMatch(/settings=|budgetView/)
  expect(screen.queryByText('Amex statement')).not.toBeInTheDocument()
})

it('opens old Transfers links on Month, and keeps Plan’s search across trips to Month', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Alex household', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  // Search appears from five items.
  saved.budget.accounts = [{ id: 'joint', name: 'Joint', provider: 'Monzo', ownerPersonIds: ['alex'] }]
  saved.budget.categories = [{ id: 'home', name: 'Home' }]
  saved.budget.snapshots['2026-02'] = { items: ['Groceries', 'Rent', 'Power', 'Water', 'Phone'].map((name, index) => ({ id: `i${index}`, name, categoryId: 'home', destination: { kind: 'account' as const, accountId: 'joint' }, frequency: 'monthly' as const, entryAmountPence: 1000, amountPence: 1000, funding: 'equal' as const })) }
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  await monthHeading()
  expect(window.location.search).toBe('?view=month&month=2026-02')
  const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
  expect(within(nav).getByRole('button', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'February 2026' })).toBeInTheDocument()
  fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Groceries' } })
  fireEvent.click(within(nav).getByRole('button', { name: 'Month' }))
  await monthHeading()
  fireEvent.click(within(nav).getByRole('button', { name: 'Plan' }))
  expect(screen.getByPlaceholderText('Search items')).toHaveValue('Groceries')
  expect(screen.getByRole('button', { name: 'February 2026' })).toBeInTheDocument()
})

it('gates direct budget URLs until household setup is complete', () => {
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  expectNoBudgetNavigation()
})

it('keeps a set-up household with a blank name on Settings until it is fixed', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: '', adults: [{ id: 'alex', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=plan')
  render(<App />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a household name and at least one adult name.')
  expectNoBudgetNavigation()
  fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Home' } })
  fireEvent.blur(screen.getByLabelText('Household name'))
  expect(await planHeading()).toBeVisible()
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
  // Where Ada's pay lands: a new account, added here (D10); incomplete, it asks for the bank first.
  const landing = screen.getAllByLabelText(/^Where does it land\?/)
  fireEvent.change(landing[0]!, { target: { value: '__new__' } })
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Enter the bank and account type')
  fireEvent.change(within(screen.getByRole('group', { name: 'Ada’s pay account' })).getByLabelText('Bank / provider'), { target: { value: 'Starling' } })
  fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))
  await screen.findByRole('heading', { name: /^To do/ })
  expect(window.location.search).toContain('view=home')
  const saved = JSON.parse(localStorage.getItem(budgetStorageKey)!)
  const [ada, ben] = saved.household.adults
  expect(saved.workflow.setupComplete).toBe(true)
  expect(saved.budget.accounts).toMatchObject([{ provider: 'Starling', accountTypeId: 'current-account', ownerPersonIds: [ada.id] }])
  expect(saved.budget.incomeSources).toMatchObject([
    { personId: ada.id, name: 'Pay', type: 'employment', baseAmountPence: 245050, baseEffectiveFrom: '2026-11', landsInAccountId: saved.budget.accounts[0].id },
    { personId: ben.id, name: 'Pay', type: 'employment', baseAmountPence: 180000, baseEffectiveFrom: '2026-11' },
  ])
  expect(saved.budget.incomeSources[1].landsInAccountId).toBeUndefined()
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
  await screen.findByRole('heading', { name: /^To do/ })
  expect(JSON.parse(localStorage.getItem(budgetStorageKey)!).budget.incomeSources).toEqual([])
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Plan' }))
  await planHeading()
  expect(screen.getByRole('heading', { name: 'Start your plan' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add your first budget item' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Add income' })).toBeVisible()
})

it('opens on Home, and an old budget link without a view opens Plan', async () => {
  const saved = newBudgetDocument()
  saved.household = { name: 'Home', adults: [{ id: 'a', name: 'Alex' }] }
  saved.workflow.setupComplete = true
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  const first = render(<App />)
  const nav = () => within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
  expect(nav().getByRole('button', { name: /^Home(, \d+ to do)?$/ })).toHaveAttribute('aria-current', 'page')
  expect(await screen.findByRole('region', { name: /at a glance$/ })).toBeInTheDocument()
  expect(document.title).toBe('Home · North')
  fireEvent.click(nav().getByRole('button', { name: 'Month' }))
  expect(window.location.search).toContain('view=month')
  first.unmount()
  window.history.replaceState(null, '', '/')
  render(<App />)
  expect(nav().getByRole('button', { name: /^Home(, \d+ to do)?$/ })).toHaveAttribute('aria-current', 'page')
  cleanup()
  window.history.replaceState(null, '', '/?view=budget')
  render(<App />)
  expect(nav().getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
  expect(window.location.search).toBe('?view=plan')
})

it('stays quiet when saved and removes the mobile drawer', async () => {
  render(<App />)
  await completeSetup()
  expect(document.querySelector('.sidebar-status')).toBeNull()
  expect(screen.getByRole('button', { name: 'Account and settings' }).textContent).toBe('')
  expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument()
  expect(document.querySelector('.mobile-sidebar-scrim')).toBeNull()
})

it('follows old Household, Rules and This month links to Settings and Month through browser navigation', async () => {
  render(<App />)
  await completeSetup()
  window.history.replaceState(null, '', '/?view=household')
  fireEvent(window, new PopStateEvent('popstate'))
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await waitFor(() => expect(window.location.search).toBe('?view=settings&section=household'))
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  window.history.replaceState(null, '', '/?view=spending&spendingView=rules')
  fireEvent(window, new PopStateEvent('popstate'))
  await waitFor(() => expect(window.location.search).toBe('?view=settings&section=rules'))
  window.history.replaceState(null, '', '/?view=spending&spendingView=month&month=2026-10')
  fireEvent(window, new PopStateEvent('popstate'))
  expect(await monthHeading()).toHaveTextContent('Month, October 2026')
  await waitFor(() => expect(window.location.search).toBe('?view=month&month=2026-10'))
  expect(document.title).toBe('Month · October 2026 · North')
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan')
  fireEvent(window, new PopStateEvent('popstate'))
  expect(await planHeading()).toBeVisible()
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
  expect(within(alex).getAllByRole('listitem').map(step => step.textContent)).toEqual(['Fund Monzo Alex£50.00'])
  const seeItems = within(alex).getByRole('button', { name: 'See 1 item for Monzo Alex' })
  const originalLength = window.history.length
  fireEvent.click(seeItems)
  expect(window.location.search).toContain('view=plan')
  expect(window.location.search).toContain('planDestination=account%3Aaccount-1')
  expect(window.location.search).toContain('month=2026-02')
  expect(window.history.length).toBe(originalLength + 1)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  expect(banner).toHaveTextContent('Monzo Alex')
  expect(document.querySelector('.plan-toolbar-count')).toHaveTextContent('1 item · ')
  fireEvent.click(within(banner).getByRole('button', { name: 'Back to Month' }))
  await waitFor(() => expect(window.location.search).toContain('view=month'))
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Alex steps' })).getByRole('button', { name: /^See 1 item/ })).toHaveFocus())
  window.history.forward()
  expect(await screen.findByRole('region', { name: 'Plan destination filter' })).toBeInTheDocument()
})

it('scopes Plan to a pot destination link for the selected month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=pot%3Abills-pot')
  render(<App />)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  const count = () => document.querySelector('.plan-toolbar-count')
  expect(banner).toHaveTextContent('Bills pot · Monzo Alex')
  expect(count()).toHaveTextContent('1 item · £50.00')
  expect(screen.queryByRole('button', { name: /Alex, 1 item\b/ })).not.toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'unmatched' } })
  expect(count()).toHaveTextContent('0 items · £0.00')
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: '' } })
  const item = screen.getByRole('button', { name: 'Power' })
  expect(screen.queryByRole('button', { name: 'Rent' })).not.toBeInTheDocument()
  fireEvent.click(item)
  const form = screen.getByRole('dialog', { name: 'Edit item' })
  expect(form).toHaveTextContent('February 2026')
  fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '75' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(form).not.toBeInTheDocument()
  expect(count()).toHaveTextContent('1 item · £75.00')
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
  expect(document.querySelector('.plan-toolbar-count')).toHaveTextContent('2 items · ')
  expect(screen.getByRole('button', { name: 'Rent' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Power' })).toBeInTheDocument()
})

it('keeps a direct Plan destination URL understandable when its pot is unavailable', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=pot%3Amissing')
  render(<App />)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  expect(banner).toHaveTextContent('Destination no longer available')
  expect(document.querySelector('.plan-toolbar-count')).toHaveTextContent('0 items · £0.00')
  expect(screen.getByText(/No items go to Destination no longer available/)).toBeVisible()
  fireEvent.click(within(banner).getByRole('button', { name: 'Clear destination filter' }))
  expect(window.location.search).not.toContain('planDestination')
})

it('keeps a scoped empty Plan state after removal and returns to an empty Month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  const alex = await screen.findByRole('region', { name: 'Alex steps' })
  fireEvent.click(within(alex).getByRole('button', { name: /^See 1 item/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Rent' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Edit item' })).getByRole('button', { name: 'Remove item' }))
  const confirmDialog = screen.getByRole('dialog', { name: 'Remove Rent?' })
  expect(confirmDialog).toHaveTextContent('Changes apply: February 2026 onward.')
  fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Remove item' }))
  expect(document.querySelector('.plan-toolbar-count')).toHaveTextContent('0 items')
  expect(screen.getByText(/No items go to/)).toBeVisible()
  window.history.back()
  await waitFor(() => expect(window.location.search).toContain('view=month'))
  expect(screen.getByText(/Nothing to fund yet/)).toBeVisible()
  window.history.forward()
  await waitFor(() => expect(window.location.search).toContain('view=plan'))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Plan destination filter' })).toHaveFocus())
  expect(document.querySelector('.plan-toolbar-count')).toHaveTextContent('0 items')
})

it('offers View Month for a direct filtered link in the selected month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=plan&month=2026-02&planDestination=pot%3Abills-pot')
  render(<App />)
  const banner = await screen.findByRole('region', { name: 'Plan destination filter' })
  fireEvent.click(within(banner).getByRole('button', { name: 'View Month' }))
  expect(window.location.search).toContain('view=month')
  expect(window.location.search).toContain('month=2026-02')
  expect(await screen.findByRole('region', { name: 'Steps by person' })).toBeInTheDocument()
})

it('has no matrix on phone Month', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02')
  render(<App />)
  expect(await screen.findByRole('region', { name: 'Steps by person' })).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Transfers view' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Matrix' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Transfer matrix' })).not.toBeInTheDocument()
})

it('shows the step list for an old destination detail link', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedTransferDocument()))
  window.history.replaceState(null, '', '/?view=budget&budgetView=transfers&month=2026-02&transferAccount=account-1')
  render(<App />)
  expect(await screen.findByRole('region', { name: 'Steps by person' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Sam steps' })).toHaveTextContent('Fund Monzo Alex£50.00')
  // The retired parameter goes on the next navigation.
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Plan' }))
  expect(window.location.search).not.toContain('transferAccount')
})

it('lists whoever is over in Home’s To do, reviews their items on Plan, and counts Home’s tasks in the nav', async () => {
  const saved = newBudgetDocument()
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  saved.household = { name: 'Home', adults: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Bea' }] }
  saved.workflow.setupComplete = true
  saved.budget.categories = [{ id: 'bills', name: 'Bills' }]
  saved.budget.accounts = [{ id: 'bea', name: 'Current', provider: 'Monzo', ownerPersonIds: ['b'] }]
  saved.budget.incomeSources = [{ id: 'ia', personId: 'a', name: 'Job', type: 'employment', baseAmountPence: 100000, changes: {} }, { id: 'ib', personId: 'b', name: 'Job', type: 'employment', baseAmountPence: 10000, changes: {} }]
  saved.budget.snapshots[month] = { items: [{ id: 'gym', name: 'Gym', categoryId: 'bills', destination: { kind: 'account', accountId: 'bea' }, entryAmountPence: 14000, amountPence: 14000, frequency: 'monthly', funding: 'single', singleFunderId: 'b' }] }
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  render(<App />)
  const todo = await screen.findByRole('list', { name: 'To do' })
  const over = within(todo).getByRole('button', { name: /Bring the plan back to Available/ })
  expect(over).toHaveTextContent('Bea £40.00 over')
  fireEvent.click(over)
  expect(window.location.search).toContain('view=plan')
  expect(await screen.findByRole('button', { name: 'Remove filter: Bea’s accounts' })).toBeInTheDocument()
  window.history.back()
  await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: /^Home(, \d+ to do)?$/ })).toHaveAttribute('aria-current', 'page'))
  expect(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: /^Home, \d+ to do$/ })).toBeInTheDocument()
  fireEvent.click(within(await screen.findByRole('region', { name: /at a glance$/ })).getByRole('button', { name: 'Open Plan' }))
  expect(window.location.search).toContain('view=plan')
})

it('is drivable from the keyboard: skip link, G then a key, / and N on Plan, [ ] for the month, ? for the list', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(savedMixedTransferDocument()))
  window.history.replaceState(null, '', '/?view=plan&month=2026-02')
  render(<App />)
  await planHeading()
  const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })
  // The first stop on the page skips to the content.
  const skip = document.querySelector<HTMLAnchorElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')!
  expect(skip).toHaveTextContent('Skip to content')
  fireEvent.click(skip)
  expect(document.getElementById('content')).toHaveFocus()
  // / focuses the search; a slash typed inside it is just a slash.
  press('/')
  const search = screen.getByPlaceholderText('Search items')
  expect(search).toHaveFocus()
  expect(fireEvent.keyDown(search, { key: '/' })).toBe(true)
  search.blur()
  // [ and ] step the month.
  press(']')
  expect(window.location.search).toContain('month=2026-03')
  press('[')
  expect(window.location.search).toContain('month=2026-02')
  // N adds an item; with its dialog open, letters don't fire.
  press('n')
  const editor = await screen.findByRole('form', { name: /Add/ })
  press('g'); press('m')
  expect(window.location.search).toContain('view=plan')
  fireEvent.click(within(editor.closest('[role="dialog"]') ?? editor).getAllByRole('button', { name: /Close|Cancel/ })[0]!)
  await waitFor(() => expect(screen.queryByRole('form', { name: /Add/ })).not.toBeInTheDocument())
  // G then M opens Month; G then , opens Settings.
  press('g'); press('m')
  expect(await monthHeading()).toBeVisible()
  press('g'); press(',')
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  // ? lists what this page offers.
  press('?', { shiftKey: true })
  const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
  expect(within(sheet).getByRole('region', { name: 'Go to' })).toHaveTextContent('Month')
  expect(within(sheet).getByRole('region', { name: 'General' })).toHaveTextContent('Keyboard shortcuts')
  expect(within(sheet).queryByText('Add item')).not.toBeInTheDocument()
})

it('brings in and adds transactions from the keyboard on Spending', async () => {
  const saved = savedTransferDocument()
  saved.card = { ...emptyCardTracker(), cards: [{ id: 'amex', name: 'Amex', closeDay: 24, dueDaysAfterClose: 25, payFromAccountId: 'account-1', cardholders: [] }] }
  localStorage.setItem(budgetStorageKey, JSON.stringify(saved))
  window.history.replaceState(null, '', '/?view=spending')
  render(<App />)
  await screen.findByRole('button', { name: 'Bring in transactions' })
  fireEvent.keyDown(document.body, { key: 'i' })
  expect(await screen.findByRole('dialog', { name: /Bring in/ })).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog', { name: /Bring in/ }), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.keyDown(document.body, { key: 'n' })
  expect(await screen.findByRole('dialog', { name: 'Add a transaction' })).toBeInTheDocument()
})

it('opens ⌘K anywhere, jumps to an item, and runs Add item from another screen', async () => {
  localStorage.setItem(budgetStorageKey, JSON.stringify(decodeBudgetDocument(JSON.parse(readFileSync(resolve(process.cwd(), 'docs/fixtures/plan-transfers-baseline.json'), 'utf8')))))
  window.history.replaceState(null, '', '/?view=home&month=2026-11')
  render(<App />)
  await screen.findByRole('heading', { level: 1 })
  const trigger = screen.getAllByRole('button', { name: 'Search North' })[0]!
  trigger.focus()
  fireEvent.keyDown(window, { key: 'k', ...isMac() ? { metaKey: true } : { ctrlKey: true } })
  const palette = screen.getByRole('dialog', { name: 'Search North' })
  const input = within(palette).getByRole('combobox', { name: 'Search North' })
  expect(input).toHaveFocus()
  fireEvent.change(input, { target: { value: 'groceries' } })
  const options = within(palette).getAllByRole('option')
  expect(options[0]).toHaveAttribute('aria-selected', 'true')
  expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Search North' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  // The sidebar's Search opens it too; "add" runs Add item, on Plan.
  fireEvent.click(trigger)
  fireEvent.change(screen.getByRole('combobox', { name: 'Search North' }), { target: { value: 'add' } })
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search North' }), { key: 'Enter' })
  expect(window.location.search).toContain('view=plan')
  expect(await screen.findByRole('dialog', { name: 'Add item' })).toBeInTheDocument()
})
