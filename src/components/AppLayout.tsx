import type { ReactNode } from 'react'
import { PlannerHeader, type PlannerHeaderProps } from './PlannerHeader'

export function AppLayout({ children, navigation }: { children: ReactNode; navigation: PlannerHeaderProps }) {
  return <div className="planner-app-shell">
    <PlannerHeader {...navigation} />
    <main className="planner-app-content">{children}</main>
  </div>
}
