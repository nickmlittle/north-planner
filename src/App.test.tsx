// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { storageKey } from './state/useAppDocument'
import { completeDocument } from './test/setupFixture'
import { emptyPerson } from './domain/setup'

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const click = (name: string | RegExp) => fireEvent.click(screen.queryByRole('button', { name }) ?? screen.getByRole('menuitem', { name }))
const enter = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

it('creates a single-adult renter household from a genuinely empty first load', () => {
  render(<App />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A clearer picture')
  expect(screen.queryByText('Nick')).not.toBeInTheDocument()
  click(/Create your household/)
  click(/Continue/)
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Add at least one adult')
  enter('Household name', 'Alex household')
  click('+ Add an adult')
  enter('Person name', 'Alex')
  enter('Alex date of birth', '1990-06-14')
  click(/Continue/)
  enter('Alex income type', 'none')
  click(/Continue/)
  enter('Alex pension status', 'none')
  click(/Continue/)
  enter('Alex ISA type', 'none')
  fireEvent.click(screen.getByLabelText('No cash savings or current-account balance (£0)'))
  click(/Continue/)
  enter('Current housing', 'rent')
  expect(screen.queryByLabelText('Estimated home value (£)')).not.toBeInTheDocument()
  click(/Continue/)
  enter('Living costs (£)', '0')
  click(/Continue/)
  expect(screen.queryByText('Still to add')).not.toBeInTheDocument()
  click(/Open your dashboard/)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your route ahead')
  expect(screen.getAllByText('£0').length).toBeGreaterThan(2)
  expect(screen.getByRole('heading', { name: 'Net worth over time' })).toBeVisible()
  expect(screen.queryByText(/Forecast unavailable/)).not.toBeInTheDocument()
})

it('preserves input and step on Back and reload, including invalid financial text', () => {
  const d = completeDocument(); d.step = 2
  localStorage.setItem(storageKey, JSON.stringify(d))
  const view = render(<App />)
  enter('Alex gross pay (£)', '-1')
  click(/Continue/)
  expect(screen.getByLabelText('Alex gross pay (£)')).toHaveAttribute('aria-invalid', 'true')
  click('Back')
  click(/Continue/)
  expect(screen.getByLabelText('Alex gross pay (£)')).toHaveValue('-1')
  view.unmount(); render(<App />)
  expect(screen.getByLabelText('Alex gross pay (£)')).toHaveValue('-1')
  enter('Alex gross pay (£)', '6000')
  click(/Continue/)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your pensions')
})

it('shows incomplete totals and actionable missing details after skipping finances', () => {
  const d = completeDocument(); d.step = 3; d.snapshot.people[0]!.pension = ''
  localStorage.setItem(storageKey, JSON.stringify(d)); render(<App />)
  click('Skip for now')
  click(/Review/)
  expect(screen.getByText('Incomplete')).toBeVisible()
  click(/Open your dashboard/)
  const card = screen.getByRole('heading', { name: 'Net worth today' }).parentElement!
  expect(within(card).getByText('Incomplete')).toBeVisible()
  expect(screen.getByText(/Known assets: £520,000/)).toBeVisible()
  expect(screen.getAllByText(/Forecast unavailable/)[0]).toHaveTextContent('pension balance')
})

it('blocks child forecasts until later age bands are explicitly configured', () => {
  const d = completeDocument(); d.step = 9
  const p = emptyPerson('child'); Object.assign(p, { name: 'Jamie', dob: '2020-02-22', childCost: '400' }); d.snapshot.people.push(p)
  localStorage.setItem(storageKey, JSON.stringify(d)); render(<App />)
  expect(screen.getAllByText(/Forecast unavailable/)[0]).toHaveTextContent('future annual costs')
  click('Plan settings')
  click('Child costs')
  enter('Jamie Ages 12–18 annual cost (£)', '0')
  expect(screen.queryByText(/Forecast unavailable/)).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(storageKey)!).snapshot.people[1].futureCosts.ages12to18).toBe('0')
})

it('opens plan settings as a menu, then supports URL-backed pages and browser history', async () => {
  const d = completeDocument(); d.step = 9
  localStorage.setItem(storageKey, JSON.stringify(d)); render(<App />)
  click('Plan settings')
  expect(screen.getByRole('heading', { name: 'Your route ahead' })).toBeVisible()
  expect(window.location.search).toBe('')
  click('Tax estimates')
  expect(screen.getByRole('heading', { level: 1, name: 'Tax estimates' })).toBeVisible()
  expect(window.location.search).toContain('settings=tax')
  window.history.back()
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your route ahead' })).toBeVisible())
  window.history.forward()
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Tax estimates' })).toBeVisible())
})

it('requires explicit confirmation for removal and removes shared ownership references', () => {
  const d = completeDocument(); d.step = 1
  const other = emptyPerson('partner'); Object.assign(other, { name: 'Sam', dob: '1992-11-03' }); d.snapshot.people.push(other)
  d.snapshot.homeOwners.push(other.id); d.snapshot.borrowers.push(other.id)
  localStorage.setItem(storageKey, JSON.stringify(d)); render(<App />)
  click('Remove Alex')
  expect(screen.getByText(/Shared balances stay in place/)).toBeVisible()
  click('Keep person')
  expect(screen.getByLabelText('Alex name')).toBeVisible()
  click('Remove Alex'); click('Confirm removal')
  const saved = JSON.parse(localStorage.getItem(storageKey)!)
  expect(saved.snapshot.people).toHaveLength(1)
  expect(saved.snapshot.homeOwners).toEqual([other.id])
  expect(screen.queryByLabelText('Alex name')).not.toBeInTheDocument()
})

it('persists planner edits and reflects current income changes in the overview', () => {
  const d = completeDocument(); d.step = 10
  localStorage.setItem(storageKey, JSON.stringify(d)); const view = render(<App />)
  click('Plan settings'); click('Income timeline')
  enter('Alex Annual salary (GBP)', '72000')
  click('Plan settings'); click('Planning assumptions')
  enter('FIRE age', '55')
  click('Household')
  expect(screen.getByText('£72,000.00')).toBeVisible()
  view.unmount(); render(<App />)
  click('Plan settings')
  click('Planning assumptions')
  expect(screen.getByLabelText('FIRE age')).toHaveValue('55')
  click('Plan settings'); click('Income timeline')
  expect(screen.getByLabelText('Alex Annual salary (GBP)')).toHaveValue('72000')
})

it('preserves corrupted storage and uses session state when storage fails', () => {
  localStorage.setItem(storageKey, '{broken')
  const view = render(<App />)
  expect(screen.getByRole('status')).toHaveTextContent('Saved data could not be read')
  click(/Create your household/)
  expect(localStorage.getItem(storageKey)).toBe('{broken')
  click('Replace saved data with this draft')
  expect(JSON.parse(localStorage.getItem(storageKey)!).version).toBe(1)
  view.unmount(); localStorage.clear()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  render(<App />); click(/Create your household/)
  expect(screen.getByRole('status')).toHaveTextContent('only last for this session')
  enter('Household name', 'Still usable')
  expect(screen.getByLabelText('Household name')).toHaveValue('Still usable')
})
