import { keyLabels, useShortcuts, type ShortcutGroup } from '../../state/shortcuts'
import { Kbd } from './Kbd'
import { Sheet } from './Sheet'
import './ShortcutsSheet.css'

type Row = { keys: string; description: string; group: ShortcutGroup }
const groups: ShortcutGroup[] = ['Go to', 'This page', 'Lists', 'General']

/** "Keyboard shortcuts" (?): every shortcut active on this page, grouped, plus `extra` rows a page handles itself. */
export function ShortcutsSheet({ extra = [], onClose }: { extra?: Row[]; onClose: () => void }) {
  const registered = useShortcuts().filter(shortcut => !shortcut.when || shortcut.when())
  // One row per key: a page's registration replaces the shell's.
  const rows = [...new Map([...registered, ...extra].map(row => [row.keys, row])).values()]
  return <Sheet title="Keyboard shortcuts" onClose={onClose} className="shortcuts-sheet" dismissOnScrim>
    {groups.map(group => {
      const inGroup = rows.filter(row => row.group === group)
      return inGroup.length > 0 && <section key={group} className="shortcuts-group" aria-label={group}>
        <h3>{group}</h3>
        <dl>{inGroup.map(row => <div key={row.keys}><dt>{row.description}</dt><dd>{row.keys.split(' / ').map((alternative, index) => <span key={alternative} className="shortcuts-keys">{index > 0 && <span className="shortcuts-or">or</span>}{keyLabels(alternative).map((label, part) => <Kbd key={part}>{label}</Kbd>)}</span>)}</dd></div>)}</dl>
      </section>
    })}
  </Sheet>
}
