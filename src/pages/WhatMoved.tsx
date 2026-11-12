import { useState } from 'react'
import { Info, X } from 'lucide-react'
import { ListRow } from '../components/ui'
import './WhatMoved.css'

const KEY = 'north.whatMoved'
const seen = () => { try { return !!window.localStorage.getItem(KEY) } catch { return true } }

/** Once, on Home after the new navigation (audit 3 PR 06): where Transfers and Household went. Dismissed per device. */
export function WhatMoved() {
  const [hidden, setHidden] = useState(seen)
  if (hidden) return null
  const dismiss = () => { try { window.localStorage.setItem(KEY, '1') } catch { /* Shown again next time; harmless. */ } setHidden(true) }
  return <div className="what-moved" role="note">
    <ListRow icon={<Info/>} title="Transfers is now Payday, on Month. Household is in Settings." trailing={<button type="button" className="what-moved-dismiss" aria-label="Dismiss" title="Dismiss" onClick={dismiss}><X aria-hidden="true"/></button>}/>
  </div>
}
