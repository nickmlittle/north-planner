// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useListNavigation } from './useListNavigation'
import { useShortcuts } from './shortcuts'

afterEach(cleanup)

function List({ onOpen = vi.fn(), onTick = vi.fn(), onCopy = vi.fn() }: { onOpen?: (name: string) => void; onTick?: (name: string) => void; onCopy?: (name: string) => void }) {
  const keys = useListNavigation({ label: 'Steps', keys: { enter: 'Open', x: 'Tick', c: 'Copy the amount' } })
  return <><button type="button">Before</button><ul aria-label="Steps" {...keys.listProps}>{keys.hint}{['One', 'Two', 'Three'].map(name => <li key={name} data-list-row aria-label={name}>
    {name}<button type="button" data-list-open onClick={() => onOpen(name)}>Open {name}</button>
    <button type="button" data-list-tick onClick={() => onTick(name)}>Tick {name}</button>
    <button type="button" data-list-copy onClick={() => onCopy(name)}>£1.00</button>
  </li>)}</ul><input aria-label="Field"/><button type="button">After</button></>
}
const row = (name: string) => screen.getByRole('listitem', { name })

it('makes the list one Tab stop, with the rows’ own controls out of the Tab order', () => {
  render(<List/>)
  expect([...document.querySelectorAll('li')].map(li => li.tabIndex)).toEqual([0, -1, -1])
  expect(screen.getByRole('button', { name: 'Tick One' }).tabIndex).toBe(-1)
  expect(screen.getByRole('button', { name: 'Before' }).tabIndex).toBe(0)
  expect(screen.getByRole('list', { name: 'Steps' })).toHaveAccessibleDescription('Steps: use J and K to move, Enter to open, X to tick, C to copy the amount.')
})

it('moves with J/K and the arrows, jumps with Home/End, and remembers the last row as the Tab stop', () => {
  render(<List/>)
  row('One').focus()
  fireEvent.keyDown(row('One'), { key: 'j' })
  expect(row('Two')).toHaveFocus()
  fireEvent.keyDown(row('Two'), { key: 'ArrowDown' })
  expect(row('Three')).toHaveFocus()
  fireEvent.keyDown(row('Three'), { key: 'j' })
  expect(row('Three')).toHaveFocus()
  fireEvent.keyDown(row('Three'), { key: 'Home' })
  expect(row('One')).toHaveFocus()
  fireEvent.keyDown(row('One'), { key: 'End' })
  fireEvent.keyDown(row('Three'), { key: 'k' })
  expect(row('Two')).toHaveFocus()
  expect([...document.querySelectorAll('li')].map(li => li.tabIndex)).toEqual([-1, 0, -1])
  fireEvent.keyDown(row('Two'), { key: 'Escape' })
  expect(screen.getByRole('list', { name: 'Steps' })).toHaveFocus()
})

it('opens with Enter and acts with X and C on the focused row, from the row or its controls', () => {
  const onOpen = vi.fn(), onTick = vi.fn(), onCopy = vi.fn()
  render(<List onOpen={onOpen} onTick={onTick} onCopy={onCopy}/>)
  row('Two').focus()
  fireEvent.keyDown(row('Two'), { key: 'Enter' })
  expect(onOpen).toHaveBeenCalledWith('Two')
  fireEvent.keyDown(row('Two'), { key: 'x' })
  expect(onTick).toHaveBeenCalledWith('Two')
  fireEvent.keyDown(screen.getByRole('button', { name: 'Tick Two' }), { key: 'c' })
  expect(onCopy).toHaveBeenCalledWith('Two')
  // Shift, modifiers and typing elsewhere do nothing.
  fireEvent.keyDown(row('Two'), { key: 'X', shiftKey: true })
  fireEvent.keyDown(row('Two'), { key: 'c', metaKey: true })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Field' }), { key: 'x' })
  expect(onTick).toHaveBeenCalledTimes(1)
  expect(onCopy).toHaveBeenCalledTimes(1)
})

function Sheet() {
  return <dl>{useShortcuts().map(shortcut => <div key={shortcut.keys}><dt>{shortcut.keys}</dt><dd>{shortcut.description}</dd></div>)}</dl>
}

it('lists its keys for ? while on screen, without handling them globally', () => {
  const onTick = vi.fn()
  const { unmount } = render(<><List onTick={onTick}/><Sheet/></>)
  expect(screen.getByText('j / ↓')).toBeInTheDocument()
  expect(screen.getByText('Tick')).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'x' })
  fireEvent.keyDown(document.body, { key: 'j' })
  expect(onTick).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(document.body)
  unmount()
  render(<Sheet/>)
  expect(screen.queryByText('j / ↓')).not.toBeInTheDocument()
})
