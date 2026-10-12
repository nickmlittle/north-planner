// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { storageKey } from '../state/useAppDocument'
import { completeDocument } from '../test/setupFixture'
import { documentForecast } from '../state/forecast'
import { formatGBPWhole } from '../formatting/money'
import { newPropertyMove } from '../config/defaultMoves'

beforeEach(() => { localStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const click = (name: string | RegExp) => { const button = screen.getByRole('button', { name }); button.focus(); fireEvent.click(button) }
const enter = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const saved = () => JSON.parse(localStorage.getItem(storageKey)!)
function open(doc = completeDocument()) {
  doc.completed = true; doc.step = 10
  localStorage.setItem(storageKey, JSON.stringify(doc)); return render(<App />)
}
function purchase() {
  click(/Add goal or life event/); click(/^Purchase/)
  enter('Event name', 'Family car'); enter('Purchase year', '2027'); enter('One-off purchase cost (£)', '10000')
}

it('previews purchases without persistence, saves identical metrics, edits without duplicates and reloads', () => {
  const view = open(); purchase()
  fireEvent.click(screen.getByLabelText('Include recurring running costs'))
  enter('Annual running cost (£)', '1000'); enter('Running costs start year', '2027'); enter('Running costs final year', '2028')
  click(/Preview impact/)
  expect(saved().purchaseEvents).toEqual([])
  click('Back to details')
  expect(screen.getByRole('heading', { name: 'Add goal or life event' })).toHaveFocus()
  expect(screen.getByLabelText('One-off purchase cost (£)')).toHaveValue('10000')
  click(/Preview impact/)
  const preview = within(screen.getByRole('dialog')).getByRole('table')
  const withdrawal = within(preview).getByRole('row', { name: /Indicative annual withdrawal/ }).lastElementChild!.textContent
  click('Save event')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(saved().purchaseEvents[0].recurring).toMatchObject({ startYear: 2027, endYear: 2029 })
  expect(saved().spendingEvents).toEqual([])
  click('Dashboard')
  const tile = screen.getByRole('heading', { name: 'Indicative annual withdrawal' }).parentElement!
  expect(within(tile).getByText(`${withdrawal}/yr`)).toBeVisible()
  click('Plan settings')
  click('Edit Family car'); enter('One-off purchase cost (£)', '5000'); click(/Preview impact/); click('Save event')
  expect(saved().purchaseEvents).toHaveLength(1)
  expect(saved().purchaseEvents[0].upfrontCost).toBe(5000)
  view.unmount(); render(<App />)
  click('Plan settings')
  expect(screen.getByRole('button', { name: 'Edit Family car' })).toBeVisible()
  fireEvent.click(screen.getByLabelText('Include Family car'))
  expect(saved().purchaseEvents[0].enabled).toBe(false)
  click('Delete Family car'); click('Keep event')
  expect(saved().purchaseEvents).toHaveLength(1)
  click('Delete Family car'); click('Confirm deletion')
  expect(saved().purchaseEvents).toEqual([])
})

it('discards invalid or cancelled drafts and restores focus while containing keyboard navigation', () => {
  open(); purchase(); enter('One-off purchase cost (£)', '-1'); click(/Preview impact/)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(within(screen.getByRole('dialog')).getAllByRole('alert').length).toBeGreaterThan(0)
  const last = screen.getByRole('button', { name: /Preview impact/ }); last.focus()
  fireEvent.keyDown(last, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'Close event dialog' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(saved().purchaseEvents).toEqual([])
  expect(screen.getByRole('button', { name: /Add goal or life event/ })).toHaveFocus()
  expect(window.document.body.style.overflow).toBe('')
})

it('saves future children with work changes, preserving names and costs on reload', () => {
  const view = open(); click(/Add goal or life event/); click(/^Future child/)
  enter('Event name', 'Baby Morgan'); enter('Birth year', '2028'); enter('One-off baby cost (£)', '1000')
  for (const label of ['Ages 0–2', 'Ages 3–4', 'Ages 5–11', 'Ages 12–18']) enter(`${label} annual cost (£)`, '2000')
  click('Add parental work change'); enter('Working fraction (0–1) · work change 1', '0.5')
  click(/Preview impact/); click('Save event')
  expect(saved().childEvents[0]).toMatchObject({ name: 'Baby Morgan', birthYear: 2028, workAdjustments: [{ workingFraction: .5 }] })
  expect(saved().snapshot.people).toHaveLength(1)
  expect(documentForecast(saved()).result.error).toBeUndefined()
  view.unmount(); render(<App />); click('Edit Baby Morgan')
  expect(screen.getByLabelText('Ages 5–11 annual cost (£)')).toHaveValue('2000')
})

it('saves home moves and blocks a second move or remortgage in the same year', () => {
  const doc = completeDocument(); doc.moves = [{ ...newPropertyMove(2027), name: 'Existing move', enabled: true, purchasePrice: 400000, annualRate: .04, termYears: 25 }]
  open(doc); click(/Add goal or life event/); click(/^House move/)
  enter('Event name', 'Next home'); enter('Move year', '2027'); enter('New home purchase price (£)', '450000')
  for (const label of ['Estate-agent fee (% of purchase price)', 'Legal fees (% of purchase price)', 'Moving costs (£)', 'Renovation and furnishing (% of purchase price)']) enter(label, '0')
  enter('New mortgage rate (%)', '4'); enter('New mortgage term (years)', '25'); click(/Preview impact/)
  expect(screen.getByRole('alert')).toHaveTextContent('Only one property move')
  enter('Move year', '2030'); click(/Preview impact/); click('Save event')
  expect(saved().moves).toHaveLength(2)
  expect(documentForecast(saved()).result.error).toBeUndefined()
})

it('allows valid events on incomplete households with an unavailable preview and flags out-of-horizon events', () => {
  const doc = completeDocument(); doc.snapshot.people[0]!.pension = ''
  open(doc); purchase(); enter('Purchase year', '2200'); click(/Preview impact/)
  expect(within(screen.getByRole('dialog')).getByText(/Preview unavailable/)).toBeVisible()
  expect(screen.getByText(/starts outside the projection horizon/)).toBeVisible()
  click('Save event'); expect(saved().purchaseEvents).toHaveLength(1)
})

it('offers costs-only rental purchases and makes home moves unavailable to renters', () => {
  const doc = completeDocument(); doc.snapshot.housing = 'rent'
  open(doc); click(/Add goal or life event/)
  expect(screen.getByRole('button', { name: /^House move/ })).toBeDisabled()
  click(/^Purchase/); enter('Purchase type', 'rental-costs')
  expect(screen.getByText(/Property value, financing and rental income are not included/)).toBeVisible()
})

it('supports keyboard year selection and shows exact chart category balances', () => {
  const doc = completeDocument(); doc.completed = true; doc.step = 9
  localStorage.setItem(storageKey, JSON.stringify(doc)); render(<App />)
  const { result } = documentForecast(doc)
  fireEvent.change(screen.getByLabelText('Selected year'), { target: { value: '2' } })
  const chart = screen.getByRole('heading', { name: 'Net worth over time' }).closest('.chart-card')!
  expect(within(chart as HTMLElement).getByText(formatGBPWhole(result.rows[1]!.isa))).toBeVisible()
  expect(screen.getByRole('img', { name: /Combined net worth and asset category chart/ })).toBeVisible()
})

it('previews a property move scenario without persistence until explicitly saved', () => {
  const doc = completeDocument(); doc.moves = [{ ...newPropertyMove(2028), name: 'Family home', enabled: true, purchasePrice: 400000, annualRate: .04, termYears: 25 }]
  open(doc)
  click('Dashboard')
  click('Explore a move')
  expect(screen.getByRole('button', { name: 'Save changes to Family home' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/Move year/), { target: { value: '2030' } })
  expect(saved().moves[0].year).toBe(2028)
  expect(screen.getByRole('button', { name: 'Save changes to Family home' })).toBeEnabled()
  const fireTile = screen.getByRole('heading', { name: 'Net worth at retirement' }).parentElement!
  expect(within(fireTile).getByText(/What-if · current plan/)).toBeVisible()
  expect(screen.getByRole('list', { name: 'Chart legend' })).toHaveTextContent('Current plan')
  click('Reset to current plan')
  expect(saved().moves[0].year).toBe(2028)
  fireEvent.change(screen.getByLabelText(/Move year/), { target: { value: '2030' } })
  click('Save changes to Family home')
  expect(saved().moves[0]).toMatchObject({ year: 2030, enabled: true })
})

it('adds goals from the dashboard and opens milestones at their edit controls', () => {
  const doc = completeDocument(); doc.completed = true; doc.step = 9
  doc.purchaseEvents = [{ id: 'car', name: 'Family car', preset: 'car', enabled: true, year: 2030, upfrontCost: 10000, recurring: null }]
  localStorage.setItem(storageKey, JSON.stringify(doc)); render(<App />)
  click('+ Add goal')
  expect(screen.getByRole('heading', { name: 'Add goal or life event' })).toBeVisible()
  click('Close event dialog')
  click('Family car')
  expect(screen.getByRole('heading', { name: 'Edit Family car' })).toBeVisible()
  click('Close event dialog')
  click('Alex · Work optional')
  expect(screen.getByLabelText('FIRE age')).toHaveFocus()
})
