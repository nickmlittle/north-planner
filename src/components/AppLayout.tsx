import type { ReactNode } from 'react'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header><span className="wordmark">North Planner</span></header>
      <main>{children}</main>
      <footer>Household financial planning · V1</footer>
    </div>
  )
}
