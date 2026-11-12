import { useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetImpact } from '../domain/budgetImpact'
import { budgetImpact } from '../domain/budgetImpact'
import { PageFrame } from '../components/PageFrame'
import { formatMonth as monthLabel } from '../formatting/month'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImpactPreview } from '../components/ImpactPreview'
import { MonthPage } from './MonthPage'
import { BudgetInfoDialog } from './MobileBudgetViews'
import { PlanPage, type PlanPageHandle } from './PlanPage'
import { PaydaySection } from './month/PaydaySection'
import { BudgetPageHeader } from './budget/BudgetPageHeader'
import { useMonthBudget } from './budget/useMonthBudget'
import { usePlanView } from './budget/usePlanView'
import type { PlanDestination, SettingsSection, StepsReturn } from '../state/navigation'
import { MOBILE_QUERY } from '../breakpoints'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; saveStatus?: string; accountBacked?: boolean; view?: 'month' | 'plan'; month?: string; potId?: string | null; closing?: boolean; onOpenPot?: (potId: string | null) => void; onOpenClose?: (open: boolean) => void; onOpenSort?: () => void; today?: string; onMonthChange?: (month: string) => void; onSeeTransferItems?: (accountId: string) => void; planDestination?: PlanDestination | null; onClearPlanDestination?: () => void; onReturnToTransfers?: () => void; onOpenPlan?: () => void; reviewPersonId?: string; onViewAffectedTransfers?: (impact: BudgetImpact) => void; affectedTransfers?: BudgetImpact | null; hasTransfersOrigin?: boolean; stepsReturn?: StepsReturn | null; planItemId?: string; onOpenSettings?: (section: SettingsSection) => void }
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches

/**
 * The budget for one month, as Plan or Month. Plan's browsing state (search, filters, open groups) and the dialogs
 * both screens open live here, so a trip from Plan to Month and back keeps them; only the active screen renders.
 */
export function MonthlyBudget({document,setDocument,saveStatus,view:sharedView,month:sharedMonth,onMonthChange,onSeeTransferItems,planDestination,onClearPlanDestination,onReturnToTransfers,onOpenPlan,reviewPersonId,onViewAffectedTransfers,affectedTransfers,hasTransfersOrigin,stepsReturn,planItemId,potId,closing,onOpenPot=()=>{},onOpenClose=()=>{},onOpenSort=()=>{},onOpenSettings=()=>{},today}:Props) {
 const mobilePresentation=useSyncExternalStore(subscribeMobile,getMobile,()=>false)
 const [localMonth,setLocalMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
 const month=sharedMonth??localMonth
 const setMonth=onMonthChange??setLocalMonth
 const view=sharedView??'plan'
 const budget=useMonthBudget(document,month)
 const planView=usePlanView({budget,month,view,planDestination,planItemId,reviewPersonId,mobilePresentation})
 const plan=useRef<PlanPageHandle>(null)
 const [optionsOpen,setOptionsOpen]=useState(false)
 const monthOptionsRef=useRef<HTMLButtonElement>(null)
 const [confirm,setConfirm]=useState<{title:string;body:ReactNode;confirmLabel:string;onConfirm:()=>void;returnFocusTo:()=>HTMLElement|null|undefined}|null>(null)
 const {revertLabel,revertReplacement,editScopeLabel,snapshotsWithoutMonth}=budget
 // Income, accounts, pots and categories are edited in Settings; Back returns here.
 const openIncome=()=>onOpenSettings('income')
 const openAccounts=()=>onOpenSettings('accounts')
 const removeDate=()=>{
  if(!revertLabel)return
  const next={...document,budget:{...document.budget,snapshots:snapshotsWithoutMonth()}}
  setConfirm({title:`${revertLabel}?`,body:<ImpactPreview label="Before removing" scopeText={`${editScopeLabel} will use ${revertReplacement}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:revertLabel,returnFocusTo:()=>monthOptionsRef.current?.offsetParent?monthOptionsRef.current:window.document.querySelector<HTMLElement>('.budget-v3-month button[aria-haspopup]'),onConfirm:()=>setDocument(current=>{const snapshots={...current.budget.snapshots};delete snapshots[month];return {...current,budget:{...current.budget,snapshots}}})})
 }
 const scopedPlan=mobilePresentation&&view==='plan'&&!!planDestination
 const header=<BudgetPageHeader document={document} month={month} onMonthChange={setMonth} carriedOverNote={budget.carriedOverNote} revertLabel={revertLabel} onRevert={removeDate} mobilePresentation={mobilePresentation} optionsRef={monthOptionsRef} onOpenOptions={()=>setOptionsOpen(true)}
  options={[{label:'Edit income',onSelect:openIncome},{label:'Accounts, pots & categories',onSelect:openAccounts}]} onAddItem={()=>plan.current?.addItem()}/>
 const payday=({byAccount,onByAccount}:{byAccount:boolean;onByAccount:(value:boolean)=>void})=><PaydaySection document={document} setDocument={setDocument} month={month} budget={budget} mobilePresentation={mobilePresentation} byAccount={byAccount} onByAccount={onByAccount} affectedTransfers={affectedTransfers} stepsReturn={stepsReturn} onSeeItems={onSeeTransferItems} onEditIncome={openIncome} onReviewPerson={personId=>{planView.reviewPerson(personId);onOpenPlan?.()}} onOpenPlan={onOpenPlan}/>
 const page=view==='month'
  ?<MonthPage document={document} setDocument={setDocument} month={month} onMonthChange={setMonth} payday={payday} onOpenPlan={onOpenPlan} onOpenPotSettings={()=>onOpenSettings('accounts')} potId={potId} closing={closing} onOpenPot={onOpenPot} onOpenClose={onOpenClose} onSort={onOpenSort} today={today}/>
  :<PageFrame afterHeading={header} title={`Plan, ${monthLabel(month)}`} headingClass="route-heading visually-hidden" className={`monthly-budget-page budget-view-plan${scopedPlan?' scoped-plan':''}`} contentWidth="wide" regions={<PlanPage ref={plan} document={document} setDocument={setDocument} month={month} budget={budget} planView={planView} mobilePresentation={mobilePresentation} scoped={scopedPlan} saveStatus={saveStatus} planDestination={planDestination} planItemId={planItemId} onClearPlanDestination={onClearPlanDestination} onReturnToTransfers={onReturnToTransfers} hasTransfersOrigin={hasTransfersOrigin} onViewAffectedTransfers={onViewAffectedTransfers} onEditIncome={openIncome}/>}/>
 return <>{page}
 {confirm&&<ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} danger returnFocusTo={confirm.returnFocusTo} onCancel={()=>setConfirm(null)} onConfirm={()=>{confirm.onConfirm();setConfirm(null)}}>{confirm.body}</ConfirmDialog>}
 {optionsOpen&&<BudgetInfoDialog title="Plan options" onClose={()=>setOptionsOpen(false)}>
  <div className="budget-month-actions"><button type="button" className="secondary-button" onClick={()=>{setOptionsOpen(false);openIncome()}}>Edit income</button><button type="button" className="secondary-button" onClick={()=>{setOptionsOpen(false);openAccounts()}}>Accounts, pots &amp; categories</button>{revertLabel&&<button type="button" className="text-button budget-remove-action" onClick={()=>{removeDate();setOptionsOpen(false)}}>{revertLabel}</button>}</div>
 </BudgetInfoDialog>}
 </>
}
