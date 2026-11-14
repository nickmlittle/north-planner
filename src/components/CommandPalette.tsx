import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { buildCommands, OPEN_COMMAND_PALETTE, rankCommands, readRecentCommands, rememberCommand, type Command, type CommandAction } from '../state/commands'
import { navigateTo } from '../state/navigation'
import { showPlanGrouping } from '../state/planGroups'
import { keyLabels, useShortcut, useShortcuts, type Shortcut } from '../state/shortcuts'
import { Kbd, Sheet } from './ui'
import './CommandPalette.css'

const shiftMonth = (month: string, by: number) => { const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + by, 1)); return date.toISOString().slice(0, 7) }

/**
 * ⌘K (Ctrl+K elsewhere), the sidebar's Search or the phone's search icon on Home: type a few letters, press ↵.
 * Jumps to a screen, item, pot, statement, month or transaction, or runs an action the way its button does.
 */
export function CommandPalette({ document, month, today }: { document: BudgetDocument; month: string; today: string }) {
  const [open, setOpen] = useState(false)
  useShortcut({ keys: 'mod+k', description: 'Search North: jump to anything', group: 'General', run: () => setOpen(true) })
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_COMMAND_PALETTE, show)
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE, show)
  }, [])
  const registered = useShortcuts()
  if (!open) return null
  // A page's own shortcut does the action in place (Add item on Plan); otherwise go to the page that does it.
  const shortcut = (keys: string, description?: string) => registered.find((row: Shortcut) => row.keys === keys && !row.display && (!description || row.description === description) && (!row.when || row.when()))
  const act = (action: CommandAction) => {
    const go = (found: Shortcut | undefined, fallback: () => void) => { if (found) found.run(); else fallback() }
    if (action === 'add-item') go(shortcut('n', 'Add item'), () => navigateTo({ view: 'plan', month }, { historyState: { northAddItem: true } }))
    else if (action === 'bills-by-date') { showPlanGrouping('dates'); navigateTo({ view: 'plan', month }) }
    else if (action === 'bring-in') go(shortcut('i'), () => navigateTo({ view: 'spending', section: 'sort' }, { historyState: { northBringIn: true } }))
    else if (action === 'add-transaction') go(shortcut('n', 'Add a transaction'), () => navigateTo({ view: 'spending', section: 'sort' }, { historyState: { northAddTransaction: true } }))
    else if (action === 'previous-month') go(shortcut('['), () => navigateTo({ month: shiftMonth(month, -1) }))
    else if (action === 'next-month') go(shortcut(']'), () => navigateTo({ month: shiftMonth(month, 1) }))
    else shortcut('?')?.run()
  }
  const run = (command: Command) => {
    rememberCommand(command.id)
    setOpen(false)
    if (command.target.kind === 'go') navigateTo(command.target.to, command.target.state ? { historyState: command.target.state } : {})
    else act(command.target.action)
  }
  return <Palette document={document} month={month} today={today} onRun={run} onClose={() => setOpen(false)}/>
}

function Palette({ document, month, today, onRun, onClose }: { document: BudgetDocument; month: string; today: string; onRun: (command: Command) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const commands = useMemo(() => buildCommands(document, month, today), [document, month, today])
  const [recent] = useState(readRecentCommands)
  const sections = rankCommands(commands, query, recent)
  const flat = sections.flatMap(section => section.commands)
  const current = flat[Math.min(active, flat.length - 1)]
  const optionId = (command: Command) => `${listId}-${command.id.replace(/[^\w-]/g, '_')}`
  useEffect(() => { if (current) window.document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' }) })

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => flat.length ? (Math.min(index, flat.length - 1) + (event.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length : 0) }
    else if (event.key === 'Enter' && current) { event.preventDefault(); onRun(current) }
  }
  return <Sheet title="Search North" onClose={onClose} className="command-palette" dismissOnScrim>
    <div className="palette-field">
      <Search aria-hidden="true"/>
      <input data-autofocus role="combobox" aria-label="Search North" aria-expanded={flat.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={current ? optionId(current) : undefined} placeholder="Search North…" value={query} autoComplete="off" spellCheck={false}
        onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={onKeyDown}/>
    </div>
    <ul id={listId} role="listbox" aria-label="Results" className="palette-results">
      {sections.map(section => <li key={section.group} role="presentation" className="palette-section">
        <p className="palette-group" id={`${listId}-${section.group.replace(/\W/g, '')}`}>{section.group}</p>
        <ul role="group" aria-labelledby={`${listId}-${section.group.replace(/\W/g, '')}`}>
          {section.commands.map(command => <li key={command.id} id={optionId(command)} role="option" aria-selected={command === current} className="palette-option"
            onMouseMove={() => { const index = flat.indexOf(command); if (index !== active) setActive(index) }} onClick={() => onRun(command)}>
            <span className="palette-option-text"><span className="palette-option-title">{command.title}</span>{command.meta && <span className="palette-option-meta">{command.meta}</span>}</span>
            {command.keys && <span className="palette-option-keys" aria-hidden="true">{keyLabels(command.keys).map((label, index) => <Kbd key={index}>{label}</Kbd>)}</span>}
          </li>)}
        </ul>
      </li>)}
    </ul>
    {!flat.length && <p className="palette-empty" role="status">Nothing matches “{query.trim()}”.</p>}
    <p className="palette-foot" aria-hidden="true"><Kbd>↑</Kbd><Kbd>↓</Kbd> move · <Kbd>↵</Kbd> open · <Kbd>esc</Kbd> close</p>
  </Sheet>
}
