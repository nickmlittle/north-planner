import { MonthControl } from '../../pages/MonthControl'
import './MonthTitle.css'

/**
 * The month as a page title: ‹ November 2026 › with the picker on the month. Use it as PageHeader's title
 * (with titleText "November 2026"). [ and ] will step the month (keyboard, PR 07).
 */
export function MonthTitle({ month, onChange, budgetMarkers = [], incomeMarkers = [], revertLabel, onRevert }: { month: string; onChange: (month: string) => void; budgetMarkers?: string[]; incomeMarkers?: string[]; revertLabel?: string; onRevert?: () => void }) {
  return <div className="month-title"><MonthControl month={month} onChange={onChange} budgetMarkers={budgetMarkers} incomeMarkers={incomeMarkers} revertLabel={revertLabel} onRevert={onRevert}/></div>
}
