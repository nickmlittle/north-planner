import type { ReactNode } from 'react'
import './Kbd.css'

/** A key, as in "Press / to search". */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
