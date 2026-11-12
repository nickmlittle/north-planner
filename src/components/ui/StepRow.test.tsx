// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StepGroup, StepRow } from './StepRow'
afterEach(cleanup)

const list = (row: React.ReactNode) => render(<StepGroup title="Monzo Joint" aside="Either of you" label="Joint steps">{row}</StepGroup>)

it('ticks and copies with separate targets', () => {
  const onTick = vi.fn(), onCopy = vi.fn()
  list(<StepRow stepKey="ada:fund:joint" name="Fund Monzo Joint" amountPence={221545} onTick={onTick} onCopy={onCopy}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Copy £2,215.45' }))
  expect(onCopy).toHaveBeenCalledWith(221545)
  expect(onTick).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Fund Monzo Joint done' }))
  expect(onTick).toHaveBeenCalledWith('ada:fund:joint', 221545)
  expect(onCopy).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('region', { name: 'Joint steps' })).toHaveTextContent('Monzo JointEither of you')
})

it('unticks a done step, and shows when it was ticked if asked', () => {
  const onTick = vi.fn()
  list(<StepRow stepKey="settle:pay" name="Pay Amex from Joint" amountPence={4000} ticks={{ 'settle:pay': { amountPence: 4000, at: '2026-11-18T09:00:00.000Z' } }} onTick={onTick} showTickedDay emphasis="pay"/>)
  const tick = screen.getByRole('button', { name: 'Pay Amex from Joint done' })
  expect(tick).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('listitem')).toHaveClass('is-done', 'is-pay')
  expect(screen.getByRole('listitem')).toHaveTextContent('Ticked Wed 18 Nov')
  fireEvent.click(tick)
  expect(onTick).toHaveBeenCalledWith('settle:pay', null)
})

it('changed since ticked: shows and copies the difference, and ticking accepts the new amount', () => {
  const onTick = vi.fn(), onCopy = vi.fn()
  list(<StepRow stepKey="ada:fund:joint" name="Fund Monzo Joint" amountPence={100900} ticks={{ 'ada:fund:joint': { amountPence: 95900, at: '2026-11-01T09:00:00.000Z' } }} onTick={onTick} onCopy={onCopy}/>)
  expect(screen.getByRole('listitem')).toHaveTextContent('Changed since ticked: you sent £959.00, it’s now £1,009.00. Send £50.00 more.')
  fireEvent.click(screen.getByRole('button', { name: 'Copy £50.00' }))
  expect(onCopy).toHaveBeenCalledWith(5000)
  fireEvent.click(screen.getByRole('button', { name: 'Fund Monzo Joint: mark the change done' }))
  expect(onTick).toHaveBeenCalledWith('ada:fund:joint', 100900)
})

it('copy mode has no tick; status mode has a mark but no buttons', () => {
  list(<><StepRow mode="copy" stepKey="out" name="Out of Groceries" amountPence={4460} indent/><StepRow mode="status" stepKey="set-aside" name="Everything is in the Amex pot" done/></>)
  expect(screen.queryByRole('button', { name: /done$/ })).toBeNull()
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(screen.getAllByRole('listitem')[0]).toHaveClass('is-copy', 'is-indent')
  expect(screen.getAllByRole('listitem')[1]).toHaveClass('is-done')
})
