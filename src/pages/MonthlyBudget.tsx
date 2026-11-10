import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { buildTransferInstructions, type TransferInstructions } from '../domain/transferInstructions'
import { budgetEditScope, budgetDateMarkers, incomeDateMarkers, resolveBudget, resolveIncomeSources, updateBudgetAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { PageFrame } from '../components/PageFrame'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PLAN_FILTER_MIN_ITEMS } from './planListConfig'
import { BudgetManagement } from './BudgetManagement'
import { BudgetItemEditor } from './BudgetItemEditor'
import { BudgetInfoDialog, MobileBudgetSummary } from './MobileBudgetViews'
import { TransfersPanel } from './TransfersPanel'
import { MonthControl } from './MonthControl'
import { IncomeDialog } from './IncomeDialog'
import { PlanFilters } from './PlanFilters'
import { PlanTable } from './PlanTable'
import { usePlanSearch } from './usePlanSearch'
import { groupPlanItems, matchesPlanDestination, planDestinationLabel as destinationFilterLabel, planGroupKey, planItemLabels, planOwnerOrder } from './planRows'
import { readOpenPlanGroups, readPlanGrouping, rememberOpenPlanGroups, rememberPlanGrouping } from '../state/planGroups'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { ImpactPreview } from '../components/ImpactPreview'
import { AllocationMeter, AllocationMeterMini } from '../components/AllocationMeter'
import { personProgress, setStepTick } from '../domain/transferTicks'
import { AccountStatusPanel } from '../components/AccountStatusPanel'
import { saveStatusLabel, statusMark } from '../components/saveStatus'
import { createPortal } from 'react-dom'
import { BudgetOptionsMenu } from './BudgetOptionsMenu'
import { Ellipsis, Plus } from 'lucide-react'
import { commitItemBatch, type BudgetItemBatch } from '../domain/budgetItemDrafts'
import { orderTransferAccounts, personTransferPlans } from '../domain/personTransfers'
import { readTransferPerson, rememberTransferPerson, resolveTransferPerson } from '../state/transferPerson'
import { accountOptionLabels, shortAccountLabels } from './budgetLabels'
import { formatEditScope, formatMonth } from '../formatting/month'
import { formatGBP } from '../formatting/money'
import type { PlanDestination, StepsReturn } from '../state/navigation'
import { MOBILE_QUERY } from '../breakpoints'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; saveStatus?: string; accountBacked?: boolean; mobileBudgetView?: 'transfers' | 'plan'; month?: string; onMonthChange?: (month: string) => void; onSeeTransferItems?: (accountId: string) => void; planDestination?: PlanDestination | null; onClearPlanDestination?: () => void; onReturnToTransfers?: () => void; onViewAffectedTransfers?: (impact: BudgetImpact) => void; affectedTransfers?: BudgetImpact | null; hasTransfersOrigin?: boolean; stepsReturn?: StepsReturn | null; planItemId?: string; warning?: string; email?: string; onSignOut?: () => void }
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches
const monthLabel = formatMonth
const subscribeNothing = () => () => {}
const findHeaderSlot = () => window.document.getElementById('mobile-header-page-slot')
const pounds = (pence: number) => formatGBP(pence / 100)

export function MonthlyBudget({document,setDocument,saveStatus,mobileBudgetView:sharedMobileBudgetView,month:sharedMonth,onMonthChange,onSeeTransferItems,planDestination,onClearPlanDestination,onReturnToTransfers,onViewAffectedTransfers,affectedTransfers,hasTransfersOrigin,stepsReturn,planItemId,warning='',email,onSignOut}:Props) {
 const mobilePresentation=useSyncExternalStore(subscribeMobile,getMobile,()=>false)
 const [localMonth,setLocalMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
 const month=sharedMonth??localMonth
 const setMonth=onMonthChange??setLocalMonth
 const [editor,setEditor]=useState(false),[editingItem,setEditingItem]=useState<BudgetItem>(),[editorTemplate,setEditorTemplate]=useState<BudgetItem>(),[editorSession,setEditorSession]=useState(0),[management,setManagement]=useState(false),[incomeOpen,setIncomeOpen]=useState(false)
 const [batchMessage,setBatchMessage]=useState('')
 const [savedImpact,setSavedImpact]=useState<BudgetImpact|null>(null)
 const [ownerFilter,setOwnerFilter]=useState('All')
 const [openGroups,setOpenGroups]=useState(readOpenPlanGroups)
 const [grouping,setGrouping]=useState(readPlanGrouping)
 const chooseGrouping=(value:'category'|'destination')=>{rememberPlanGrouping(value);setGrouping(value)}
 useEffect(()=>rememberOpenPlanGroups(openGroups),[openGroups])
 const [categoryFilter,setCategoryFilter]=useState('All')
 const mobileBudgetView=sharedMobileBudgetView??'plan'
 const planFocusItem=useRef<string|null>(planItemId??null),previousBudgetView=useRef(mobileBudgetView)
 const planDestinationHeading=useRef<HTMLDivElement>(null),previousPlanDestination=useRef<string|null>(null)
 const [infoDialog,setInfoDialog]=useState<'month'|'transfers'|null>(null)
 const monthOptionsRef=useRef<HTMLButtonElement>(null), optionsHandoff=useRef(false)
 // The app header's slot for the month and ⋯ on phones; absent when the page renders on its own (tests, setup).
 const headerSlot=useSyncExternalStore(subscribeNothing,findHeaderSlot,()=>null)
 // Once the meter card scrolls away on a phone, a slim copy docks above the bottom nav.
 const meterRef=useRef<HTMLDivElement>(null),[meterOffscreen,setMeterOffscreen]=useState(false)
 useEffect(()=>{
  const meter=meterRef.current
  if(!meter||!mobilePresentation||typeof IntersectionObserver==='undefined')return
  const observer=new IntersectionObserver(([entry])=>setMeterOffscreen(!!entry&&!entry.isIntersecting&&entry.boundingClientRect.bottom<=0))
  observer.observe(meter)
  return()=>{observer.disconnect();setMeterOffscreen(false)}
 },[mobilePresentation,mobileBudgetView])
 useLayoutEffect(()=>{
  if(!optionsHandoff.current||(!incomeOpen&&!management))return
  const trigger=monthOptionsRef.current
  window.document.querySelector<HTMLElement>('.budget-v3-overlay button, .budget-v3-overlay input')?.focus()
  return()=>{trigger?.focus({preventScroll:true});optionsHandoff.current=false}
 },[incomeOpen,management])
 const [inlineSavedItem,setInlineSavedItem]=useState<string|null>(null)
 const [confirm,setConfirm]=useState<{title:string;body:ReactNode;confirmLabel:string;onConfirm:()=>void;returnFocusTo:()=>HTMLElement|null|undefined}|null>(null)
 const {query,updateSearch,captureBrowseScroll}=usePlanSearch({month,planDestination,mobilePresentation})
 useEffect(()=>{const timer=window.setTimeout(()=>setInlineSavedItem(null),0);return()=>window.clearTimeout(timer)},[month,mobileBudgetView,planDestination,ownerFilter,categoryFilter,query])
 const resolved=resolveBudget(document.budget,month), items=resolved.items, adults=document.household.adults
 const editScopeLabel=formatEditScope(budgetEditScope(document.budget,month))
 const openIncome=()=>setIncomeOpen(true)
 const incomes=resolveIncomeSources(document.budget,month), transfers=budgetTransfers(document.budget,adults.map(p=>p.id),month,items)
 let instructions:TransferInstructions|undefined
 try{instructions=buildTransferInstructions(document,month)}catch{/* Keep the comparison view available; unavailable instructions are labelled below. */}
 const unfundedItems=items.filter(item=>transfers.unresolvedItemIds.includes(item.id))
 const accountLabels=accountOptionLabels(document.budget.accounts,adults)
 // One short account name wherever a destination is shown; the long labels only order Transfers.
 const shortLabels=shortAccountLabels(document.budget.accounts,adults)
 const labels=planItemLabels(document,shortLabels)
 const destinationItems=items.filter(item=>matchesPlanDestination(item,planDestination,labels))
 const planDestinationLabel=destinationFilterLabel(document,planDestination,shortLabels)
 const total=items.reduce((sum,item)=>sum+item.amountPence,0)
 const transferAccounts=orderTransferAccounts(transfers.accounts,instructions,document.budget.accounts,adults.map(person=>person.id),accountLabels)
 const [storedTransferPerson,setStoredTransferPerson]=useState(readTransferPerson)
 const transferPerson=resolveTransferPerson(storedTransferPerson,adults.map(person=>person.id))
 const chooseTransferPerson=(value:string)=>{rememberTransferPerson(value);setStoredTransferPerson(value)}
 const personPlans=personTransferPlans(transferAccounts,instructions,adults.map(person=>person.id))
 const selectedPersonPlan=transferPerson&&transferPerson!=='both'?personPlans.people.find(plan=>plan.personId===transferPerson):undefined
 const transferPersonChoice={adults,selection:transferPerson,onSelect:chooseTransferPerson,plan:selectedPersonPlan&&{name:adults.find(person=>person.id===selectedPersonPlan.personId)?.name??'Person',fundingPence:selectedPersonPlan.fundingPence,fundCount:selectedPersonPlan.fundCount,moveCount:selectedPersonPlan.moveCount},reviewCount:personPlans.needsReview.length,progress:Object.fromEntries(personPlans.people.map(plan=>[plan.personId,personProgress(plan,document.ticks?.[month])])),monthName:formatMonth(month).split(' ')[0]}
 const tickStep=(key:string,amountPence:number|null)=>setDocument(current=>setStepTick(current,month,key,amountPence))
 const start=(item?:BudgetItem,template?:BudgetItem)=>{setInlineSavedItem(null);setSavedImpact(null);setEditingItem(item);setEditorTemplate(template);setEditorSession(session=>session+1);setEditor(true)}
 const duplicate=(item:BudgetItem)=>start(undefined,item)
 const saveBatch=(batch:BudgetItemBatch)=>{
  const result=commitItemBatch(document,month,batch)
  if('error' in result)return result.error
  const financial=result.items.some(updated=>{const old=items.find(row=>row.id===updated.id);return !old||old.entryAmountPence!==updated.entryAmountPence||old.frequency!==updated.frequency||old.funding!==updated.funding||old.singleFunderId!==updated.singleFunderId||JSON.stringify(old.destination)!==JSON.stringify(updated.destination)||JSON.stringify(old.contributions)!==JSON.stringify(updated.contributions)||JSON.stringify(old.customShares)!==JSON.stringify(updated.customShares)})
  const preview=financial?budgetImpact(document,result.document,month,result.items.map(item=>item.id)):undefined
  if(preview&&'error' in preview)return {field:'rows' as const,message:preview.error}
  setDocument(current=>{const latest=commitItemBatch(current,month,batch);return 'error' in latest?current:latest.document})
  // Open the groups the saved items sit in, so they are on screen.
  const savedLabels=planItemLabels(result.document,shortAccountLabels(result.document.budget.accounts,adults))
  setOpenGroups(open=>({...open,...Object.fromEntries(result.items.map(row=>[planGroupKey(row,grouping,savedLabels),true]))}))
  setSavedImpact(preview&&'impact' in preview&&(preview.impact.accounts.length||preview.impact.beforeBalancePence!==preview.impact.afterBalancePence)?preview.impact:null)
  setBatchMessage(batch.editingId?'Budget item updated.':`Created ${result.items.length} budget ${result.items.length===1?'item':'items'}.`)
  setEditor(false)
 }
 const removeItem=(item:BudgetItem,menu?:HTMLElement|null)=>{const next={...document,budget:updateBudgetAtMonth(document.budget,month,old=>old.filter(i=>i.id!==item.id))};setConfirm({title:`Remove ${item.name}?`,body:<ImpactPreview label="Before removing" scopeText={`Changes apply: ${editScopeLabel}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:'Remove item',returnFocusTo:()=>menu?.isConnected?menu:window.document.querySelector<HTMLElement>('.budget-v3-table-wrap'),onConfirm:()=>setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==item.id))}))})}
 const inlineFeedback=inlineSavedItem?(saveStatus==='Not saved'?'Amount could not be saved. Check save status.':saveStatus==='Choose a version'?'Choose a budget version to finish saving the amount.':saveStatus==='Saving…'||saveStatus==='Unsaved changes'?'Saving amount…':saveStatus==='Saved'||!saveStatus?'Amount saved.':'Saving amount…'):''
 const snapshotsWithoutMonth=()=>{const snapshots={...document.budget.snapshots};delete snapshots[month];return snapshots}
 const previousBudget=resolved.hasExplicitBudget?resolveBudget({...document.budget,snapshots:snapshotsWithoutMonth()},month):null
 const revertLabel=!previousBudget?undefined:previousBudget.sourceMonth?`Go back to the ${monthLabel(previousBudget.sourceMonth)} budget`:previousBudget.importedBaseline?'Go back to the imported budget':`Clear the ${monthLabel(month)} budget`
 const removeDate=()=>{
  if(!previousBudget||!revertLabel)return
  const replacement=previousBudget.sourceMonth?`the budget from ${monthLabel(previousBudget.sourceMonth)}`:previousBudget.importedBaseline?'the imported legacy budget':'no budget'
  const next={...document,budget:{...document.budget,snapshots:snapshotsWithoutMonth()}}
  setConfirm({title:`${revertLabel}?`,body:<ImpactPreview label="Before removing" scopeText={`${editScopeLabel} will use ${replacement}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:revertLabel,returnFocusTo:()=>monthOptionsRef.current?.offsetParent?monthOptionsRef.current:window.document.querySelector<HTMLElement>('.budget-v3-month button[aria-haspopup]'),onConfirm:()=>setDocument(current=>{const snapshots={...current.budget.snapshots};delete snapshots[month];return {...current,budget:{...current.budget,snapshots}}})})
 }
 const incomeTotal=incomes.filter(x=>x.type==='employment').reduce((s,x)=>s+x.amountPence,0),available=transfers.availablePence,availableBasis=available===0?'no income yet':incomeTotal===0?'none from salary':incomeTotal===available?'all from salary':`${pounds(incomeTotal)} from salary`
 const basisDetail=available===0||incomeTotal===0||incomeTotal===available?availableBasis:`${pounds(incomeTotal)} salary + ${pounds(available-incomeTotal)} other`
 const ownerOrder=planOwnerOrder(adults)
 const meterPeople=transfers.people.map(row=>({personId:row.personId,name:adults.find(person=>person.id===row.personId)?.name??'Person',availablePence:row.availablePence,plannedPence:row.plannedPence}))
 // "Review Immy's items": the Plan filtered to the accounts that person owns, with every group holding them open.
 const reviewPerson=(personId:string)=>{const name=adults.find(person=>person.id===personId)?.name;if(!name)return;setOwnerFilter(name);setCategoryFilter('All');if(query)updateSearch('');const {groups}=groupPlanItems(destinationItems,{query:'',owner:name,category:'All'},labels,grouping,transferAccounts.map(account=>account.accountId),ownerOrder);setOpenGroups(open=>({...open,...Object.fromEntries(groups.map(group=>[group.key,true]))}))}
 const searchMode=!!query.trim()
 const {groups:planGroups,matching:matchingItems}=groupPlanItems(destinationItems,{query,owner:ownerFilter,category:categoryFilter},labels,grouping,transferAccounts.map(account=>account.accountId),ownerOrder)
 const scopedPlan=mobilePresentation&&mobileBudgetView==='plan'&&!!planDestination
 const searchRef=useRef<HTMLInputElement>(null)
 const planDestinationSignature=mobileBudgetView==='plan'&&planDestination?`${month}:${planDestination.kind}:${planDestination.id}`:null
 useLayoutEffect(()=>{
  if(planDestinationSignature===previousPlanDestination.current)return
  previousPlanDestination.current=planDestinationSignature
  if(planDestinationSignature){if(mobilePresentation)window.scrollTo({top:0});planDestinationHeading.current?.focus({preventScroll:true})}
 },[planDestinationSignature,mobilePresentation])
 // An item opened from Transfers may sit in a closed group: open it, and the focus below finds the row once it renders.
 const planItem=planItemId?items.find(row=>row.id===planItemId):undefined,planItemGroup=planItem&&planGroupKey(planItem,grouping,labels)
 const revealGroup=mobileBudgetView==='plan'&&!planDestination?planItemGroup:undefined
 const [revealedGroup,setRevealedGroup]=useState<string|undefined>()
 if(revealGroup!==revealedGroup){setRevealedGroup(revealGroup);if(revealGroup&&!openGroups[revealGroup])setOpenGroups({...openGroups,[revealGroup]:true})}
 useLayoutEffect(()=>{
  if(previousBudgetView.current==='transfers'&&mobileBudgetView==='plan'&&planItemId)planFocusItem.current=planItemId
  if(mobileBudgetView==='plan'&&planFocusItem.current){
   const target=Array.from(window.document.querySelectorAll<HTMLButtonElement>('[data-budget-item-id]')).find(button=>button.dataset.budgetItemId===planFocusItem.current)
   if(target){target.focus({preventScroll:true});target.scrollIntoView?.({block:'center'});planFocusItem.current=null}
   else if(!items.some(row=>row.id===planFocusItem.current)){searchRef.current?.focus({preventScroll:true});planFocusItem.current=null}
  }
  previousBudgetView.current=mobileBudgetView
 })
 // Only a carried-over budget needs a note: the month button already names the month, and the picker marks budget and income changes.
 const carriedOverNote=resolved.hasExplicitBudget?null:resolved.sourceMonth?`Using the ${monthLabel(resolved.sourceMonth)} budget`:resolved.importedBaseline?'Using the imported budget':null
 const budgetDateNote=carriedOverNote&&<p className="budget-v3-date-note">{carriedOverNote}</p>
 // Desktop: the month is the page title, with the budget's actions on the same row. Phones hide the actions and keep "Month & income".
 const budgetOptions=[{label:'Edit income',onSelect:openIncome},{label:'Manage accounts, pots & categories',onSelect:()=>setManagement(true)}]
 const monthControl=<MonthControl month={month} onChange={setMonth} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)} revertLabel={revertLabel} onRevert={removeDate}/>
 const status=saveStatusLabel(saveStatus??'Saved',warning)
 // Phones: one ⋯ for the budget's actions and the account, beside the month (in the app header when it has room for them).
 const mobileOptions=<button ref={monthOptionsRef} type="button" className="budget-mobile-options" aria-label="Budget and account" title="Budget and account" aria-haspopup="dialog" onClick={()=>setInfoDialog('month')}>{status!=='Saved'&&<span aria-hidden="true">{statusMark(status)}</span>}<Ellipsis aria-hidden="true"/></button>
 const inHeader=mobilePresentation&&!!headerSlot
 // On phones the header carries the month, ⋯ and the budget note, so the page has no title bar.
 const titlebar=inHeader?null:<div className="budget-page-titlebar"><div className="budget-v3-date-selector">{!inHeader&&monthControl}<div className="budget-v3-date-context">{budgetDateNote}{mobilePresentation&&!inHeader&&mobileOptions}</div></div><div className="budget-v3-tools budget-desktop-toolbar"><BudgetOptionsMenu options={budgetOptions}/>{mobileBudgetView==='plan'&&<button type="button" className="primary-button" onClick={()=>start()}><Plus aria-hidden="true"/>Add item</button>}</div></div>
 const budgetHeader=<div className="budget-mobile-plan-heading"><button type="button" className="primary-button" onClick={()=>start()}>Add item</button></div>
 const peopleSummary=<TransfersPanel month={month} onTick={tickStep} document={document} transfers={transfers} accounts={transferAccounts} instructions={instructions} unfundedItems={unfundedItems} labels={shortLabels} plans={personPlans} personSelection={transferPerson} view={mobileBudgetView} mobilePresentation={mobilePresentation} affectedTransfers={affectedTransfers} stepsReturn={stepsReturn} onSeeItems={onSeeTransferItems} onEditIncome={openIncome}/>
 const showPlanFilters=items.length>=PLAN_FILTER_MIN_ITEMS||searchMode||ownerFilter!=='All'||categoryFilter!=='All'
 const planFilters=<PlanFilters query={query} onQueryChange={updateSearch} onSearchStart={captureBrowseScroll} inputRef={searchRef} owner={ownerFilter} onOwnerChange={setOwnerFilter} ownerOrder={ownerOrder} category={categoryFilter} onCategoryChange={setCategoryFilter} categories={document.budget.categories} compact={mobilePresentation} onAdd={mobilePresentation&&mobileBudgetView==='plan'&&!scopedPlan?()=>start():undefined}/>
 const firstRun=!Object.keys(document.budget.snapshots).length&&document.budget.importedBaseline===undefined
 const firstRunEmpty=<div className="budget-v3-empty budget-first-run"><h2>Start your plan</h2><p>Add rent, bills, savings — anything you pay for each month.</p><button className="primary-button" onClick={()=>start()}>Add your first budget item</button>{!incomes.length&&<div className="budget-first-run-income"><p>No income yet, so there’s nothing to split.</p><button type="button" className="secondary-button" onClick={openIncome}>Add income</button></div>}</div>
 const planEmpty=!items.length&&!planDestination&&firstRun?firstRunEmpty:!items.length&&!planDestination?<div className="budget-v3-empty"><p>{resolved.sourceMonth||resolved.importedBaseline?'This budget has no items yet.':'There is no budget for this month yet.'}</p><button className="primary-button" onClick={()=>start()}>Add item</button></div>:!matchingItems.length?<p className="budget-v3-empty">{planDestination&&!destinationItems.length?`No items go to ${planDestinationLabel} for ${monthLabel(month)}.`:searchMode?`No items match “${query.trim()}” within the current filters.`:'No items match this destination and owner/category filter.'}</p>:null
 return <><PageFrame afterHeading={titlebar} title="Monthly budget" headingClass="route-heading visually-hidden" className={`monthly-budget-page budget-view-${mobileBudgetView}${scopedPlan?' scoped-plan':''}`} contentWidth="wide" pageControls={mobilePresentation&&showPlanFilters&&!scopedPlan?undefined:budgetHeader} afterSummary={peopleSummary} summary={mobileBudgetView==='plan'?<div ref={meterRef}><AllocationMeter label="Plan summary" compact={mobilePresentation} availablePence={available} plannedPence={total} people={meterPeople} basis={basisDetail} onEditIncome={openIncome} onReview={reviewPerson}/></div>:<MobileBudgetSummary allocated={transfers.accounts.reduce((sum,account)=>sum+account.amountPence,0)} hasItems={items.length>0} incomplete={!instructions||instructions.incomplete} onDetails={()=>setInfoDialog('transfers')} person={transferPersonChoice}/>}>
 <section className="budget-v3-workspace" id="budget-plan-panel" aria-label="Budget planning">{mobileBudgetView==='plan'&&planItemId&&!items.some(item=>item.id===planItemId)&&<p role="status">That budget item is no longer available for {monthLabel(month)}.</p>}{mobileBudgetView==='plan'&&planDestination&&<div ref={planDestinationHeading} className="budget-v3-destination-filter" role="region" aria-label="Plan destination filter" tabIndex={-1}><strong>Showing {matchingItems.length} {matchingItems.length===1?'item':'items'} for {planDestinationLabel} · {monthLabel(month)}</strong><span>Matching total {pounds(matchingItems.reduce((sum,item)=>sum+item.amountPence,0))}</span><div className="budget-v3-destination-actions">{onReturnToTransfers&&<button type="button" onClick={onReturnToTransfers}>{hasTransfersOrigin?'Back to Transfers':'View Transfers'}</button>}{onClearPlanDestination&&<button type="button" onClick={onClearPlanDestination}>Clear destination filter</button>}</div></div>}
 {showPlanFilters&&<div className="budget-v3-scroll-tools">{scopedPlan?<details className="budget-v3-scoped-filters"><summary>Search and filter{query||ownerFilter!=='All'||categoryFilter!=='All'?' · active':''}</summary>{planFilters}</details>:planFilters}</div>}
 {searchMode&&<p className="budget-v3-search-count" role="status">{matchingItems.length} matching {matchingItems.length===1?'item':'items'} · Matching total {pounds(matchingItems.reduce((sum,item)=>sum+item.amountPence,0))}</p>}
 <PlanTable document={document} setDocument={setDocument} month={month} editScopeLabel={editScopeLabel} groups={planGroups} labels={labels} query={query} planDestination={planDestination} view={mobileBudgetView} mobilePresentation={mobilePresentation} scoped={scopedPlan} openGroups={openGroups} onOpenGroupsChange={setOpenGroups} grouping={grouping} onGroupingChange={chooseGrouping} planTotalPence={total} filterKey={`${ownerFilter}\u0000${categoryFilter}\u0000${grouping}`} editorOpen={editor} empty={planEmpty}
  onEdit={start} onRemove={removeItem} onDuplicate={duplicate} onQuickEditOpen={()=>setInlineSavedItem(null)} onAmountSaved={(name,impact)=>{setSavedImpact(impact);setInlineSavedItem(name)}} focusFallback={()=>searchRef.current?.focus({preventScroll:true})}/>
 {(batchMessage||inlineFeedback||savedImpact?.month===month)&&<div className="budget-save-result"><button type="button" className="budget-save-dismiss" aria-label="Dismiss save result" onClick={()=>{setBatchMessage('');setInlineSavedItem(null);setSavedImpact(null)}}>×</button>{batchMessage&&<div className="budget-v3-save-status" role="status">{saveStatus==='Not saved'?'Budget could not be saved. Check save status.':saveStatus==='Saving…'||saveStatus==='Unsaved changes'?'Saving budget item…':batchMessage}</div>}{inlineFeedback&&<div className="budget-v3-save-status" role={saveStatus==='Not saved'?'alert':'status'}>{inlineFeedback}</div>}{savedImpact?.month===month&&(saveStatus==='Saved'||!saveStatus)&&onViewAffectedTransfers&&<button type="button" className="secondary-button budget-view-affected" onClick={()=>onViewAffectedTransfers(savedImpact)}>View affected transfers</button>}</div>}</section>
 </PageFrame>
 {confirm&&<ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} danger returnFocusTo={confirm.returnFocusTo} onCancel={()=>setConfirm(null)} onConfirm={()=>{confirm.onConfirm();setConfirm(null)}}>{confirm.body}</ConfirmDialog>}
 {inHeader&&createPortal(<div className="mobile-header-page">{monthControl}{mobileOptions}{budgetDateNote}</div>,headerSlot)}
 {mobileBudgetView==='plan'&&mobilePresentation&&meterOffscreen&&<AllocationMeterMini availablePence={available} plannedPence={total} people={meterPeople}/>}
 {infoDialog&&<BudgetInfoDialog title={infoDialog==='month'?'Budget and account':'Transfers summary details'} onClose={()=>setInfoDialog(null)}>
  {infoDialog==='month'?<>
   <div className="budget-month-actions"><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setInfoDialog(null);openIncome()}}>Edit income</button><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setInfoDialog(null);setManagement(true)}}>Manage accounts, pots &amp; categories</button>{revertLabel&&<button type="button" className="text-button budget-remove-action" onClick={()=>{removeDate();setInfoDialog(null)}}>{revertLabel}</button>}</div>
   <div className="budget-account-status"><AccountStatusPanel status={status} warning={warning} email={email} onSignOut={onSignOut} onBeforeSignOut={()=>setInfoDialog(null)}/></div>
  </>:<>
   <p>Each account’s funding already includes its moves.</p>
  </>}
 </BudgetInfoDialog>}
 {editor&&<BudgetItemEditor key={editorSession} document={document} month={month} item={editingItem} template={editorTemplate} onDuplicate={editingItem&&(()=>duplicate(editingItem))} onSave={saveBatch} onClose={()=>setEditor(false)} onRemove={editingItem&&(()=>{const id=editingItem.id;setEditor(false);setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==id))}))})}/>}
 {incomeOpen&&<IncomeDialog document={document} setDocument={setDocument} month={month} onClose={()=>setIncomeOpen(false)}/>}
 {management&&<BudgetManagement document={document} setDocument={setDocument} onClose={()=>setManagement(false)}/>}
 </>
}
