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
import { groupPlanItems, matchesPlanDestination, planDestinationLabel as destinationFilterLabel, planItemLabels, planOwnerOrder } from './planRows'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { ImpactPreview } from '../components/ImpactPreview'
import { commitItemBatch, type BudgetItemBatch } from '../domain/budgetItemDrafts'
import { orderTransferAccounts, personTransferPlans } from '../domain/personTransfers'
import { readTransferPerson, rememberTransferPerson, resolveTransferPerson } from '../state/transferPerson'
import { accountOptionLabels, compactAccountLabels } from './budgetLabels'
import { formatEditScope, formatMonth } from '../formatting/month'
import { balanceLabel, formatGBP } from '../formatting/money'
import type { PlanDestination, StepsReturn } from '../state/navigation'
import { MOBILE_QUERY } from '../breakpoints'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; saveStatus?: string; accountBacked?: boolean; mobileBudgetView?: 'transfers' | 'plan'; month?: string; onMonthChange?: (month: string) => void; onSeeTransferItems?: (accountId: string) => void; planDestination?: PlanDestination | null; onClearPlanDestination?: () => void; onReturnToTransfers?: () => void; onViewAffectedTransfers?: (impact: BudgetImpact) => void; affectedTransfers?: BudgetImpact | null; hasTransfersOrigin?: boolean; stepsReturn?: StepsReturn | null; planItemId?: string }
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(MOBILE_QUERY); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(MOBILE_QUERY).matches
const monthLabel = formatMonth
const pounds = (pence: number) => formatGBP(pence / 100)

export function MonthlyBudget({document,setDocument,saveStatus,mobileBudgetView:sharedMobileBudgetView,month:sharedMonth,onMonthChange,onSeeTransferItems,planDestination,onClearPlanDestination,onReturnToTransfers,onViewAffectedTransfers,affectedTransfers,hasTransfersOrigin,stepsReturn,planItemId}:Props) {
 const mobilePresentation=useSyncExternalStore(subscribeMobile,getMobile,()=>false)
 const [localMonth,setLocalMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
 const month=sharedMonth??localMonth
 const setMonth=onMonthChange??setLocalMonth
 const [editor,setEditor]=useState(false),[editingItem,setEditingItem]=useState<BudgetItem>(),[management,setManagement]=useState(false),[incomeOpen,setIncomeOpen]=useState(false)
 const [batchMessage,setBatchMessage]=useState('')
 const [savedImpact,setSavedImpact]=useState<BudgetImpact|null>(null)
 const [ownerFilter,setOwnerFilter]=useState('All')
 const [categoryFilter,setCategoryFilter]=useState('All')
 const mobileBudgetView=sharedMobileBudgetView??'plan'
 const planFocusItem=useRef<string|null>(planItemId??null),previousBudgetView=useRef(mobileBudgetView)
 const planDestinationHeading=useRef<HTMLDivElement>(null),previousPlanDestination=useRef<string|null>(null)
 const [infoDialog,setInfoDialog]=useState<'month'|'plan'|'transfers'|null>(null)
 const monthOptionsRef=useRef<HTMLButtonElement>(null), optionsHandoff=useRef(false)
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
 const compactLabels=compactAccountLabels(document.budget.accounts,adults)
 const labels=planItemLabels(document,accountLabels)
 const destinationItems=items.filter(item=>matchesPlanDestination(item,planDestination,labels))
 const planDestinationLabel=destinationFilterLabel(document,planDestination,compactLabels)
 const total=items.reduce((sum,item)=>sum+item.amountPence,0)
 const transferAccounts=orderTransferAccounts(transfers.accounts,instructions,document.budget.accounts,adults.map(person=>person.id),accountLabels)
 const [storedTransferPerson,setStoredTransferPerson]=useState(readTransferPerson)
 const transferPerson=resolveTransferPerson(storedTransferPerson,adults.map(person=>person.id))
 const chooseTransferPerson=(value:string)=>{rememberTransferPerson(value);setStoredTransferPerson(value)}
 const personPlans=personTransferPlans(transferAccounts,instructions,adults.map(person=>person.id))
 const selectedPersonPlan=transferPerson&&transferPerson!=='both'?personPlans.people.find(plan=>plan.personId===transferPerson):undefined
 const transferPersonChoice={adults,selection:transferPerson,onSelect:chooseTransferPerson,plan:selectedPersonPlan&&{name:adults.find(person=>person.id===selectedPersonPlan.personId)?.name??'Person',fundingPence:selectedPersonPlan.fundingPence,stepCount:selectedPersonPlan.stepCount},reviewCount:personPlans.needsReview.length}
 const start=(item?:BudgetItem)=>{setInlineSavedItem(null);setSavedImpact(null);setEditingItem(item);setEditor(true)}
 const saveBatch=(batch:BudgetItemBatch)=>{
  const result=commitItemBatch(document,month,batch)
  if('error' in result)return result.error
  const financial=result.items.some(updated=>{const old=items.find(row=>row.id===updated.id);return !old||old.entryAmountPence!==updated.entryAmountPence||old.frequency!==updated.frequency||old.funding!==updated.funding||old.singleFunderId!==updated.singleFunderId||JSON.stringify(old.destination)!==JSON.stringify(updated.destination)||JSON.stringify(old.contributions)!==JSON.stringify(updated.contributions)||JSON.stringify(old.customShares)!==JSON.stringify(updated.customShares)})
  const preview=financial?budgetImpact(document,result.document,month,result.items.map(item=>item.id)):undefined
  if(preview&&'error' in preview)return {field:'rows' as const,message:preview.error}
  setDocument(current=>{const latest=commitItemBatch(current,month,batch);return 'error' in latest?current:latest.document})
  setSavedImpact(preview&&'impact' in preview&&(preview.impact.accounts.length||preview.impact.beforeBalancePence!==preview.impact.afterBalancePence)?preview.impact:null)
  setBatchMessage(batch.editingId?'Budget item updated.':`Created ${result.items.length} budget ${result.items.length===1?'item':'items'}.`)
  setEditor(false)
 }
 const removeItem=(item:BudgetItem,menu?:HTMLElement|null)=>{const next={...document,budget:updateBudgetAtMonth(document.budget,month,old=>old.filter(i=>i.id!==item.id))};setConfirm({title:`Remove ${item.name}?`,body:<ImpactPreview label="Before removing" scopeText={`Changes apply: ${editScopeLabel}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:'Remove item',returnFocusTo:()=>menu?.isConnected?menu:window.document.querySelector<HTMLElement>('.budget-v3-table-wrap'),onConfirm:()=>setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==item.id))}))})}
 const inlineFeedback=inlineSavedItem?(saveStatus==='Not saved'?'Amount could not be saved. Check save status.':saveStatus==='Choose a version'?'Choose a budget version to finish saving the amount.':saveStatus==='Saving…'||saveStatus==='Unsaved changes'?'Saving amount…':saveStatus==='Saved'||!saveStatus?'Amount saved.':'Saving amount…'):''
 const removeDate=()=>{
  if(!resolved.hasExplicitBudget)return
  const snapshots={...document.budget.snapshots};delete snapshots[month]
  const previous=resolveBudget({...document.budget,snapshots},month)
  const replacement=previous.sourceMonth?`the budget from ${monthLabel(previous.sourceMonth)}`:previous.importedBaseline?'the imported legacy budget':'no budget'
  const next={...document,budget:{...document.budget,snapshots}}
  setConfirm({title:`Remove the ${monthLabel(month)} budget date?`,body:<ImpactPreview label="Before removing" scopeText={`${editScopeLabel} will use ${replacement}.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:'Remove budget date',returnFocusTo:()=>monthOptionsRef.current?.offsetParent?monthOptionsRef.current:window.document.querySelector<HTMLElement>('.budget-v3-month button[aria-haspopup]'),onConfirm:()=>setDocument(current=>{const snapshots={...current.budget.snapshots};delete snapshots[month];return {...current,budget:{...current.budget,snapshots}}})})
 }
 const incomeTotal=incomes.filter(x=>x.type==='employment').reduce((s,x)=>s+x.amountPence,0),available=transfers.availablePence,availableBasis=available===0?'no income yet':incomeTotal===0?'none from employment':incomeTotal===available?'all from employment':`${pounds(incomeTotal)} from employment`
 const ownerOrder=planOwnerOrder(adults)
 const searchMode=!!query.trim()
 const {owners:planOwners,matching:matchingItems}=groupPlanItems(destinationItems,{query,owner:ownerFilter,category:categoryFilter},!mobilePresentation,ownerOrder,labels)
 const scopedPlan=mobilePresentation&&mobileBudgetView==='plan'&&!!planDestination
 const searchRef=useRef<HTMLInputElement>(null)
 const planDestinationSignature=mobileBudgetView==='plan'&&planDestination?`${month}:${planDestination.kind}:${planDestination.id}`:null
 useLayoutEffect(()=>{
  if(planDestinationSignature===previousPlanDestination.current)return
  previousPlanDestination.current=planDestinationSignature
  if(planDestinationSignature){if(mobilePresentation)window.scrollTo({top:0});planDestinationHeading.current?.focus({preventScroll:true})}
 },[planDestinationSignature,mobilePresentation])
 useLayoutEffect(()=>{
  if(previousBudgetView.current==='transfers'&&mobileBudgetView==='plan'&&planItemId)planFocusItem.current=planItemId
  if(mobileBudgetView==='plan'&&planFocusItem.current){
   const target=Array.from(window.document.querySelectorAll<HTMLButtonElement>('[data-budget-item-id]')).find(button=>button.dataset.budgetItemId===planFocusItem.current)
   if(target){target.focus({preventScroll:true});target.scrollIntoView?.({block:'center'});planFocusItem.current=null}
   else if(!items.some(row=>row.id===planFocusItem.current)){searchRef.current?.focus({preventScroll:true});planFocusItem.current=null}
  }
  previousBudgetView.current=mobileBudgetView
 })
 const selectedMonthIncomeUpdated=incomeDateMarkers(document.budget).includes(month)
 const desktopBudgetDateStatus=resolved.hasExplicitBudget?`Budget set for ${monthLabel(resolved.sourceMonth!)}`:resolved.sourceMonth?`Using budget from ${monthLabel(resolved.sourceMonth)}`:resolved.importedBaseline?'Using imported legacy budget':'No budget is set for this month'
 const mobileBudgetDateStatus=resolved.hasExplicitBudget?'Budget set':resolved.sourceMonth?`Using budget from ${monthLabel(resolved.sourceMonth)}`:resolved.importedBaseline?'Using imported legacy budget':'No budget is set for this month'
 const budgetDateNote=<div className="budget-v3-date-note"><span className="budget-v3-date-note-desktop">{desktopBudgetDateStatus}{selectedMonthIncomeUpdated?` · Income updated ${monthLabel(month)}`:''}</span><span className="budget-v3-date-note-mobile">{mobileBudgetDateStatus}</span></div>
 const budgetHeader=<><div className="budget-v3-toolbar budget-desktop-toolbar"><div className="budget-v3-tools"><button className="secondary-button" onClick={()=>openIncome()}>Edit income</button><button className="secondary-button" onClick={()=>setManagement(true)}>Manage accounts, pots &amp; categories</button><button className="primary-button" onClick={()=>start()}>Add item</button></div></div><div className="budget-mobile-plan-heading"><h2>Budget items</h2><button type="button" className="primary-button" onClick={()=>start()}>Add item</button></div></>
 const peopleSummary=<TransfersPanel document={document} transfers={transfers} accounts={transferAccounts} instructions={instructions} unfundedItems={unfundedItems} labels={accountLabels} plans={personPlans} personSelection={transferPerson} view={mobileBudgetView} mobilePresentation={mobilePresentation} affectedTransfers={affectedTransfers} stepsReturn={stepsReturn} onSeeItems={onSeeTransferItems} onEditIncome={openIncome}/>
 const showPlanFilters=items.length>=PLAN_FILTER_MIN_ITEMS||searchMode||ownerFilter!=='All'||categoryFilter!=='All'
 const planFilters=<PlanFilters query={query} onQueryChange={updateSearch} onSearchStart={captureBrowseScroll} inputRef={searchRef} owner={ownerFilter} onOwnerChange={setOwnerFilter} ownerOrder={ownerOrder} category={categoryFilter} onCategoryChange={setCategoryFilter} categories={document.budget.categories}/>
 const firstRun=!Object.keys(document.budget.snapshots).length&&document.budget.importedBaseline===undefined
 const firstRunEmpty=<div className="budget-v3-empty budget-first-run"><h2>Start your plan</h2><p>Add rent, bills, savings — anything you pay for each month.</p><button className="primary-button" onClick={()=>start()}>Add your first budget item</button>{!incomes.length&&<div className="budget-first-run-income"><p>No income yet, so there’s nothing to split.</p><button type="button" className="secondary-button" onClick={openIncome}>Add income</button></div>}</div>
 const planEmpty=!items.length&&!planDestination&&firstRun?firstRunEmpty:!items.length&&!planDestination?<div className="budget-v3-empty"><p>{resolved.sourceMonth||resolved.importedBaseline?'This budget has no items yet.':'There is no budget for this month yet.'}</p><button className="primary-button" onClick={()=>start()}>Add item</button></div>:!matchingItems.length?<p className="budget-v3-empty">{planDestination&&!destinationItems.length?`No items go to ${planDestinationLabel} for ${monthLabel(month)}.`:searchMode?`No items match “${query.trim()}” within the current filters.`:'No items match this destination and owner/category filter.'}</p>:null
 return <><PageFrame afterHeading={<div className="budget-v3-date-selector"><MonthControl month={month} onChange={setMonth} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/><div className="budget-v3-date-context">{budgetDateNote}<button ref={monthOptionsRef} type="button" className="text-button budget-mobile-month-options" onClick={()=>setInfoDialog('month')}>Month &amp; income</button><div className="budget-v3-date-action">{resolved.hasExplicitBudget&&<button className="text-button budget-v3-remove-date" onClick={removeDate}>Remove budget date</button>}</div></div></div>} title="Monthly budget" headingClass="route-heading visually-hidden" className={`monthly-budget-page budget-view-${mobileBudgetView}${scopedPlan?' scoped-plan':''}`} contentWidth="wide" pageControls={budgetHeader} afterSummary={peopleSummary} summary={<><div className="budget-v3-summary budget-desktop-summary"><span><small>Available</small><strong>{pounds(available)}</strong><span className="budget-v3-summary-note">{availableBasis}</span></span><span><small>Planned</small><strong>{pounds(total)}</strong></span><span className={available-total<0?'is-deficit':''}><small>Balance</small><strong>{balanceLabel(available-total)}</strong></span></div><MobileBudgetSummary view={mobileBudgetView} available={available} planned={total} allocated={transfers.accounts.reduce((sum,account)=>sum+account.amountPence,0)} hasItems={items.length>0} incomplete={!instructions||instructions.incomplete} onDetails={()=>setInfoDialog(mobileBudgetView)} person={transferPersonChoice}/></>}>
 <section className="budget-v3-workspace" id="budget-plan-panel" aria-label="Budget planning">{mobileBudgetView==='plan'&&planItemId&&!items.some(item=>item.id===planItemId)&&<p role="status">That budget item is no longer available for {monthLabel(month)}.</p>}{mobileBudgetView==='plan'&&planDestination&&<div ref={planDestinationHeading} className="budget-v3-destination-filter" role="region" aria-label="Plan destination filter" tabIndex={-1}><strong>Showing {matchingItems.length} {matchingItems.length===1?'item':'items'} for {planDestinationLabel} · {monthLabel(month)}</strong><span>Matching total {pounds(matchingItems.reduce((sum,item)=>sum+item.amountPence,0))}</span><div className="budget-v3-destination-actions">{onReturnToTransfers&&<button type="button" onClick={onReturnToTransfers}>{hasTransfersOrigin?'Back to Transfers':'View Transfers'}</button>}{onClearPlanDestination&&<button type="button" onClick={onClearPlanDestination}>Clear destination filter</button>}</div></div>}
 {showPlanFilters&&<div className="budget-v3-scroll-tools">{scopedPlan?<details className="budget-v3-scoped-filters"><summary>Search and filter{query||ownerFilter!=='All'||categoryFilter!=='All'?' · active':''}</summary>{planFilters}</details>:planFilters}</div>}
 {searchMode&&<p className="budget-v3-search-count" role="status">{matchingItems.length} matching {matchingItems.length===1?'item':'items'} · Matching total {pounds(matchingItems.reduce((sum,item)=>sum+item.amountPence,0))}</p>}
 <PlanTable document={document} setDocument={setDocument} month={month} editScopeLabel={editScopeLabel} owners={planOwners} labels={labels} query={query} planDestination={planDestination} view={mobileBudgetView} mobilePresentation={mobilePresentation} scoped={scopedPlan} filterKey={`${ownerFilter}\u0000${categoryFilter}`} editorOpen={editor} empty={planEmpty}
  onEdit={start} onRemove={removeItem} onQuickEditOpen={()=>setInlineSavedItem(null)} onAmountSaved={(name,impact)=>{setSavedImpact(impact);setInlineSavedItem(name)}} focusFallback={()=>searchRef.current?.focus({preventScroll:true})}/>
 {(batchMessage||inlineFeedback||savedImpact?.month===month)&&<div className="budget-save-result"><button type="button" className="budget-save-dismiss" aria-label="Dismiss save result" onClick={()=>{setBatchMessage('');setInlineSavedItem(null);setSavedImpact(null)}}>×</button>{batchMessage&&<div className="budget-v3-save-status" role="status">{saveStatus==='Not saved'?'Budget could not be saved. Check save status.':saveStatus==='Saving…'||saveStatus==='Unsaved changes'?'Saving budget item…':batchMessage}</div>}{inlineFeedback&&<div className="budget-v3-save-status" role={saveStatus==='Not saved'?'alert':'status'}>{inlineFeedback}</div>}{savedImpact?.month===month&&(saveStatus==='Saved'||!saveStatus)&&onViewAffectedTransfers&&<button type="button" className="secondary-button budget-view-affected" onClick={()=>onViewAffectedTransfers(savedImpact)}>View affected transfers</button>}</div>}</section>
 </PageFrame>
 {confirm&&<ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} danger returnFocusTo={confirm.returnFocusTo} onCancel={()=>setConfirm(null)} onConfirm={()=>{confirm.onConfirm();setConfirm(null)}}>{confirm.body}</ConfirmDialog>}
 {infoDialog&&<BudgetInfoDialog title={infoDialog==='month'?'Month & income':`${infoDialog==='plan'?'Plan':'Transfers'} summary details`} onClose={()=>setInfoDialog(null)}>
  {infoDialog==='month'?<>
   <div className="budget-month-actions"><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setInfoDialog(null);openIncome()}}>Edit income</button><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setInfoDialog(null);setManagement(true)}}>Manage accounts, pots &amp; categories</button>{resolved.hasExplicitBudget&&<button type="button" className="text-button budget-remove-action" onClick={()=>{removeDate();setInfoDialog(null)}}>Remove budget date</button>}</div>
  </>:infoDialog==='plan'?<>
   <dl className="budget-info-metrics"><div><dt>Available<small>{availableBasis}</small></dt><dd>{pounds(available)}</dd></div><div><dt>Planned</dt><dd>{pounds(total)}</dd></div></dl>
  </>:<>
   <p>These are account funding requirements. Pot allocations are included in those totals, then moved within the account. Sources, automatic payments and payment status are not recorded.</p>
   <dl className="budget-info-metrics"><div><dt>Destination accounts</dt><dd>{transferAccounts.length}</dd></div></dl>
   <p>Amounts include exact pennies. Account totals include their allocations once; do not add the breakdown again.</p>
   {(instructions?.incomplete??transfers.unresolvedItemIds.length>0)&&<p>Totals include calculated contributions only. Review incomplete allocations or missing pot responsibility before using the account instructions.</p>}
  </>}
 </BudgetInfoDialog>}
 {editor&&<BudgetItemEditor document={document} month={month} item={editingItem} onSave={saveBatch} onClose={()=>setEditor(false)}/>}
 {incomeOpen&&<IncomeDialog document={document} setDocument={setDocument} month={month} onClose={()=>setIncomeOpen(false)}/>}
 {management&&<BudgetManagement document={document} setDocument={setDocument} onClose={()=>setManagement(false)}/>}
 </>
}
