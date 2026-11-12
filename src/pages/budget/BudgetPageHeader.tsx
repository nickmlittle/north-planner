import { useSyncExternalStore, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis, Plus } from 'lucide-react'
import type { BudgetDocument } from '../../domain/budgetDocument'
import { budgetDateMarkers, incomeDateMarkers } from '../../domain/monthlyBudget'
import { BudgetOptionsMenu } from '../BudgetOptionsMenu'
import { MonthControl } from '../MonthControl'
import { Kbd } from '../../components/ui/Kbd'

const subscribeNothing = () => () => {}
const findHeaderSlot = () => window.document.getElementById('mobile-header-page-slot')

type Props = { document: BudgetDocument; month: string; onMonthChange: (month: string) => void; carriedOverNote: string | null; revertLabel?: string; onRevert: () => void; mobilePresentation: boolean; optionsRef: RefObject<HTMLButtonElement | null>; onOpenOptions: () => void; options: { label: string; onSelect: () => void }[]; onAddItem?: () => void }

/**
 * Plan's title bar: the month is the page title, with the budget's actions on the same row.
 * On phones the app header carries the month, ⋯ and the budget note instead (left of the account button), so the page has no title bar.
 */
export function BudgetPageHeader({ document, month, onMonthChange, carriedOverNote, revertLabel, onRevert, mobilePresentation, optionsRef, onOpenOptions, options, onAddItem }: Props) {
 // The app header's slot for the month and ⋯ on phones; absent when the page renders on its own (tests, setup).
 const headerSlot=useSyncExternalStore(subscribeNothing,findHeaderSlot,()=>null)
 const budgetDateNote=carriedOverNote&&<p className="budget-v3-date-note">{carriedOverNote}</p>
 const monthControl=<MonthControl month={month} onChange={onMonthChange} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)} revertLabel={revertLabel} onRevert={onRevert}/>
 // Phones: one ⋯ for the budget's actions, beside the month (in the app header when it has room for them).
 const mobileOptions=<button ref={optionsRef} type="button" className="budget-mobile-options" aria-label="Plan options" title="Plan options" aria-haspopup="dialog" onClick={onOpenOptions}><Ellipsis aria-hidden="true"/></button>
 const inHeader=mobilePresentation&&!!headerSlot
 if(inHeader)return createPortal(<div className="mobile-header-page">{monthControl}{mobileOptions}{budgetDateNote}</div>,headerSlot)
 return <div className="budget-page-titlebar"><div className="budget-v3-date-selector">{monthControl}<div className="budget-v3-date-context">{budgetDateNote}{mobilePresentation&&mobileOptions}</div></div><div className="budget-v3-tools budget-desktop-toolbar"><BudgetOptionsMenu options={options}/>{onAddItem&&<button type="button" className="primary-button" onClick={onAddItem}><Plus aria-hidden="true"/>Add item<span className="shortcut-hint" aria-hidden="true"><Kbd>N</Kbd></span></button>}</div></div>
}
