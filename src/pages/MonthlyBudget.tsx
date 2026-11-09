import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { buildTransferInstructions, type TransferInstructions } from '../domain/transferInstructions'
import { AccountFundingNote } from './TransferCalculationNotes'
import { budgetEditScope, incomeEditScope, budgetDateMarkers, incomeDateMarkers, resolveBudget, resolveIncomeSources, updateBudgetAtMonth, updateIncomeAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { PageFrame } from '../components/PageFrame'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PLAN_FILTER_MIN_ITEMS } from './planListConfig'
import { GroupedTable, GroupedTableBandRow, GroupedTableDisclosure, type GroupedTableGroup } from '../components/GroupedTable'
import { BudgetManagement } from './BudgetManagement'
import { BudgetItemEditor } from './BudgetItemEditor'
import { BudgetInfoDialog, MobileBudgetSummary, MobileTransferOverview, MobileTransferDetail } from './MobileBudgetViews'
import { MobileTransferMatrix } from './MobileTransferMatrix'
import { buildTransferMatrixModel, type TransferMatrixModel } from '../domain/transferMatrix'
import { budgetImpact, type BudgetImpact } from '../domain/budgetImpact'
import { ImpactPreview } from '../components/ImpactPreview'
import { commitItemBatch, moneyPence, type BudgetItemBatch } from '../domain/budgetItemDrafts'
import { accountTypeLabel } from '../domain/accountTypes'
import { accountPeople as accountPeopleFor, personTransferPlans } from '../domain/personTransfers'
import { readTransferPerson, rememberTransferPerson, resolveTransferPerson } from '../state/transferPerson'
import { accountOptionLabels, accountOwnerLabel, matrixAccountLabels } from './budgetLabels'
import { formatEditScope, formatMonth } from '../formatting/month'
import { formatGBP } from '../formatting/money'
import type { MatrixReturn, PlanDestination } from '../state/navigation'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; saveStatus?: string; accountBacked?: boolean; mobileBudgetView?: 'transfers' | 'plan'; month?: string; onMonthChange?: (month: string) => void; transferAccount?: string | null; onOpenTransferAccount?: (id: string) => void; onCloseTransferAccount?: () => void; onDismissTransferAccount?: () => void; planDestination?: PlanDestination | null; onOpenPlanDestination?: (destination: PlanDestination, origin?: MatrixReturn) => void; onClearPlanDestination?: () => void; onReturnToTransfers?: () => void; onViewAffectedTransfers?: (impact: BudgetImpact) => void; affectedTransfers?: BudgetImpact | null; hasMatrixOrigin?: boolean; matrixReturn?: MatrixReturn | null; planItemId?: string }
const mobileQuery = '(max-width: 767px), (min-width: 768px) and (max-width: 980px) and (max-height: 480px) and (orientation: landscape) and (hover: none) and (pointer: coarse)'
const subscribeMobile = (callback: () => void) => { const media = window.matchMedia?.(mobileQuery); media?.addEventListener('change', callback); return () => media?.removeEventListener('change', callback) }
const getMobile = () => !window.matchMedia || window.matchMedia(mobileQuery).matches
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthLabel = formatMonth
const shift = (month: string, by: number) => { const [y,m] = month.split('-').map(Number); const d = new Date(y!,m!-1+by,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
const pounds = (pence: number) => formatGBP(pence / 100)
const signedPounds = (pence: number) => pence < 0 ? `−${pounds(Math.abs(pence))}` : pounds(pence)
const PLAN_COLLAPSED_KEY = 'north.plan.collapsed'
const readPlanCollapsed = (): Record<string, boolean> => { try { const value: unknown = JSON.parse(window.sessionStorage.getItem(PLAN_COLLAPSED_KEY) ?? '{}'); return value && typeof value === 'object' ? value as Record<string, boolean> : {} } catch { return {} } }
const id = () => crypto.randomUUID()

function MonthControl({month,onChange,budgetMarkers,incomeMarkers}:{month:string;onChange:(value:string)=>void;budgetMarkers:string[];incomeMarkers:string[]}) {
 const [open,setOpen]=useState(false), [year,setYear]=useState(Number(month.slice(0,4)))
 return <div className="budget-v3-month"><button type="button" aria-label="Previous month" onClick={()=>onChange(shift(month,-1))}>‹</button><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setYear(Number(month.slice(0,4)));setOpen(!open)}}>{monthLabel(month)}</button><button type="button" aria-label="Next month" onClick={()=>onChange(shift(month,1))}>›</button>{open&&<div className="budget-v3-picker" role="dialog" aria-label="Choose budget month"><header><button type="button" onClick={()=>setYear(year-1)}>‹</button>{year}<button type="button" onClick={()=>setYear(year+1)}>›</button></header><div>{monthNames.map((name,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`;const b=budgetMarkers.includes(key),inc=incomeMarkers.includes(key);return <button type="button" key={key} aria-label={`${name} ${year}${b?', budget updated':''}${inc?', income updated':''}`} onClick={()=>{onChange(key);setOpen(false)}}>{name.slice(0,3)}{(b||inc)&&<small aria-hidden="true">{b?'●':''}{inc?'•':''}</small>}</button>})}</div><p>● Budget updated · • Income updated</p></div>}</div>
}

export function MonthlyBudget({document,setDocument,saveStatus,mobileBudgetView:sharedMobileBudgetView,month:sharedMonth,onMonthChange,transferAccount:sharedTransferAccount,onOpenTransferAccount,onCloseTransferAccount,onDismissTransferAccount,planDestination,onOpenPlanDestination,onClearPlanDestination,onReturnToTransfers,onViewAffectedTransfers,affectedTransfers,hasMatrixOrigin,matrixReturn,planItemId}:Props) {
 const mobilePresentation=useSyncExternalStore(subscribeMobile,getMobile,()=>false)
 const [localMonth,setLocalMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
 const month=sharedMonth??localMonth
 const setMonth=onMonthChange??setLocalMonth
 const [query,setQuery]=useState(''),[editor,setEditor]=useState(false),[editingItem,setEditingItem]=useState<BudgetItem>(),[management,setManagement]=useState(false),[incomeOpen,setIncomeOpen]=useState(false)
 const browseScroll=useRef<{top:number;left:number;page:boolean;month:string;destination:string}|null>(null)
 const [batchMessage,setBatchMessage]=useState('')
 const [savedImpact,setSavedImpact]=useState<BudgetImpact|null>(null)
 const [impactRetry,setImpactRetry]=useState(0)
 const [ownerFilter,setOwnerFilter]=useState('All')
 const [categoryFilter,setCategoryFilter]=useState('All')
 const mobileBudgetView=sharedMobileBudgetView??'plan'
 const [matrixPreview,setMatrixPreview]=useState(false)
 const restoredMatrixKey=useRef<string|null>(null),pendingMatrixScroll=useRef<MatrixReturn|null>(null),planFocusItem=useRef<string|null>(planItemId??null),previousBudgetView=useRef(mobileBudgetView)
 const planDestinationHeading=useRef<HTMLDivElement>(null),previousPlanDestination=useRef<string|null>(null)
 const [transferCollapsed,setTransferCollapsed]=useState<Record<string,boolean>>({})
 const [localTransferAccount,setLocalTransferAccount]=useState<string|null>(null)
 const selectedTransferAccount=sharedTransferAccount===undefined?localTransferAccount:sharedTransferAccount
 const [detailNotice,setDetailNotice]=useState('')
 const detailTrigger=useRef<HTMLButtonElement|null>(null)
 const [infoDialog,setInfoDialog]=useState<'month'|'plan'|'transfers'|null>(null)
 const monthOptionsRef=useRef<HTMLButtonElement>(null), optionsHandoff=useRef(false)
 useLayoutEffect(()=>{
  if(!optionsHandoff.current||(!incomeOpen&&!management))return
  const trigger=monthOptionsRef.current
  window.document.querySelector<HTMLElement>('.budget-v3-overlay button, .budget-v3-overlay input')?.focus()
  return()=>{trigger?.focus({preventScroll:true});optionsHandoff.current=false}
 },[incomeOpen,management])
 const [planCollapsed,setPlanCollapsed]=useState<Record<string,boolean>>(readPlanCollapsed)
 useEffect(()=>{try{window.sessionStorage.setItem(PLAN_COLLAPSED_KEY,JSON.stringify(planCollapsed))}catch{/* storage unavailable */}},[planCollapsed])
 const [searchCollapsed,setSearchCollapsed]=useState<Record<string,boolean>>({})
 const [destinationCollapsed,setDestinationCollapsed]=useState<Record<string,boolean>>({})
 const [incomeDraft,setIncomeDraft]=useState<Record<string,string>>({})
 const [newIncomeName,setNewIncomeName]=useState(''),[newIncomePerson,setNewIncomePerson]=useState(document.household.adults[0]?.id??''),[newIncomeType,setNewIncomeType]=useState<'employment'|'additional'>('employment'),[newIncomeAmount,setNewIncomeAmount]=useState(''),[incomeHelp,setIncomeHelp]=useState(false)
 const [inlineId,setInlineId]=useState<string|null>(null),[inlineValue,setInlineValue]=useState(''),[formError,setFormError]=useState('')
 const [inlineSavedItem,setInlineSavedItem]=useState<string|null>(null)
 // The consequence sits above Save; keep the whole quick-edit form (and so Save) in view as it grows.
 useEffect(()=>{if(inlineId)window.document.getElementById(`inline-form-${inlineId}`)?.scrollIntoView?.({block:'nearest'})},[inlineId,inlineValue])
 const [confirm,setConfirm]=useState<{title:string;body:ReactNode;confirmLabel:string;onConfirm:()=>void;returnFocusTo:()=>HTMLElement|null|undefined}|null>(null)
 const inlineTrigger=useRef<HTMLButtonElement|null>(null)
 useEffect(()=>{const timer=window.setTimeout(()=>{setInlineId(null);setFormError('');setInlineSavedItem(null)},0);return()=>window.clearTimeout(timer)},[month,mobileBudgetView,planDestination,ownerFilter,categoryFilter,query])
 const resolved=resolveBudget(document.budget,month), items=resolved.items, adults=document.household.adults
 const editScopeLabel=formatEditScope(budgetEditScope(document.budget,month))
 const openIncome=()=>{setIncomeDraft({});setIncomeOpen(true)}
 const incomes=resolveIncomeSources(document.budget,month), transfers=budgetTransfers(document.budget,adults.map(p=>p.id),month,items)
 let matrixModel:TransferMatrixModel|undefined, matrixUnavailable=false
 if(mobilePresentation&&mobileBudgetView==='transfers'&&matrixPreview){try{matrixModel=buildTransferMatrixModel(document,month)}catch{matrixUnavailable=true}}
 const showMatrix=!!matrixModel
 let instructions:TransferInstructions|undefined
 try{instructions=buildTransferInstructions(document,month)}catch{/* Keep the comparison view available; unavailable instructions are labelled below. */}
 const unfundedItems=items.filter(item=>transfers.unresolvedItemIds.includes(item.id))
 const transferWarning=unfundedItems.length>0||!instructions
 const categories=document.budget.categories
 const accountLabels=accountOptionLabels(document.budget.accounts,adults)
 const mobileAccountLabels=accountOptionLabels(document.budget.accounts,adults,false)
 const allMatrixLabels=matrixAccountLabels(document.budget.accounts,adults)
 const accountFor=(item:BudgetItem)=>{const destination=item.destination;if(destination.kind==='account')return document.budget.accounts.find(a=>a.id===destination.accountId);const potId=destination.potId;return document.budget.accounts.find(a=>a.id===document.budget.pots.find(p=>p.id===potId)?.accountId)}
 const ownerGroup=(item:BudgetItem)=>{const a=accountFor(item);if(!a)return 'Needs owner';if(a.ownerPersonIds.length>1)return 'Joint';if(!a.ownerPersonIds.length)return 'Needs owner';return adults.find(p=>p.id===a.ownerPersonIds[0])?.name??'Needs owner'}
 const matchesPlanDestination=(item:BudgetItem)=>{
  if(!planDestination)return true
  if(planDestination.kind==='pot')return item.destination.kind==='pot'&&item.destination.potId===planDestination.id
  if(planDestination.kind==='direct')return item.destination.kind==='account'&&item.destination.accountId===planDestination.id
  return accountFor(item)?.id===planDestination.id
 }
 const destinationItems=items.filter(matchesPlanDestination)
 const planDestinationLabel=(()=>{if(!planDestination)return '';if(planDestination.kind==='pot'){const pot=document.budget.pots.find(row=>row.id===planDestination.id);if(!pot)return 'Destination no longer available';const account=allMatrixLabels.get(pot.accountId),name=/\bpot$/i.test(pot.name)?pot.name:`${pot.name} pot`;return account?`${name} · ${account}`:'Destination no longer available'}const account=allMatrixLabels.get(planDestination.id);return account?planDestination.kind==='direct'?`Direct to account · ${account}`:account:'Destination no longer available'})()
 const searchMatch=(item:BudgetItem)=>{const needle=query.trim().toLocaleLowerCase();if(!needle)return true;const c=categories.find(x=>x.id===item.categoryId)?.name??'',a=accountFor(item),destination=item.destination,p=destination.kind==='pot'?document.budget.pots.find(x=>x.id===destination.potId)?.name??'':'';const owner=ownerGroup(item);return [item.name,c,a?.name,a?.provider,accountTypeLabel(a?.accountTypeId),p,owner].some(v=>v?.toLocaleLowerCase().includes(needle))}
 const rowsByOwner=new Map<string,Map<string,BudgetItem[]>>();for(const item of destinationItems.filter(item=>searchMatch(item)&&(!mobilePresentation||categoryFilter==='All'||item.categoryId===categoryFilter))){const owner=ownerGroup(item),cat=categories.find(c=>c.id===item.categoryId)?.name??'Uncategorised';const cats=rowsByOwner.get(owner)??new Map<string,BudgetItem[]>();cats.set(cat,[...(cats.get(cat)??[]),item]);rowsByOwner.set(owner,cats)}const grouped=[...rowsByOwner]
 const total=items.reduce((sum,item)=>sum+item.amountPence,0)
 const transferAccounts=transfers.accounts.map(account=>({...account,incomplete:account.incomplete||instructions?.accounts.find(row=>row.accountId===account.accountId)?.status==='needs-review'})).sort((a,b)=>{
  const accountA=document.budget.accounts.find(account=>account.id===a.accountId),accountB=document.budget.accounts.find(account=>account.id===b.accountId)
  const rank=(account:typeof accountA)=>!account?.ownerPersonIds.length?2:account.ownerPersonIds.length>1?0:1
  const groupRank=rank(accountA)-rank(accountB)
  if(groupRank)return groupRank
  const personRank=(account:typeof accountA)=>account?.ownerPersonIds.length===1?adults.findIndex(person=>person.id===account.ownerPersonIds[0]):-1
  const ownerRank=personRank(accountA)-personRank(accountB)
  return ownerRank|| (accountLabels.get(a.accountId)??'').localeCompare(accountLabels.get(b.accountId)??'')
 })
 const accountPeople=(account:typeof transfers.accounts[number])=>accountPeopleFor(account,transfers.people.map(person=>person.personId))
 const [storedTransferPerson,setStoredTransferPerson]=useState(readTransferPerson)
 const transferPerson=resolveTransferPerson(storedTransferPerson,adults.map(person=>person.id))
 const chooseTransferPerson=(value:string)=>{rememberTransferPerson(value);setStoredTransferPerson(value)}
 const personPlans=personTransferPlans(transferAccounts,instructions,adults.map(person=>person.id))
 const selectedPersonPlan=transferPerson&&transferPerson!=='both'?personPlans.people.find(plan=>plan.personId===transferPerson):undefined
 const transferPersonChoice={adults,selection:transferPerson,onSelect:chooseTransferPerson,plan:selectedPersonPlan&&{name:adults.find(person=>person.id===selectedPersonPlan.personId)?.name??'Person',fundingPence:selectedPersonPlan.fundingPence,stepCount:selectedPersonPlan.stepCount}}
 const potName=(potId:string)=>document.budget.pots.find(pot=>pot.id===potId)?.name??'Pot'
 const selectedAccount=transferAccounts.find(account=>account.accountId===selectedTransferAccount)
 const selectedBudgetAccount=document.budget.accounts.find(account=>account.id===selectedTransferAccount)
 const selectedAccountAvailable=!!selectedAccount&&!!selectedBudgetAccount
 const openTransferAccount=(accountId:string,trigger:HTMLButtonElement)=>{detailTrigger.current=trigger;setDetailNotice('');if(onOpenTransferAccount)onOpenTransferAccount(accountId);else setLocalTransferAccount(accountId)}
 const closeTransferAccount=()=>{if(onCloseTransferAccount)onCloseTransferAccount();else setLocalTransferAccount(null)}
 useEffect(()=>{
  if(!selectedTransferAccount||mobilePresentation&&mobileBudgetView==='transfers'&&selectedAccountAvailable)return
  const timer=window.setTimeout(()=>{
   if(mobilePresentation&&mobileBudgetView==='transfers'&&!selectedAccountAvailable)setDetailNotice('Destination is no longer available')
   if(onDismissTransferAccount)onDismissTransferAccount();else setLocalTransferAccount(null)
  },0)
  return()=>window.clearTimeout(timer)
 },[selectedTransferAccount,selectedAccountAvailable,mobilePresentation,mobileBudgetView,onDismissTransferAccount])
 useEffect(()=>{if(!detailNotice)return;const timer=window.setTimeout(()=>setDetailNotice(''),6000);return()=>window.clearTimeout(timer)},[detailNotice])
 const start=(item?:BudgetItem)=>{setInlineId(null);setInlineSavedItem(null);setSavedImpact(null);setFormError('');setEditingItem(item);setEditor(true)}
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
 const removeItem=(item:BudgetItem,menu?:HTMLElement|null)=>{const next={...document,budget:updateBudgetAtMonth(document.budget,month,old=>old.filter(i=>i.id!==item.id))};setConfirm({title:`Remove ${item.name}?`,body:<><p>“{item.name}” will be removed from the budget.</p><ImpactPreview label="Before removing" scopeText={`Changes apply: ${editScopeLabel}. Later saved budgets stay unchanged.`} result={budgetImpact(document,next,month,[])} document={next}/></>,confirmLabel:'Remove item',returnFocusTo:()=>menu?.isConnected?menu:window.document.querySelector<HTMLElement>('.budget-v3-table-wrap'),onConfirm:()=>setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==item.id))}))})}
 const cancelInline=()=>{setInlineId(null);setFormError('');const id=inlineId;window.requestAnimationFrame(()=>{const trigger=inlineTrigger.current?.isConnected?inlineTrigger.current:id?window.document.querySelector<HTMLButtonElement>(`[data-amount-trigger="${id}"]`):null;trigger?.focus({preventScroll:true})})}
 const quickImpact=(item:BudgetItem)=>{const cents=moneyPence(inlineValue);if(cents===undefined||cents===item.amountPence)return undefined;const next={...document,budget:updateBudgetAtMonth(document.budget,month,old=>old.map(row=>row.id===item.id?{...row,entryAmountPence:cents,amountPence:cents}:row))};return budgetImpact(document,next,month,[item.id])}
 const commitInline=(item:BudgetItem)=>{if(inlineId!==item.id)return;const cents=moneyPence(inlineValue);if(cents===undefined){setFormError('Enter £0 or more, with up to two decimal places.');return}if(cents!==item.amountPence){const preview=quickImpact(item);if(preview&&'error' in preview){setFormError(preview.error);return}setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.map(row=>row.id===item.id?{...row,entryAmountPence:cents,amountPence:cents}:row))}));setSavedImpact(preview&&'impact' in preview?preview.impact:null);setInlineSavedItem(item.name)}cancelInline()}
 const inlineFeedback=inlineSavedItem?(saveStatus==='Not saved'?'Amount could not be saved. Check save status.':saveStatus==='Choose a version'?'Choose a budget version to finish saving the amount.':saveStatus==='Saving…'||saveStatus==='Unsaved changes'?'Saving amount…':saveStatus==='Saved'||!saveStatus?'Amount saved.':'Saving amount…'):''
 const removeDate=()=>{
  if(!resolved.hasExplicitBudget)return
  const snapshots={...document.budget.snapshots};delete snapshots[month]
  const previous=resolveBudget({...document.budget,snapshots},month)
  const replacement=previous.sourceMonth?`the budget from ${monthLabel(previous.sourceMonth)}`:previous.importedBaseline?'the imported legacy budget':'no budget'
  const next={...document,budget:{...document.budget,snapshots}}
  setConfirm({title:`Remove the ${monthLabel(month)} budget date?`,body:<ImpactPreview label="Before removing" scopeText={`${editScopeLabel} will use ${replacement}. Later saved budgets stay unchanged.`} result={budgetImpact(document,next,month,[])} document={next}/>,confirmLabel:'Remove budget date',returnFocusTo:()=>monthOptionsRef.current?.offsetParent?monthOptionsRef.current:window.document.querySelector<HTMLElement>('.budget-v3-month button[aria-haspopup]'),onConfirm:()=>setDocument(current=>{const snapshots={...current.budget.snapshots};delete snapshots[month];return {...current,budget:{...current.budget,snapshots}}})})
 }
 const destinationLabel=(item:BudgetItem)=>{const a=accountFor(item),destination=item.destination;return destination.kind==='pot'?`${document.budget.pots.find(p=>p.id===destination.potId)?.name??'Pot'} · ${a?accountLabels.get(a.id):'Account'}`:a?accountLabels.get(a.id)??'Account':'Account'}
 /** Owner and bank are already in the group band; rows only need the pot, or the account for direct items. */
 const shortDestinationLabel=(item:BudgetItem)=>{const destination=item.destination;if(destination.kind==='pot'){const name=document.budget.pots.find(p=>p.id===destination.potId)?.name??'Pot';return /\bpot$/i.test(name)?name:`${name} pot`}return accountFor(item)?.name??'Account'}
 const fundingLabel=(item:BudgetItem)=>item.funding==='fixed'?'Fixed contributions':item.funding==='proportional'?'Income ratio':item.funding==='equal'?'Equal split':item.funding==='single'?`One person · ${adults.find(a=>a.id===item.singleFunderId)?.name??'Person'}`:'Custom split'
 const incomeTotal=incomes.filter(x=>x.type==='employment').reduce((s,x)=>s+x.amountPence,0),available=transfers.availablePence,availableBasis=available===0?'no income yet':incomeTotal===0?'none from employment':incomeTotal===available?'all from employment':`${pounds(incomeTotal)} from employment`
 // Say the range once when every source shares it; per field only where they differ.
 const incomeScopes=incomes.map(source=>formatEditScope(incomeEditScope(source,month))),sharedIncomeScope=incomeScopes.length>0&&incomeScopes.every(scope=>scope===incomeScopes[0])?incomeScopes[0]:null
 const saveIncome=(e:FormEvent)=>{e.preventDefault();setDocument(current=>{let budget=current.budget;for(const source of budget.incomeSources){if(incomeDraft[source.id]!==undefined)budget=updateIncomeAtMonth(budget,month,source.id,Math.max(0,Math.round(Number(incomeDraft[source.id])*100)))}if(newIncomeName.trim()&&newIncomePerson)budget={...budget,incomeSources:[...budget.incomeSources,{id:id(),personId:newIncomePerson,name:newIncomeName.trim(),type:newIncomeType,baseAmountPence:Math.max(0,Math.round(Number(newIncomeAmount||0)*100)),baseEffectiveFrom:month,changes:{}}]};return {...current,budget}});setIncomeOpen(false);setNewIncomeName('');setNewIncomeAmount('')}
 const ownerOrder=['Joint',...adults.map(p=>p.name),'Needs owner']
 const visibleGrouped=ownerFilter==='All'?grouped:grouped.filter(([owner])=>owner===ownerFilter)
 const searchMode=!!query.trim()
 const destinationGroupKey=(key:string)=>`${month}:${planDestination?.kind}:${planDestination?.id}:${key}`
 const groupCollapsed=(key:string)=>query?!!searchCollapsed[key]:planDestination?!!destinationCollapsed[destinationGroupKey(key)]:!!planCollapsed[key]
 const visibleOwners=ownerOrder.flatMap(owner=>{const cats=visibleGrouped.find(([label])=>label===owner)?.[1];if(!cats)return [];const ownerItems=[...cats.values()].flat();const key=`owner:${owner}`;return [{name:owner,key,items:ownerItems,collapsed:groupCollapsed(key),categories:[...cats].map(([name,items])=>{const key=`${owner}:${name}`;return {name,key,items,collapsed:groupCollapsed(key)}})}]})
 const scopedPlan=mobilePresentation&&mobileBudgetView==='plan'&&!!planDestination
 const compactPlan=mobilePresentation&&mobileBudgetView==='plan'&&!!window.matchMedia
 const omitOwner=scopedPlan&&visibleOwners.length===1
 const singleScope=omitOwner&&visibleOwners[0]!.categories.length===1
 const matchingItems=visibleGrouped.flatMap(([,cats])=>[...cats.values()].flat())
 const searchRef=useRef<HTMLInputElement>(null)
 const captureBrowseScroll=()=>{
  if(query.trim()||browseScroll.current)return
  const body=window.document.querySelector<HTMLElement>('.monthly-budget-page>.page-frame-body')
  const page=mobilePresentation||!body||getComputedStyle(body).overflowY==='visible'
  browseScroll.current={top:page?window.scrollY:body.scrollTop,left:page?window.scrollX:body.scrollLeft,page,month,destination:planDestination?`${planDestination.kind}:${planDestination.id}`:''}
 }
 const updateSearch=(value:string)=>{
  if(!query.trim()&&value.trim())captureBrowseScroll()
  setSearchCollapsed({});setQuery(value)
  if(query.trim()&&!value.trim()&&browseScroll.current){
   const position=browseScroll.current;browseScroll.current=null
   if(position.month===month&&position.destination===(planDestination?`${planDestination.kind}:${planDestination.id}`:''))window.requestAnimationFrame(()=>{if(position.page)window.scrollTo(position.left,position.top);else{const body=window.document.querySelector<HTMLElement>('.monthly-budget-page>.page-frame-body');if(body){body.scrollTop=position.top;body.scrollLeft=position.left}}})
  }
 }
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
 useLayoutEffect(()=>{
  if(mobileBudgetView==='plan')restoredMatrixKey.current=null
  if(mobileBudgetView==='transfers'&&matrixReturn&&restoredMatrixKey.current!==matrixReturn.key){
   restoredMatrixKey.current=matrixReturn.key
   pendingMatrixScroll.current=matrixReturn
   setMatrixPreview(true)
  }
  if(mobileBudgetView==='transfers'&&pendingMatrixScroll.current&&(showMatrix||matrixUnavailable)){
   const {destination,accountId,scrollTop,scrollLeft}=pendingMatrixScroll.current
   const wrap=window.document.querySelector<HTMLElement>('.transfer-matrix-scroll')
   if(wrap){
    wrap.scrollTop=Math.max(0,Math.min(scrollTop,wrap.scrollHeight-wrap.clientHeight))
    wrap.scrollLeft=Math.max(0,Math.min(scrollLeft,wrap.scrollWidth-wrap.clientWidth))
   }
   const buttons=Array.from(window.document.querySelectorAll<HTMLButtonElement>('[data-matrix-plan-kind]')).filter(button=>button.getAttribute('aria-hidden')!=='true')
   const target=buttons.find(button=>button.dataset.matrixPlanKind===destination.kind&&button.dataset.matrixPlanId===destination.id)
    ??buttons.find(button=>button.dataset.matrixPlanKind==='account'&&button.dataset.matrixPlanId===accountId)
    ??buttons.find(button=>button.dataset.matrixAccountId===accountId)
    ??window.document.querySelector<HTMLButtonElement>('[data-matrix-preview-toggle]')
   target?.focus({preventScroll:true});pendingMatrixScroll.current=null
  }
 },[mobileBudgetView,matrixReturn,month,showMatrix,matrixUnavailable])
 const groupLabel=(group:{items:BudgetItem[]})=>`${group.items.length} items · ${query||planDestination?'Matching total ':''}${pounds(group.items.reduce((sum,item)=>sum+item.amountPence,0))}`
 const groupButton=(group:{name:string;key:string;items:BudgetItem[];collapsed:boolean},sticky=false)=>{
  const Icon=group.collapsed?ChevronRight:ChevronDown
  return <GroupedTableDisclosure groupKey={group.key} sticky={sticky} expanded={!group.collapsed} label={`${group.name}, ${groupLabel(group)}`} onClick={()=>{
   if(!group.collapsed){setInlineId(null);setFormError('')}
   if(query)setSearchCollapsed(value=>({...value,[group.key]:!group.collapsed}))
   else if(planDestination)setDestinationCollapsed(value=>({...value,[destinationGroupKey(group.key)]:!group.collapsed}))
   else setPlanCollapsed(value=>({...value,[group.key]:!group.collapsed}))
  }}><span className="budget-v3-group-title"><Icon aria-hidden="true" focusable="false"/><span>{group.name}</span></span><span className="budget-v3-group-total">{groupLabel(group)}</span></GroupedTableDisclosure>
 }
 const planGroups:GroupedTableGroup[]=searchMode?[]:compactPlan?visibleOwners.flatMap(owner=>owner.categories.map(category=>({key:category.key,level:0}))):singleScope?[]:visibleOwners.flatMap(owner=>[
  ...(!omitOwner?[{key:owner.key,level:0}]:[]),
  ...(omitOwner||!owner.collapsed?owner.categories.map(category=>({key:category.key,level:omitOwner?0:1,parentKey:omitOwner?undefined:owner.key})):[]),
 ])
 const renderPlanStickyGroup=(group:GroupedTableGroup)=>{
  if(compactPlan){const owner=visibleOwners.find(row=>row.categories.some(category=>category.key===group.key));const category=owner?.categories.find(row=>row.key===group.key);return owner&&category?<div key={group.key} className="grouped-table-sticky-band budget-v3-sticky-category budget-v3-compact-group"><span>{owner.name} · {category.name}</span><span>{groupLabel(category)}</span></div>:null}
  const owner=visibleOwners.find(row=>row.key===group.key)
  if(owner)return <div key={group.key} className="grouped-table-sticky-band budget-v3-sticky-owner">{groupButton(owner,true)}</div>
  const category=visibleOwners.flatMap(row=>row.categories).find(row=>row.key===group.key)
  return category?<div key={group.key} className="grouped-table-sticky-band budget-v3-sticky-category">{groupButton(category,true)}</div>:null
 }
 const selectedMonthIncomeUpdated=incomeDateMarkers(document.budget).includes(month)
 const desktopBudgetDateStatus=resolved.hasExplicitBudget?`Budget set for ${monthLabel(resolved.sourceMonth!)}`:resolved.sourceMonth?`Using budget from ${monthLabel(resolved.sourceMonth)}`:resolved.importedBaseline?'Using imported legacy budget':'No budget is set for this month'
 const mobileBudgetDateStatus=resolved.hasExplicitBudget?'Budget set':resolved.sourceMonth?`Using budget from ${monthLabel(resolved.sourceMonth)}`:resolved.importedBaseline?'Using imported legacy budget':'No budget is set for this month'
 const budgetDateNote=<div className="budget-v3-date-note"><span className="budget-v3-date-note-desktop">{desktopBudgetDateStatus}{` · Budget edits apply: ${editScopeLabel}`}{selectedMonthIncomeUpdated?` · Income updated ${monthLabel(month)}`:''}</span><span className="budget-v3-date-note-mobile">{mobileBudgetDateStatus}</span></div>
 const budgetHeader=<><div className="budget-v3-toolbar budget-desktop-toolbar"><div className="budget-v3-tools"><button className="secondary-button" onClick={()=>openIncome()}>Edit income</button><button className="secondary-button" onClick={()=>setManagement(true)}>Manage accounts, pots &amp; categories</button><button className="primary-button" onClick={()=>start()}>Add item</button></div></div><div className="budget-mobile-plan-heading"><h2>Budget items</h2><button type="button" className="primary-button" onClick={()=>start()}>Add item</button></div></>
 const peopleSummary=<section className="budget-v3-transfers budget-v3-people-summary" id="budget-transfers-panel" aria-label="People and transfers">
  {affectedTransfers&&mobileBudgetView==='transfers'&&<div className="budget-affected-banner" role="status"><strong>Changed by recent edit</strong>{affectedTransfers.accounts.map(account=><p key={account.accountId}>{document.budget.accounts.find(row=>row.id===account.accountId)?.name??'Account'}: {pounds(account.beforePence)} → {pounds(account.afterPence)}</p>)}</div>}
  <div className="budget-v3-desktop-people"><h2>People &amp; transfers</h2>
  <h3>Monthly plan by person</h3>
  <div className="budget-v3-person-grid">{transfers.people.map(person=>{const p=adults.find(a=>a.id===person.personId);return <article key={person.personId}>
   <h4>{p?.name??'Person'}</h4>
   <dl className="budget-v3-person-metrics"><div><dt>Available</dt><dd>{pounds(person.availablePence)}</dd></div><div><dt>Planned contributions</dt><dd>{pounds(person.plannedPence)}</dd></div><div className={person.remainingPence<0?'is-negative':''}><dt>Remaining</dt><dd>{signedPounds(person.remainingPence)}</dd></div></dl>
   <details className="budget-v3-income-details"><summary>Income details</summary><dl><div><dt>Employment income</dt><dd>{pounds(person.employmentPence)}</dd></div><div><dt>Additional income</dt><dd>{pounds(person.additionalPence)}</dd></div></dl></details>
  </article>})}</div></div>
  {unfundedItems.length>0&&<div className="budget-v3-transfer-warning" role="status"><p><strong>{unfundedItems.length} {unfundedItems.length===1?'item':'items'} can’t be funded yet.</strong> <button type="button" onClick={()=>openIncome()}>Edit income</button></p><details><summary>Show items</summary><ul>{unfundedItems.map(item=><li key={item.id}>{item.name}</li>)}</ul></details></div>}
  {!instructions&&<p className="budget-v3-transfer-warning" role="alert">Transfer instructions are unavailable. The comparison below may be incomplete; review the budget before moving money.</p>}{mobilePresentation&&mobileBudgetView==='transfers'&&<div className="transfer-matrix-preview-control"><div className="transfer-view-switch" role="group" aria-label="Transfers view"><button type="button" aria-pressed={!showMatrix} onClick={()=>setMatrixPreview(false)}>List</button><button type="button" aria-pressed={showMatrix} data-matrix-preview-toggle onClick={()=>setMatrixPreview(true)}>Matrix</button></div>{matrixUnavailable&&<p role="status">The matrix is unavailable for this budget. The list is still available.</p>}</div>}
  {transferAccounts.length===0?(showMatrix?null:<div className="budget-v3-transfer-empty"><h3>No transfers planned</h3><p>Budget items assigned to accounts or pots will appear here.</p></div>):<>
   {!transferWarning&&!showMatrix&&<AccountFundingNote/>}<div className="budget-v3-transfer-heading"><h3>Transfers by destination</h3>{instructions?.incomplete&&<span className="budget-desktop-only">Account instructions need review: *</span>}</div>
   <div className="budget-v3-transfer-table-wrap"><table className="budget-v3-transfer-table">
    <caption className="visually-hidden">Monthly transfer amounts by destination and person</caption>
    <thead><tr><th scope="col">Destination</th>{transfers.people.map(person=><th scope="col" key={person.personId}>{adults.find(row=>row.id===person.personId)?.name??'Person'}</th>)}<th scope="col">Total</th></tr></thead>
    <tbody>{transferAccounts.map(account=>{const label=accountLabels.get(account.accountId)??'Account',collapsed=transferCollapsed[account.accountId]??false,hasDetails=account.hasPots,notCalculated=account.incomplete&&account.amountPence===0;return <Fragment key={account.accountId}>
     <tr className={`budget-v3-transfer-account${account.incomplete?' is-incomplete':''}${affectedTransfers?.accounts.some(row=>row.accountId===account.accountId)?' is-affected':''}`}><th scope="row">{hasDetails?<button type="button" aria-expanded={!collapsed} onClick={()=>setTransferCollapsed(current=>({...current,[account.accountId]:!collapsed}))}>{collapsed?<ChevronRight aria-hidden="true"/>:<ChevronDown aria-hidden="true"/>}<span>{label}</span></button>:<span>{label}</span>}{affectedTransfers?.accounts.some(row=>row.accountId===account.accountId)&&<small className="budget-affected-label">Changed by recent edit</small>}</th>{accountPeople(account).map(person=><td key={person.personId}>{notCalculated?'—':pounds(person.amountPence)}</td>)}<td>{notCalculated?<span className="budget-not-calculated">Not calculated</span>:<>{pounds(account.amountPence)}{account.incomplete?' *':''}</>}</td></tr>
     {hasDetails&&!collapsed&&<>{account.hasDirect&&<tr className="budget-v3-transfer-child"><th scope="row">Direct to account</th>{transfers.people.map(person=><td key={person.personId}>{notCalculated?'—':pounds(account.directByPerson.find(row=>row.personId===person.personId)?.amountPence??0)}</td>)}<td>{notCalculated?'—':pounds(account.directAmountPence)}</td></tr>}{account.pots.map(pot=><Fragment key={pot.potId}><tr className="budget-v3-transfer-child"><th scope="row">{document.budget.pots.find(row=>row.id===pot.potId)?.name??'Pot'}</th>{pot.byPerson.map(row=><td key={row.personId}>{notCalculated?'—':pounds(row.amountPence)}</td>)}<td>{notCalculated?'—':pounds(pot.amountPence)}</td></tr></Fragment>)}</>}
    </Fragment>})}</tbody>
    <tfoot><tr className={instructions?.incomplete?'is-incomplete':undefined}><th scope="row">Funding total</th>{transfers.people.map(person=><td key={person.personId}>{pounds(person.plannedPence)}</td>)}<td>{pounds(transfers.accounts.reduce((sum,account)=>sum+account.amountPence,0))}{instructions?.incomplete?' *':''}</td></tr></tfoot>
   </table></div>
   {transferAccounts.some(account=>account.hasPots)&&<p className="budget-v3-transfer-rounding">Pot movements are already inside each account total.</p>}
   {detailNotice&&<p className="budget-destination-notice" role="status">{detailNotice}</p>}
   {!showMatrix&&<MobileTransferOverview plans={personPlans} selection={transferPerson} accounts={transferAccounts} labels={accountLabels} adults={adults} potName={potName} onOpen={openTransferAccount} affectedAccounts={affectedTransfers?.accounts.map(row=>row.accountId)}/>}

  </>}
  {matrixModel&&<MobileTransferMatrix key={matrixModel.month} model={matrixModel} restoredExpandedIds={matrixReturn?.expandedIds} labels={matrixAccountLabels(document.budget.accounts.filter(account=>matrixModel.accounts.some(row=>row.accountId===account.id)),adults)} onPlanDestination={onOpenPlanDestination?(destination,accountId,expandedIds)=>{const wrap=window.document.querySelector<HTMLElement>('.transfer-matrix-scroll');const origin:MatrixReturn={key:crypto.randomUUID(),month,expandedIds,scrollTop:wrap?.scrollTop??0,scrollLeft:wrap?.scrollLeft??0,destination,accountId};setQuery('');setOwnerFilter('All');setSearchCollapsed({});onOpenPlanDestination(destination,origin)}:undefined}/>}
 </section>
 const showPlanFilters=items.length>=PLAN_FILTER_MIN_ITEMS||searchMode||ownerFilter!=='All'||categoryFilter!=='All'
 const planFilters=<div className="budget-v3-controls"><div className="budget-v3-search-field"><label className="budget-v3-search"><span className="budget-v3-search-label">Search items, categories, owners, accounts or pots</span><input ref={searchRef} value={query} onPointerDownCapture={captureBrowseScroll} onFocus={captureBrowseScroll} onChange={e=>updateSearch(e.target.value)} placeholder="Search budget"/></label>{searchMode&&<button type="button" className="budget-v3-search-clear" onClick={()=>{updateSearch('');window.requestAnimationFrame(()=>searchRef.current?.focus({preventScroll:true}))}}>Clear search</button>}</div><label className="budget-v3-filter budget-v3-owner-filter">Owner<select className="budget-v3-filter-select" value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option>All</option>{ownerOrder.filter(owner=>owner!=='Needs owner').map(owner=><option key={owner}>{owner}</option>)}{ownerOrder.includes('Needs owner')&&<option>Needs owner</option>}</select></label><label className="budget-v3-filter budget-v3-category-filter">Category<select className="budget-v3-filter-select" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="All">All</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
 return <><PageFrame afterHeading={<div className="budget-v3-date-selector"><MonthControl month={month} onChange={setMonth} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/><div className="budget-v3-date-context">{budgetDateNote}<button ref={monthOptionsRef} type="button" className="text-button budget-mobile-month-options" onClick={()=>setInfoDialog('month')}>Month &amp; income</button><div className="budget-v3-date-action">{resolved.hasExplicitBudget&&<button className="text-button budget-v3-remove-date" onClick={removeDate}>Remove budget date</button>}</div></div></div>} title="Monthly budget" headingClass="route-heading visually-hidden" className={`monthly-budget-page mobile-budget-view-${mobileBudgetView}${scopedPlan?' scoped-plan':''}`} contentWidth="wide" pageControls={budgetHeader} afterSummary={peopleSummary} summary={<><div className="budget-v3-summary budget-desktop-summary"><span><small>Available this month</small><strong>{pounds(available)}</strong><span className="budget-v3-summary-note">{availableBasis}</span></span><span><small>Planned budget</small><strong>{pounds(total)}</strong></span><span className={available-total<0?'is-deficit':''}><small>Budget balance</small><strong>{available-total<0?`${pounds(total-available)} over`:`${pounds(available-total)} remaining`}</strong></span></div><MobileBudgetSummary view={mobileBudgetView} available={available} planned={total} allocated={transfers.accounts.reduce((sum,account)=>sum+account.amountPence,0)} hasItems={items.length>0} incomplete={!instructions||instructions.incomplete} onDetails={()=>setInfoDialog(mobileBudgetView)} person={transferPersonChoice}/></>}>
 <section className="budget-v3-workspace" id="budget-plan-panel" aria-label="Budget planning">{mobileBudgetView==='plan'&&planItemId&&!items.some(item=>item.id===planItemId)&&<p role="status">That budget item is no longer available for {monthLabel(month)}.</p>}{mobileBudgetView==='plan'&&planDestination&&<div ref={planDestinationHeading} className="budget-v3-destination-filter" role="region" aria-label="Plan destination filter" tabIndex={-1}><strong>Showing {matchingItems.length} {matchingItems.length===1?'item':'items'} for {planDestinationLabel} · {monthLabel(month)}</strong><span>Matching total {pounds(matchingItems.reduce((sum,item)=>sum+item.amountPence,0))}</span><div className="budget-v3-destination-actions">{onReturnToTransfers&&<button type="button" onClick={onReturnToTransfers}>{hasMatrixOrigin?'Back to Transfers':'View Transfers'}</button>}{onClearPlanDestination&&<button type="button" onClick={onClearPlanDestination}>Clear destination filter</button>}</div></div>}
 {showPlanFilters&&<div className="budget-v3-scroll-tools">{scopedPlan?<details className="budget-v3-scoped-filters"><summary>Search and filter{query||ownerFilter!=='All'||categoryFilter!=='All'?' · active':''}</summary>{planFilters}</details>:planFilters}</div>}
 {searchMode&&<p className="budget-v3-search-count" role="status">{matchingItems.length} matching {matchingItems.length===1?'item':'items'} · Matching total {pounds(matchingItems.reduce((sum,item)=>sum+item.amountPence,0))}</p>}
 {!items.length&&!planDestination?<div className="budget-v3-empty"><p>{resolved.sourceMonth||resolved.importedBaseline?'This budget has no items yet.':'There is no budget for this month yet.'}</p><button className="primary-button" onClick={()=>start()}>Add item</button></div>:!visibleGrouped.length?<p className="budget-v3-empty">{planDestination&&!destinationItems.length?`No items go to ${planDestinationLabel} for ${monthLabel(month)}.`:searchMode?`No items match “${query.trim()}” within the current filters. Try another search or clear the search.`:'No items match this destination and owner/category filter.'}</p>:<GroupedTable
  wrapClassName="budget-v3-table-wrap" className="budget-v3-table"
  regionLabel="Plan table" caption={searchMode?'Matching budget items':'Budget items by owner and category'}
  columns={mobilePresentation?[
   {key:'item',label:'Item'}, {key:'amount',label:'Amount'}, {key:'actions',label:'Actions'},
  ]:[
   {key:'item',label:'Item'}, {key:'amount',label:'Monthly amount'}, {key:'funding',label:'Funding'},
   {key:'destination',label:'Destination'}, {key:'actions',label:'Actions'},
  ]}
  groups={planGroups} renderStickyGroup={renderPlanStickyGroup} focusFallback={()=>searchRef.current?.focus({preventScroll:true})}>
  {visibleOwners.map(owner=><Fragment key={owner.key}>
   {!searchMode&&!compactPlan&&!omitOwner&&<GroupedTableBandRow group={{key:owner.key,level:0}} colSpan={mobilePresentation?3:5} className="budget-v3-owner" dataGroup="owner">{groupButton(owner)}</GroupedTableBandRow>}
   {(searchMode||compactPlan||omitOwner||!owner.collapsed)&&owner.categories.map(category=><Fragment key={category.key}>
    {!searchMode&&(compactPlan?<GroupedTableBandRow group={{key:category.key,level:0}} colSpan={3} className="budget-v3-category budget-v3-compact-group" dataGroup="category"><span>{owner.name} · {category.name}</span><span>{groupLabel(category)}</span></GroupedTableBandRow>:!singleScope&&<GroupedTableBandRow group={{key:category.key,level:omitOwner?0:1,parentKey:omitOwner?undefined:owner.key}} colSpan={mobilePresentation?3:5} className="budget-v3-category" dataGroup="category">{groupButton(category)}</GroupedTableBandRow>)}
    {(searchMode||compactPlan||singleScope||!category.collapsed)&&category.items.map(item=>{const impact=inlineId===item.id?quickImpact(item):undefined;return <Fragment key={item.id}><tr className="budget-v3-item" onClick={e=>{if((e.target as HTMLElement).closest('button,a,input,select,summary,details,label,form'))return;start(item)}}>
     <th scope="row" data-label="Item">
      <button type="button" className="budget-v3-item-name" title={`Edit details for ${item.name}`} data-budget-item-id={item.id} onClick={()=>start(item)}><span>{item.name}</span></button>
      {searchMode&&<span className="budget-v3-result-context">{owner.name} · {category.name}</span>}
      <span className="budget-v3-mobile-item-meta"><span className="visually-hidden">Funding: </span>{fundingLabel(item)}{(!scopedPlan||planDestination?.kind==='account')&&<><span aria-hidden="true"> · </span><span className="visually-hidden">Destination: </span><span className="budget-v3-compact-destination">{shortDestinationLabel(item)}</span></>}</span>
     </th>
     <td data-label="Monthly amount">{inlineId===item.id?<span className="budget-v3-inline-cell budget-money-field"><input id={`inline-amount-${item.id}`} form={`inline-form-${item.id}`} aria-describedby={`inline-scope-${item.id}${formError?` inline-error-${item.id}`:''}`} className="budget-v3-inline-amount" autoFocus inputMode="decimal" value={inlineValue} onChange={e=>{setInlineValue(e.target.value);setFormError('')}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();cancelInline()}}}/></span>:item.frequency==='monthly'&&item.funding!=='fixed'?<button type="button" data-amount-trigger={item.id} className="budget-v3-amount" aria-label={`Edit amount for ${item.name}`} aria-expanded={inlineId===item.id} onClick={e=>{inlineTrigger.current=e.currentTarget;setInlineId(item.id);setInlineValue((item.amountPence/100).toFixed(2));setFormError('');setInlineSavedItem(null)}}><span>{pounds(item.amountPence)}</span><Pencil aria-hidden="true" className="budget-v3-amount-icon"/></button>:<span className="budget-v3-static-amount">{pounds(item.amountPence)}</span>}</td>
     {!mobilePresentation&&<><td data-label="Funding">{fundingLabel(item)}</td><td data-label="Destination">{destinationLabel(item)}</td></>}
     <td data-label="Actions"><button className="text-button budget-v3-wide-edit" onClick={()=>start(item)}>Edit</button><details className="budget-v3-row-menu" onToggle={e=>{const menu=e.currentTarget;if(!menu.open)return;const wrap=menu.closest<HTMLElement>('.budget-v3-table-wrap');const bottom=wrap&&getComputedStyle(wrap).overflowY!=='visible'?Math.min(wrap.getBoundingClientRect().bottom,window.innerHeight):window.innerHeight;menu.dataset.openUp=bottom-menu.getBoundingClientRect().bottom<120?'true':'false'}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector<HTMLElement>('summary')?.focus()}}}><summary aria-label={`More actions for ${item.name}`}><span className="budget-v3-menu-label">More</span><span className="budget-v3-menu-icon" aria-hidden="true">⋯</span></summary><div className="budget-v3-menu-actions"><button type="button" className="budget-v3-compact-edit" onClick={e=>{e.currentTarget.closest('details')!.open=false;start(item)}}>Edit</button><button type="button" onClick={e=>{const menu=e.currentTarget.closest('details')!;menu.open=false;removeItem(item,menu.querySelector('summary'))}}>Remove</button></div></details></td>
    </tr>{inlineId===item.id&&<tr className="budget-v3-inline-row"><td colSpan={mobilePresentation?3:5}><form id={`inline-form-${item.id}`} aria-label={`Quick edit amount for ${item.name}`} onSubmit={e=>{e.preventDefault();commitInline(item)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();cancelInline()}}}><label htmlFor={`inline-amount-${item.id}`} className="visually-hidden">Monthly amount for {item.name}</label><ImpactPreview key={impactRetry} compact scopeId={`inline-scope-${item.id}`} scopeText={`Changes apply: ${editScopeLabel}.`} result={impact} document={document} onRetry={()=>setImpactRetry(value=>value+1)}/>{formError&&<p id={`inline-error-${item.id}`} role="alert">{formError}</p>}<div className="budget-v3-inline-controls"><button type="submit" className="primary-button" disabled={!!impact&&'error' in impact}>Save</button><button type="button" className="secondary-button" onClick={cancelInline}>Cancel</button></div></form></td></tr>}</Fragment>})}
   </Fragment>)}
  </Fragment>)}
 </GroupedTable>}
 {(batchMessage||inlineFeedback||savedImpact?.month===month)&&<div className="budget-save-result"><button type="button" className="budget-save-dismiss" aria-label="Dismiss save result" onClick={()=>{setBatchMessage('');setInlineSavedItem(null);setSavedImpact(null)}}>×</button>{batchMessage&&<div className="budget-v3-save-status" role="status">{saveStatus==='Not saved'?'Budget could not be saved. Check save status.':saveStatus==='Saving…'||saveStatus==='Unsaved changes'?'Saving budget item…':batchMessage}</div>}{inlineFeedback&&<div className="budget-v3-save-status" role={saveStatus==='Not saved'?'alert':'status'}>{inlineFeedback}</div>}{savedImpact?.month===month&&(saveStatus==='Saved'||!saveStatus)&&onViewAffectedTransfers&&<button type="button" className="secondary-button budget-view-affected" onClick={()=>onViewAffectedTransfers(savedImpact)}>View affected transfers</button>}</div>}</section>
 </PageFrame>
 {confirm&&<ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} danger returnFocusTo={confirm.returnFocusTo} onCancel={()=>setConfirm(null)} onConfirm={()=>{confirm.onConfirm();setConfirm(null)}}>{confirm.body}</ConfirmDialog>}
 {infoDialog&&<BudgetInfoDialog title={infoDialog==='month'?'Month & income':`${infoDialog==='plan'?'Plan':'Transfers'} summary details`} onClose={()=>setInfoDialog(null)}>
  {infoDialog==='month'?<>
   <p><strong>{monthLabel(month)}</strong></p><p>{desktopBudgetDateStatus}</p>
   {selectedMonthIncomeUpdated&&<p>Income updated {monthLabel(month)}.</p>}
   <p>{`Budget edits apply: ${editScopeLabel}. Later saved budgets stay unchanged.`}</p>
   <div className="budget-month-actions"><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setInfoDialog(null);openIncome()}}>Edit income</button><button type="button" className="secondary-button" onClick={()=>{optionsHandoff.current=true;setInfoDialog(null);setManagement(true)}}>Manage accounts, pots &amp; categories</button>{resolved.hasExplicitBudget&&<button type="button" className="text-button budget-remove-action" onClick={()=>{removeDate();setInfoDialog(null)}}>Remove budget date</button>}</div>
  </>:infoDialog==='plan'?<>
   <p>Budget balance is available income minus your planned budget.</p>
   <dl className="budget-info-metrics"><div><dt>Available income</dt><dd>{pounds(available)}</dd></div><div><dt>Planned budget</dt><dd>{pounds(total)}</dd></div></dl><p>{pounds(available)} available · {availableBasis}.</p>
   <p>Employment income determines proportional contributions. Additional income increases available money without changing those proportions.</p>
   <p>Amounts are shown in pounds and pence.</p>
  </>:<>
   <p>These are account funding requirements. Pot allocations are included in those totals, then moved within the account. Sources, automatic payments and payment status are not recorded.</p>
   <dl className="budget-info-metrics"><div><dt>Destination accounts</dt><dd>{transferAccounts.length}</dd></div></dl>
   <p>Amounts include exact pennies. Account totals include their allocations once; do not add the breakdown again.</p>
   {(instructions?.incomplete??matrixModel?.totals.incomplete??transfers.unresolvedItemIds.length>0)&&<p>Totals include calculated contributions only. Review incomplete allocations or missing pot responsibility before using the account instructions.</p>}
  </>}
 </BudgetInfoDialog>}
 {mobilePresentation&&mobileBudgetView==='transfers'&&selectedAccount&&selectedBudgetAccount&&<MobileTransferDetail instructionAccount={instructions?.accounts.find(row=>row.accountId===selectedAccount.accountId)} account={selectedAccount} document={document} month={monthLabel(month)} owner={accountOwnerLabel(selectedBudgetAccount,adults)} label={mobileAccountLabels.get(selectedAccount.accountId)??'Account'} people={accountPeople(selectedAccount)} returnFocusRef={detailTrigger} onClose={closeTransferAccount} affectedAccount={affectedTransfers?.accounts.find(row=>row.accountId===selectedAccount.accountId)}/>} 
 {editor&&<BudgetItemEditor document={document} month={month} item={editingItem} onSave={saveBatch} onClose={()=>setEditor(false)}/>}
 {incomeOpen&&<div className="budget-v3-overlay"><form className="budget-v3-panel" onSubmit={saveIncome}><h2>Income for {monthLabel(month)}</h2><p className="budget-income-intro">Income changes don’t create a budget <span className="budget-nowrap">date. <button type="button" className="budget-v3-info" aria-label="About income changes" aria-expanded={incomeHelp} onClick={()=>setIncomeHelp(v=>!v)}>ⓘ</button></span></p>{incomeHelp&&<p className="budget-edit-scope">Employment income sets proportional shares; additional income affects available money only. £0 stops a source for its affected months. Later recorded income changes stay unchanged.</p>}{sharedIncomeScope&&<p id="income-scope-shared" className="budget-edit-scope">Changes apply: {sharedIncomeScope}.</p>}{incomes.map(source=><div className="budget-income-source" key={source.id}><label>{adults.find(a=>a.id===source.personId)?.name} — {source.name} · {source.type==='employment'?'Employment':'Additional'}<span className="budget-money-field"><input aria-describedby={sharedIncomeScope?'income-scope-shared':`income-scope-${source.id}`} inputMode="decimal" value={incomeDraft[source.id]??(source.amountPence/100).toFixed(2)} onChange={e=>setIncomeDraft(x=>({...x,[source.id]:e.target.value}))}/></span></label>{!sharedIncomeScope&&<p id={`income-scope-${source.id}`} className="budget-edit-scope">Changes apply: {formatEditScope(incomeEditScope(source,month))}.</p>}</div>)}<fieldset><legend>Add recurring income source</legend><p className="budget-edit-scope">New income applies: {formatEditScope({fromMonth:month,throughMonth:null})}.</p><label>Person<select value={newIncomePerson} onChange={e=>setNewIncomePerson(e.target.value)}>{adults.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Source name<input value={newIncomeName} onChange={e=>setNewIncomeName(e.target.value)} placeholder="Parents"/></label><label>Classification<select value={newIncomeType} onChange={e=>setNewIncomeType(e.target.value as 'employment'|'additional')}><option value="employment">Employment income</option><option value="additional">Additional income</option></select></label><label>Monthly amount<span className="budget-money-field"><input inputMode="decimal" value={newIncomeAmount} onChange={e=>setNewIncomeAmount(e.target.value)}/></span></label></fieldset><div className="budget-v3-actions"><button type="button" className="secondary-button" onClick={()=>setIncomeOpen(false)}>Cancel</button><button className="primary-button">Save income</button></div></form></div>}
 {management&&<BudgetManagement document={document} setDocument={setDocument} onClose={()=>setManagement(false)}/>}
 </>
}
