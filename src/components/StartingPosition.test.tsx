// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StartingPosition } from './StartingPosition'
import { useHousehold } from '../state/useHousehold'

afterEach(cleanup)

function StateHarness() {
  const { household, update } = useHousehold()
  return <><StartingPosition household={household} onChange={update} /><output data-testid="household">{JSON.stringify(household)}</output></>
}

it('displays all default inputs and formats every balance as GBP', () => {
  render(<StateHarness />)
  for (const [label, value] of [
    ['Nick age', '32'], ['Immy age', '31'], ['Base year', '2026'],
    ['Nick ISA balance (GBP)', '£88,000.00'], ['Immy ISA balance (GBP)', '£1,000.00'],
    ['Nick pension balance (GBP)', '£117,000.00'], ['Immy pension balance (GBP)', '£25,000.00'],
    ['Current house value (GBP)', '£850,000.00'], ['Current mortgage balance (GBP)', '£446,000.00'],
    ['Household cash balance (GBP)', '£0.00'],
  ]) expect(screen.getByLabelText(label!)).toHaveValue(value)
})

it('updates numeric household state immediately, retaining the last valid value on errors', () => {
  render(<StateHarness />)
  const input = screen.getByLabelText('Nick ISA balance (GBP)')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '90000.25' } })
  expect(JSON.parse(screen.getByTestId('household').textContent!).isas[0].value).toBe(90000.25)
  fireEvent.blur(input)
  expect(input).toHaveValue('£90,000.25')
  for (const raw of ['-100', '', 'NaN', 'Infinity', 'abc']) {
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: raw } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Last valid value retained')
    expect(JSON.parse(screen.getByTestId('household').textContent!).isas[0].value).toBe(90000.25)
    fireEvent.blur(input)
    expect(input).toHaveValue(raw)
  }
  fireEvent.change(input, { target: { value: '0' } })
  expect(input).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(JSON.parse(screen.getByTestId('household').textContent!).isas[0].value).toBe(0)
})

it('accepts zero mortgage and updates age edits in the household model', () => {
  render(<StateHarness />)
  const mortgage = screen.getByLabelText('Current mortgage balance (GBP)')
  fireEvent.focus(mortgage)
  fireEvent.change(mortgage, { target: { value: '0' } })
  fireEvent.blur(mortgage)
  expect(mortgage).toHaveValue('£0.00')
  expect(JSON.parse(screen.getByTestId('household').textContent!).mortgages[0].balance).toBe(0)
  fireEvent.change(screen.getByLabelText('Nick age'), { target: { value: '35' } })
  expect(JSON.parse(screen.getByTestId('household').textContent!).people[0].birthYear).toBe(1991)
})

it('updates displayed ages when editing the base year and flags invalid years', () => {
  render(<StateHarness />)
  const year = screen.getByLabelText('Base year')
  fireEvent.change(year, { target: { value: '2027' } })
  expect(screen.getByLabelText('Nick age')).toHaveValue('33')
  expect(screen.getByLabelText('Immy age')).toHaveValue('32')
  fireEvent.change(year, { target: { value: '2101' } })
  expect(year).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Nick age')).toHaveValue('33')
})
