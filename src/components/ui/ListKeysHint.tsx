import { Kbd } from './Kbd'
import './ListKeysHint.css'

/** A list's keys beside its heading, "J K move · ↵ open": desktop with a pointer only. Screen readers get the list's own hint. */
export function ListKeysHint({ keys }: { keys: Array<[string, string]> }) {
  return <span className="list-keys-hint" aria-hidden="true">{keys.map(([key, text], index) => <span key={key}>{index > 0 && ' · '}{key.split(' ').map(part => <Kbd key={part}>{part}</Kbd>)} {text}</span>)}</span>
}
