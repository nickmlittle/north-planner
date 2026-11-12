import { useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetImpact } from '../domain/budgetImpact'
import { budgetImpact } from '../domain/budgetImpact'
import { PageFrame } from '../components/PageFrame'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImpactPreview } from '../components/ImpactPreview'
import { AccountStatusPanel } from '../components/AccountStatusPanel'
import { saveStatusLabel } from '../components/saveStatus'
import { BudgetManagement } from './BudgetManagement'
import { BudgetInfoDialog } from './MobileBudgetViews'
import { IncomeDialog } from './IncomeDialog'
import { PlanPage, type PlanPageHandle } from './PlanPage'
import { PaydayPage } from './PaydayPage'
import { BudgetPageHeader } from './budget/BudgetPageHeader'
import { useMonthBudget } from './budget/useMonthBudget'
import { usePlanView } from './budget/usePlanView'
import type { PlanDestination, StepsReturn } from '../state/navigation'
import { MOBILE_QUERY } from '../breakpoints'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; saveStatus?: string; accountBacked?: boolean; mobileBudgetView?: 'transfers' | 'plan'; month?: string; onMonthChange?: (month: string) => void; onSeeTransferItems?: (accountId: string) => void; planDestination?: PlanDestination | null; onClearPlanDestination?: () => void; onReturnToTransfers?: () => void; onOpenPlan?: () => void; reviewPersonId?: string; onViewAffectedTransfers?: (impact: BudgetImpact) => void; affectedTransfers?: BudgetImpact | null; hasTransfersOrigin?: boolean; stepsReturn?: StepsReturn | null; planItemId?: string; warning?: string; email?: string; onSignOut?: () => void }
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches

/**
 * The budget for one month, as Plan or Transfers under one title and month. The frame, title bar,
 * Plan's browsing state and the dialogs both screens open live here; only the active screen renders.
 */
export function MonthlyBudget({document,setDocument,saveStatus,mobileBudgetView:sharedMobileBudgetView,month:sharedMonth,onMonthChange,onSeeTransferItems,planDestination,onClearPlanDestination,onReturnToTransfers,onOpenPlan,reviewPersonId,onViewAffectedTransfers,affectedTransfers,hasTransfersOrigin,stepsReturn,planItemId,warning='',email,onSignOut}:Props) {
 const mobilePresentation=useSyncExternalStore(subscribeMobile,getMobile,()=>false)
 const [localMonth,setLocalMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
 const month=sharedMonth??localMonth
 const setMonth=onMonthChange??setLocalMonth
 const mobileBudgetView=sharedMobileBudgetView??'plan'
 const budget=useMonthBudget(document,month)
 const planView=usePlanView({budget,month,view:mobileBudgetView,planDestination,planItemId,reviewPersonId,mobilePresentation})
 const plan=useRef<PlanPageHandle>(null)
 const [management,setManagement]=useState(false),[incomeOpen,setIncomeOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false)
 const monthOptionsRef=useRef<HTMLButtonElement>(null), optionsHandoff=useRef(false)
 useLayoutEffect(()=>{
  if(!optionsHandoff.current||(!incomeOpen&&!management))return
  const trigger=monthOptionsRef.current
  window.document.querySelector<HTMLElement>('.budget-v3-overlay button, .budget-v3-overlay input')?.focus()
  return()=>{trigger?.focus({preventScroll:true});optionsHandoff.current=false}
 },[incomeOpen,management])
 const [confirm,setConfirm]=useState<{title:string;body:ReactNode;confirmLabel:string;onConfirm:()=>void;returnFocusTo:()=>HTMLElement|null|undefined}|null>(null)
 const {revertLabel,revertReplacement,editScopeLabel,snapshotsWithoutMonth}=budget
 const openIncome=()=>setIncomeOpen(true)
 const removeDate=()=>{
  if(!revertLabel)return
  const next={...document,budget:{...document.budget,snapshots:snapshotsWithoutMonth()}}
  setConfirm({title:`${revertLabel}?`,body:<ImpactPreview label="Before removing" scopeText={`${editScopeLabel} will use ${revertReplacement}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:revertLabel,returnFocusTo:()=>monthOptionsRef.current?.offsetParent?monthOptionsRef.current:window.document.querySelector<HTMLElement>('.budget-v3-month button[aria-haspopup]'),onConfirm:()=>setDocument(current=>{const snapshots={...current.budget.snapshots};delete snapshots[month];return {...current,budget:{...current.budget,snapshots}}})})
 }
 const status=saveStatusLabel(saveStatus??'Saved',warning)
 const scopedPlan=mobilePresentation&&mobileBudgetView==='plan'&&!!planDestination
 const header=<BudgetPageHeader document={document} month={month} onMonthChange={setMonth} carriedOverNote={budget.carriedOverNote} revertLabel={revertLabel} onRevert={removeDate} mobilePresentation={mobilePresentation} status={status} optionsRef={monthOptionsRef} onOpenOptions={()=>setAccountOpen(true)}
  options={[{label:'Edit income',onSelect:openIncome},{label:'Manage accounts, pots & categories',onSelect:()=>setManagement(true)}]} onAddItem={mobileBudgetView==='plan'?()=>plan.current?.addItem():undefined}/>
 const page=mobileBudgetView==='plan'
  ?<PlanPage ref={plan} document={document} setDocument={setDocument} month={month} budget={budget} planView={planView} mobilePresentation={mobilePresentation} scoped={scopedPlan} saveStatus={saveStatus} planDestination={planDestination} planItemId={planItemId} onClearPlanDestination={onClearPlanDestination} onReturnToTransfers={onReturnToTransfers} hasTransfersOrigin={hasTransfersOrigin} onViewAffectedTransfers={onViewAffectedTransfers} onEditIncome={openIncome}/>
  :<PaydayPage document={document} setDocument={setDocument} month={month} budget={budget} mobilePresentation={mobilePresentation} affectedTransfers={affectedTransfers} stepsReturn={stepsReturn} onSeeItems={onSeeTransferItems} onEditIncome={openIncome} onReviewPerson={personId=>{planView.reviewPerson(personId);onOpenPlan?.()}}/>
 return <><PageFrame afterHeading={header} title="Monthly budget" headingClass="route-heading visually-hidden" className={`monthly-budget-page budget-view-${mobileBudgetView}${scopedPlan?' scoped-plan':''}`} contentWidth="wide" regions={page}/>
 {confirm&&<ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} danger returnFocusTo={confirm.returnFocusTo} onCancel={()=>setConfirm(null)} onConfirm={()=>{confirm.onConfirm();setConfirm(null)}}>{confirm.body}</ConfirmDialog>}
 {accountOpen&&<BudgetInfoDialog title="Budget and account" onClose={()=>setAccountOpen(false)}>
  <div className="budget-month-actions"><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setAccountOpen(false);openIncome()}}>Edit income</button><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setAccountOpen(false);setManagement(true)}}>Manage accounts, pots &amp; categories</button>{revertLabel&&<button type="button" className="text-button budget-remove-action" onClick={()=>{removeDate();setAccountOpen(false)}}>{revertLabel}</button>}</div>
  <div className="budget-account-status"><AccountStatusPanel status={status} warning={warning} email={email} onSignOut={onSignOut} onBeforeSignOut={()=>setAccountOpen(false)}/></div>
 </BudgetInfoDialog>}
 {incomeOpen&&<IncomeDialog document={document} setDocument={setDocument} month={month} onClose={()=>setIncomeOpen(false)}/>}
 {management&&<BudgetManagement document={document} setDocument={setDocument} onClose={()=>setManagement(false)}/>}
 </>
}
