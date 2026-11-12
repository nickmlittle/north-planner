// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Breadcrumb, EmptyState, ListRow, Meter, MonthTitle, PageHeader, Section, StatStrip, StatTile, StatusChip, Tabs, useToast } from '.'
afterEach(() => { cleanup(); vi.useRealTimers() })

it('PageHeader is the page’s only h1, and names the document', () => {
  const { unmount } = render(<PageHeader title="Settings" titleText="Settings" context="Household and accounts" breadcrumb={[{ label: 'Home', onClick: () => {} }, { label: 'Settings' }]} actions={<button type="button">Add</button>}/>)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings')
  expect(document.title).toBe('Settings · North')
  unmount()
  render(<PageHeader title={<MonthTitle month="2026-11" onChange={() => {}}/>} titleText="Month" monthLabel="November 2026"/>)
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Month')
  expect(screen.getByRole('button', { name: /November 2026/ })).toBeInTheDocument()
  expect(document.title).toBe('Month · November 2026 · North')
})

it('MonthTitle steps the month with its arrows', () => {
  function Harness() { const [month, setMonth] = useState('2026-11'); return <MonthTitle month={month} onChange={setMonth}/> }
  render(<Harness/>)
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(screen.getByRole('button', { name: /December 2026/ })).toBeInTheDocument()
})

it('Breadcrumb links back and marks the current page', () => {
  const back = vi.fn()
  render(<Breadcrumb items={[{ label: 'Month', onClick: back }, { label: 'Groceries' }]}/>)
  fireEvent.click(screen.getByRole('button', { name: 'Month' }))
  expect(back).toHaveBeenCalled()
  expect(screen.getByText('Groceries')).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
})

it('ListRow is a button with onOpen, a link with href, and plain otherwise', () => {
  const open = vi.fn()
  render(<><ListRow title="Bring in Amex transactions" meta="Last done Mon 9 Nov" onOpen={open} focused/><ListRow title="Move £140.59" href="#move" trailing="£140.59"/><ListRow title="All sorted" tone="done"/></>)
  const button = screen.getByRole('button', { name: /Bring in Amex transactions/ })
  fireEvent.click(button)
  expect(open).toHaveBeenCalled()
  expect(button).toHaveAttribute('data-focused')
  expect(screen.getByRole('link', { name: /Move £140.59/ })).toHaveAttribute('href', '#move')
  expect(screen.getByText('All sorted').closest('.list-row')!.tagName).toBe('DIV')
  expect(screen.getByText('All sorted').closest('.list-row')).toHaveClass('is-done')
})

it('Tabs follow the ARIA tabs pattern, and arrow keys move and select', () => {
  function Harness() { const [tab, setTab] = useState('sort'); return <Tabs label="Spending" current={tab} onSelect={setTab} tabs={[{ id: 'sort', label: 'To sort', count: 4 }, { id: 'all', label: 'Transactions' }, { id: 'statements', label: 'Statements' }]}><p>{tab} panel</p></Tabs> }
  render(<Harness/>)
  const list = screen.getByRole('tablist', { name: 'Spending' })
  const [sort, all, statements] = screen.getAllByRole('tab')
  expect(sort).toHaveAttribute('aria-selected', 'true')
  expect(sort).toHaveAccessibleName('To sort4')
  expect(all).toHaveAttribute('tabindex', '-1')
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName('To sort4')
  fireEvent.keyDown(list, { key: 'ArrowRight' })
  expect(all).toHaveAttribute('aria-selected', 'true')
  expect(all).toHaveFocus()
  fireEvent.keyDown(list, { key: 'End' })
  expect(statements).toHaveFocus()
  fireEvent.keyDown(list, { key: 'ArrowRight' })
  expect(sort).toHaveFocus()
  expect(screen.getByRole('tabpanel')).toHaveTextContent('sort panel')
})

it('Meter is an image with the caller’s words, and hatches what’s over', () => {
  render(<Meter value={442966} max={400000} label="Ada: £4,429.66 planned of £4,000.00, £429.66 over"/>)
  const meter = screen.getByRole('img', { name: 'Ada: £4,429.66 planned of £4,000.00, £429.66 over' })
  expect(meter.querySelector('.meter-over')).not.toBeNull()
  expect((meter.querySelector('.meter-fill') as HTMLElement).style.width).toBe(`${400000 / 442966 * 100}%`)
})

it('StatusChip always has words, and StatTile tones only its value', () => {
  render(<><StatusChip tone="warning" dot>Ahead of pace</StatusChip><StatStrip label="This month"><StatTile label="Plan" value="£1,141.87 over" tone="critical" onOpen={() => {}} openLabel="Open Plan"/></StatStrip></>)
  expect(screen.getByText('Ahead of pace')).toHaveClass('status-chip', 'is-warning')
  expect(screen.getByRole('region', { name: 'This month' })).toHaveTextContent('Plan£1,141.87 overOpen Plan')
  expect(screen.getByText('£1,141.87 over').closest('.stat-tile')).toHaveClass('is-critical')
})

it('Section has one heading style, and folds to a row that expands', () => {
  const expand = vi.fn()
  render(<><Section title="Pots" count={9} aside="In Monzo"><p>Body</p></Section><Section title="Payday" collapsed={{ summary: 'Done · 18 of 18', onExpand: expand }}/></>)
  expect(screen.getByRole('region', { name: 'Pots9' })).toHaveTextContent('Body')
  const fold = screen.getByRole('button', { name: /Payday/ })
  expect(fold).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(fold)
  expect(expand).toHaveBeenCalled()
})

it('EmptyState says what’s missing and offers one action', () => {
  render(<EmptyState title="Nothing to sort" action={<button type="button">Bring in transactions</button>}>Bring in the latest export.</EmptyState>)
  expect(screen.getByText('Nothing to sort')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bring in transactions' })).toBeInTheDocument()
})

it('useToast announces politely and clears after 2.5s', () => {
  vi.useFakeTimers()
  function Harness() { const { show, toast } = useToast(); return <><button type="button" onClick={() => show('Copied £2,215.45')}>Copy</button>{toast}</> }
  render(<Harness/>)
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(screen.getByRole('status')).toHaveTextContent('Copied £2,215.45')
  act(() => { vi.advanceTimersByTime(2500) })
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})
