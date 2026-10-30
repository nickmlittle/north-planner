import type { ReactNode } from 'react'
import { PlannerHeader, type PlannerHeaderProps } from './PlannerHeader'

export function AppLayout({ children, navigation, pageClass = '' }: { children: ReactNode; navigation: PlannerHeaderProps; pageClass?: string }) {
  return <div className={`planner-app-shell ${pageClass}`}>
    <PlannerHeader {...navigation} />
    <main className="planner-app-content">{children}</main>
  </div>
}
