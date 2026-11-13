import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type Ref, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { updateBudgetAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { commitItemBatch, type BudgetItemBatch } from '../domain/budgetItemDrafts'
import { PageFrameRegions } from '../components/PageFrame'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ImpactPreview } from '../components/ImpactPreview'
import { useToast } from '../components/ui'
import { AllocationMeter, AllocationMeterMini } from '../components/AllocationMeter'
import { PLAN_FILTER_MIN_ITEMS } from './planListConfig'
import { BudgetItemEditor } from './BudgetItemEditor'
import { PlanToolbar } from './PlanToolbar'
import { PlanTable } from './PlanTable'
import { groupPlanItems, planDestinationLabel as destinationFilterLabel, planGroupKey, planItemLabels } from './planRows'
import { shortAccountLabels } from './budgetLabels'
import type { MonthBudget } from './budget/useMonthBudget'
import type { PlanView } from './budget/usePlanView'
import { formatMonth as monthLabel } from '../formatting/month'
import type { PlanDestination } from '../state/navigation'
import { useShortcut } from '../state/shortcuts'

/** What the shared title bar can ask of Plan. */
export type PlanPageHandle = { addItem: () => void }

type Props = { ref?: Ref<PlanPageHandle>; document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; budget: MonthBudget; planView: PlanView; mobilePresentation: boolean; scoped: boolean; planDestination?: PlanDestination | null; planItemId?: string; onClearPlanDestination?: () => void; onReturnToTransfers?: () => void; hasTransfersOrigin?: boolean; onViewAffectedTransfers?: (impact: BudgetImpact) => void; onEditIncome: () => void }

/** Plan: the meter, search and filters, the grouped items, and adding and editing them. Rendered inside MonthlyBudget's frame. */
export function PlanPage({ref,document,setDocument,month,budget,planView,mobilePresentation,scoped:scopedPlan,planDestination,planItemId,onClearPlanDestination,onReturnToTransfers,hasTransfersOrigin,onViewAffectedTransfers,onEditIncome:openIncome}:Props) {
 const {resolved,items,adults,incomes,editScopeLabel,labels,shortLabels,total,transferAccounts,available,basisDetail,ownerOrder,meterPeople}=budget
 const {query,updateSearch,captureBrowseScroll,ownerFilter,setOwnerFilter,categoryFilter,setCategoryFilter,openGroups,setOpenGroups,groupsOpenByDefault,grouping,chooseGrouping,destinationItems,reviewPerson}=planView
 const [editor,setEditor]=useState(false),[editingItem,setEditingItem]=useState<BudgetItem>(),[editorTemplate,setEditorTemplate]=useState<BudgetItem>(),[editorSession,setEditorSession]=useState(0)
 const {show:showToast,toast}=useToast()
 const planFocusItem=useRef<string|null>(planItemId??null)
 const planDestinationHeading=useRef<HTMLDivElement>(null),previousPlanDestination=useRef<string|null>(null)
 // Once the meter card scrolls away on a phone, a slim copy docks above the bottom nav.
 const meterRef=useRef<HTMLDivElement>(null),[meterOffscreen,setMeterOffscreen]=useState(false)
 useEffect(()=>{
  const meter=meterRef.current
  if(!meter||!mobilePresentation||typeof IntersectionObserver==='undefined')return
  const observer=new IntersectionObserver(([entry])=>setMeterOffscreen(!!entry&&!entry.isIntersecting&&entry.boundingClientRect.bottom<=0))
  observer.observe(meter)
  return()=>{observer.disconnect();setMeterOffscreen(false)}
 },[mobilePresentation])
 const [confirm,setConfirm]=useState<{title:string;body:ReactNode;confirmLabel:string;onConfirm:()=>void;returnFocusTo:()=>HTMLElement|null|undefined}|null>(null)
 const planDestinationLabel=destinationFilterLabel(document,planDestination,shortLabels)
 const start=(item?:BudgetItem,template?:BudgetItem)=>{setEditingItem(item);setEditorTemplate(template);setEditorSession(session=>session+1);setEditor(true)}
 const duplicate=(item:BudgetItem)=>start(undefined,item)
 useImperativeHandle(ref,()=>({addItem:()=>start()}))
 useShortcut({keys:'n',description:'Add item',group:'This page',run:()=>start()})
 /** "Groceries saved", with View affected Payday steps when the change moves money. */
 const saved=(text:string,impact:BudgetImpact|null)=>showToast(text,impact&&onViewAffectedTransfers?{label:'View affected Payday steps',onClick:()=>onViewAffectedTransfers(impact)}:undefined)
 const saveBatch=(batch:BudgetItemBatch,{another}:{another:boolean}={another:false})=>{
  const result=commitItemBatch(document,month,batch)
  if('error' in result)return result.error
  const financial=result.items.some(updated=>{const old=items.find(row=>row.id===updated.id);return !old||old.entryAmountPence!==updated.entryAmountPence||old.frequency!==updated.frequency||old.funding!==updated.funding||old.singleFunderId!==updated.singleFunderId||JSON.stringify(old.destination)!==JSON.stringify(updated.destination)||JSON.stringify(old.contributions)!==JSON.stringify(updated.contributions)||JSON.stringify(old.customShares)!==JSON.stringify(updated.customShares)})
  const preview=financial?budgetImpact(document,result.document,month,result.items.map(item=>item.id)):undefined
  if(preview&&'error' in preview)return {field:'rows' as const,message:preview.error}
  setDocument(current=>{const latest=commitItemBatch(current,month,batch);return 'error' in latest?current:latest.document})
  // Open the groups the saved items sit in, so they are on screen.
  const savedLabels=planItemLabels(result.document,shortAccountLabels(result.document.budget.accounts,adults))
  setOpenGroups(open=>({...open,...Object.fromEntries(result.items.map(row=>[planGroupKey(row,grouping,savedLabels),true]))}))
  const impact=preview&&'impact' in preview&&(preview.impact.accounts.length||preview.impact.beforeBalancePence!==preview.impact.afterBalancePence)?preview.impact:null
  saved(`${result.items[0]?.name??'Item'} ${batch.editingId?'saved':'added'}`,impact)
  // ⌘↵ "Add and start another" keeps the editor open for the next item.
  if(!another)setEditor(false)
 }
 const removeItem=(item:BudgetItem,menu?:HTMLElement|null)=>{const next={...document,budget:updateBudgetAtMonth(document.budget,month,old=>old.filter(i=>i.id!==item.id))};setConfirm({title:`Remove ${item.name}?`,body:<ImpactPreview label="Before removing" scopeText={`Changes apply: ${editScopeLabel}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:'Remove item',returnFocusTo:()=>menu?.isConnected?menu:window.document.querySelector<HTMLElement>('.budget-v3-table-wrap'),onConfirm:()=>setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==item.id))}))})}
 const searchMode=!!query.trim()
 const {groups:planGroups,matching:matchingItems}=groupPlanItems(destinationItems,{query,owner:ownerFilter,category:categoryFilter},labels,grouping,transferAccounts.map(account=>account.accountId),ownerOrder)
 const searchRef=useRef<HTMLInputElement>(null)
 const planDestinationSignature=planDestination?`${month}:${planDestination.kind}:${planDestination.id}`:null
 useLayoutEffect(()=>{
  if(planDestinationSignature===previousPlanDestination.current)return
  previousPlanDestination.current=planDestinationSignature
  if(planDestinationSignature){if(mobilePresentation)window.scrollTo({top:0});planDestinationHeading.current?.focus({preventScroll:true})}
 },[planDestinationSignature,mobilePresentation])
 // An item opened from Month's payday steps: focus its row once it renders (usePlanView opens its group), or the search if it's gone.
 useLayoutEffect(()=>{
  if(!planFocusItem.current)return
  const target=Array.from(window.document.querySelectorAll<HTMLButtonElement>('[data-budget-item-id]')).find(button=>button.dataset.budgetItemId===planFocusItem.current)
  if(target){target.focus({preventScroll:true});target.scrollIntoView?.({block:'center'});planFocusItem.current=null}
  else if(!items.some(row=>row.id===planFocusItem.current)){searchRef.current?.focus({preventScroll:true});planFocusItem.current=null}
 })
 const showPlanFilters=items.length>=PLAN_FILTER_MIN_ITEMS||searchMode||ownerFilter!=='All'||categoryFilter!=='All'
 const destination=planDestination?{label:planDestinationLabel,onClear:onClearPlanDestination,onBack:onReturnToTransfers,backLabel:hasTransfersOrigin?'Back to Month':'View Month'}:undefined
 const renderToolbar=items.length||planDestination?({count,expand}:{count:string;expand?:{anyOpen:boolean;toggle:()=>void}})=><PlanToolbar query={query} onQueryChange={updateSearch} onSearchStart={captureBrowseScroll} inputRef={searchRef} showFilters={showPlanFilters} owner={ownerFilter} onOwnerChange={setOwnerFilter} ownerOrder={ownerOrder} category={categoryFilter} onCategoryChange={setCategoryFilter} categories={document.budget.categories} grouping={searchMode?undefined:{value:grouping,onChange:chooseGrouping}} count={count} expand={expand} destination={destination} destinationRef={planDestinationHeading} compact={mobilePresentation} onAdd={mobilePresentation&&!scopedPlan?()=>start():undefined}/>:undefined
 const firstRun=!Object.keys(document.budget.snapshots).length&&document.budget.importedBaseline===undefined
 const firstRunEmpty=<div className="budget-v3-empty budget-first-run"><h2>Start your plan</h2><p>Add rent, bills, savings — anything you pay for each month.</p><button className="primary-button" onClick={()=>start()}>Add your first budget item</button>{!incomes.length&&<div className="budget-first-run-income"><p>No income yet, so there’s nothing to split.</p><button type="button" className="secondary-button" onClick={openIncome}>Add income</button></div>}</div>
 const planEmpty=!items.length&&!planDestination&&firstRun?firstRunEmpty:!items.length&&!planDestination?<div className="budget-v3-empty"><p>{resolved.sourceMonth||resolved.importedBaseline?'This budget has no items yet.':'There is no budget for this month yet.'}</p><button className="primary-button" onClick={()=>start()}>Add item</button></div>:!matchingItems.length?<p className="budget-v3-empty">{planDestination&&!destinationItems.length?`No items go to ${planDestinationLabel} for ${monthLabel(month)}.`:searchMode?`No items match “${query.trim()}” within the current filters.`:'No items match this destination and owner/category filter.'}</p>:null
 return <>
 <PageFrameRegions contentWidth="wide" summary={<div ref={meterRef}><AllocationMeter label="Plan summary" compact={mobilePresentation} availablePence={available} plannedPence={total} people={meterPeople} basis={basisDetail} onEditIncome={openIncome} onReview={reviewPerson}/></div>}>
 <section className="budget-v3-workspace" id="budget-plan-panel" aria-label="Budget planning">{planItemId&&!items.some(item=>item.id===planItemId)&&<p role="status">That budget item is no longer available for {monthLabel(month)}.</p>}
 <PlanTable document={document} setDocument={setDocument} month={month} editScopeLabel={editScopeLabel} groups={planGroups} labels={labels} query={query} planDestination={planDestination} view="plan" mobilePresentation={mobilePresentation} scoped={scopedPlan} openGroups={openGroups} onOpenGroupsChange={setOpenGroups} groupsOpenByDefault={groupsOpenByDefault} grouping={grouping} renderToolbar={renderToolbar} planTotalPence={total} filterKey={`${ownerFilter}\u0000${categoryFilter}\u0000${grouping}`} editorOpen={editor} empty={planEmpty}
  onEdit={(item,amountPence)=>start(amountPence===undefined?item:{...item,entryAmountPence:amountPence,amountPence})} onRemove={removeItem} onDuplicate={duplicate} onQuickEditOpen={()=>{}} onAmountSaved={(name,impact)=>saved(`${name} saved`,impact)} focusFallback={()=>searchRef.current?.focus({preventScroll:true})}/>
 {toast}</section>
 </PageFrameRegions>
 {confirm&&<ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} danger returnFocusTo={confirm.returnFocusTo} onCancel={()=>setConfirm(null)} onConfirm={()=>{confirm.onConfirm();setConfirm(null)}}>{confirm.body}</ConfirmDialog>}
 {mobilePresentation&&meterOffscreen&&<AllocationMeterMini availablePence={available} plannedPence={total} people={meterPeople}/>}
 {editor&&<BudgetItemEditor key={editorSession} document={document} month={month} item={editingItem} template={editorTemplate} onDuplicate={editingItem&&(()=>duplicate(editingItem))} onSave={saveBatch} onClose={()=>setEditor(false)} onRemove={editingItem&&(()=>{const id=editingItem.id;setEditor(false);setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==id))}))})}/>}
 </>
}
