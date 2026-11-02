import { Fragment, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { budgetTransfers } from '../domain/budgetTransfers'
import { budgetDateMarkers, incomeDateMarkers, resolveBudget, resolveIncomeSources, updateBudgetAtMonth, updateIncomeAtMonth, type BudgetItem } from '../domain/monthlyBudget'
import { PageFrame } from '../components/PageFrame'
import { BudgetManagement } from './BudgetManagement'
import { BudgetItemEditor } from './BudgetItemEditor'
import { commitItemBatch, type BudgetItemBatch } from '../domain/budgetItemDrafts'
import { accountTypeLabel } from '../domain/accountTypes'
import { accountOptionLabels } from './budgetLabels'
import { formatGBPSummary } from '../formatting/money'

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; saveStatus?: string; accountBacked?: boolean }
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthLabel = (month: string) => { const [y,m] = month.split('-').map(Number); return `${monthNames[m!-1]} ${y}` }
const shift = (month: string, by: number) => { const [y,m] = month.split('-').map(Number); const d = new Date(y!,m!-1+by,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
const pounds = (pence: number) => formatGBPSummary(pence / 100)
const id = () => crypto.randomUUID()

function MonthControl({month,onChange,budgetMarkers,incomeMarkers}:{month:string;onChange:(value:string)=>void;budgetMarkers:string[];incomeMarkers:string[]}) {
 const [open,setOpen]=useState(false), [year,setYear]=useState(Number(month.slice(0,4)))
 return <div className="budget-v3-month"><button type="button" aria-label="Previous month" onClick={()=>onChange(shift(month,-1))}>‹</button><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setYear(Number(month.slice(0,4)));setOpen(!open)}}>{monthLabel(month)}</button><button type="button" aria-label="Next month" onClick={()=>onChange(shift(month,1))}>›</button>{open&&<div className="budget-v3-picker" role="dialog" aria-label="Choose budget month"><header><button type="button" onClick={()=>setYear(year-1)}>‹</button>{year}<button type="button" onClick={()=>setYear(year+1)}>›</button></header><div>{monthNames.map((name,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`;const b=budgetMarkers.includes(key),inc=incomeMarkers.includes(key);return <button type="button" key={key} aria-label={`${name} ${year}${b?', budget updated':''}${inc?', income updated':''}`} onClick={()=>{onChange(key);setOpen(false)}}>{name.slice(0,3)}{(b||inc)&&<small aria-hidden="true">{b?'●':''}{inc?'•':''}</small>}</button>})}</div><p>● Budget updated · • Income updated</p></div>}</div>
}

export function MonthlyBudget({document,setDocument,saveStatus}:Props) {
 const [month,setMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})
 const [query,setQuery]=useState(''),[editor,setEditor]=useState(false),[editingItem,setEditingItem]=useState<BudgetItem>(),[management,setManagement]=useState(false),[incomeOpen,setIncomeOpen]=useState(false)
 const [batchMessage,setBatchMessage]=useState('')
 const [ownerFilter,setOwnerFilter]=useState('All')
 const [collapsed,setCollapsed]=useState<Record<string,boolean>>({})
 const [summaryOpen,setSummaryOpen]=useState(false)
 const summaryTrigger=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(!summaryOpen)return;const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSummaryOpen(false);summaryTrigger.current?.focus()}};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown)},[summaryOpen])
 const [incomeDraft,setIncomeDraft]=useState<Record<string,string>>({})
 const [newIncomeName,setNewIncomeName]=useState(''),[newIncomePerson,setNewIncomePerson]=useState(document.household.adults[0]?.id??''),[newIncomeType,setNewIncomeType]=useState<'employment'|'additional'>('employment'),[newIncomeAmount,setNewIncomeAmount]=useState('')
 const [inlineId,setInlineId]=useState<string|null>(null),[inlineValue,setInlineValue]=useState(''),[formError,setFormError]=useState('')
 const resolved=resolveBudget(document.budget,month), items=resolved.items, adults=document.household.adults
 const incomes=resolveIncomeSources(document.budget,month), transfers=budgetTransfers(document.budget,adults.map(p=>p.id),month,items)
 const categories=document.budget.categories
 const accountLabels=accountOptionLabels(document.budget.accounts,adults)
 const accountFor=(item:BudgetItem)=>{const destination=item.destination;if(destination.kind==='account')return document.budget.accounts.find(a=>a.id===destination.accountId);const potId=destination.potId;return document.budget.accounts.find(a=>a.id===document.budget.pots.find(p=>p.id===potId)?.accountId)}
 const ownerGroup=(item:BudgetItem)=>{const a=accountFor(item);if(!a)return 'Needs owner';if(a.ownerPersonIds.length>1)return 'Joint';if(!a.ownerPersonIds.length)return 'Needs owner';return adults.find(p=>p.id===a.ownerPersonIds[0])?.name??'Needs owner'}
 const searchMatch=(item:BudgetItem)=>{if(!query.trim())return true;const c=categories.find(x=>x.id===item.categoryId)?.name??'',a=accountFor(item),destination=item.destination,p=destination.kind==='pot'?document.budget.pots.find(x=>x.id===destination.potId)?.name??'':'';const owner=ownerGroup(item);return [item.name,c,a?.name,a?.provider,accountTypeLabel(a?.accountTypeId),p,owner].some(v=>v?.toLocaleLowerCase().includes(query.toLocaleLowerCase()))}
 const rowsByOwner=new Map<string,Map<string,BudgetItem[]>>();for(const item of items.filter(searchMatch)){const owner=ownerGroup(item),cat=categories.find(c=>c.id===item.categoryId)?.name??'Uncategorised';const cats=rowsByOwner.get(owner)??new Map<string,BudgetItem[]>();cats.set(cat,[...(cats.get(cat)??[]),item]);rowsByOwner.set(owner,cats)}const grouped=[...rowsByOwner]
 const total=items.reduce((sum,item)=>sum+item.amountPence,0)
 const start=(item?:BudgetItem)=>{setFormError('');setEditingItem(item);setEditor(true)}
 const saveBatch=(batch:BudgetItemBatch)=>{
  const result=commitItemBatch(document,month,batch)
  if('error' in result)return result.error
  setDocument(current=>{const latest=commitItemBatch(current,month,batch);return 'error' in latest?current:latest.document})
  setBatchMessage(batch.editingId?'Budget item updated.':`Created ${result.items.length} budget ${result.items.length===1?'item':'items'}.`)
  setEditor(false)
 }
 const removeItem=(item:BudgetItem)=>{if(window.confirm(`Remove “${item.name}” from the ${monthLabel(month)} budget?`))setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.filter(i=>i.id!==item.id))}))}
 const commitInline=(item:BudgetItem)=>{if(inlineId!==item.id)return;const raw=inlineValue.trim();if(!/^\d+(\.\d{1,2})?$/.test(raw)){setFormError('Enter a valid monthly amount.');return}const cents=Math.round(Number(raw)*100);setDocument(current=>({...current,budget:updateBudgetAtMonth(current.budget,month,old=>old.map(row=>row.id===item.id?{...row,entryAmountPence:cents,amountPence:cents}:row))}));setInlineId(null);setFormError('')}
 const removeDate=()=>{if(window.confirm(`Remove the ${monthLabel(month)} budget date? This month will inherit the previous budget until the next saved budget date.`))setDocument(current=>{const snapshots={...current.budget.snapshots};delete snapshots[month];return {...current,budget:{...current.budget,snapshots}}})}
 const destinationLabel=(item:BudgetItem)=>{const a=accountFor(item),destination=item.destination;return destination.kind==='pot'?`${document.budget.pots.find(p=>p.id===destination.potId)?.name??'Pot'} · ${a?accountLabels.get(a.id):'Account'}`:a?accountLabels.get(a.id)??'Account':'Account'}
 const incomeTotal=incomes.filter(x=>x.type==='employment').reduce((s,x)=>s+x.amountPence,0),available=transfers.availablePence
 const saveIncome=(e:FormEvent)=>{e.preventDefault();setDocument(current=>{let budget=current.budget;for(const source of budget.incomeSources){if(incomeDraft[source.id]!==undefined)budget=updateIncomeAtMonth(budget,month,source.id,Math.max(0,Math.round(Number(incomeDraft[source.id])*100)))}if(newIncomeName.trim()&&newIncomePerson)budget={...budget,incomeSources:[...budget.incomeSources,{id:id(),personId:newIncomePerson,name:newIncomeName.trim(),type:newIncomeType,baseAmountPence:Math.max(0,Math.round(Number(newIncomeAmount||0)*100)),baseEffectiveFrom:month,changes:{}}]};return {...current,budget}});setIncomeOpen(false);setNewIncomeName('');setNewIncomeAmount('')}
 const ownerOrder=['Joint',...adults.map(p=>p.name),'Needs owner']
 const visibleGrouped=ownerFilter==='All'?grouped:grouped.filter(([owner])=>owner===ownerFilter)
 const visibleOwners=ownerOrder.flatMap(owner=>{const cats=visibleGrouped.find(([label])=>label===owner)?.[1];if(!cats)return [];const ownerItems=[...cats.values()].flat();const key=`owner:${owner}`;return [{name:owner,key,items:ownerItems,collapsed:!!collapsed[key]&&!query,categories:[...cats].map(([name,items])=>{const key=`${owner}:${name}`;return {name,key,items,collapsed:!!collapsed[key]&&!query}})}]})
 const tableWrap=useRef<HTMLDivElement>(null), searchRef=useRef<HTMLInputElement>(null)
 const [context,setContext]=useState<{owner:string|null;category:string|null}>({owner:null,category:null})
 const focusedGroup=useRef<{key:string;sticky:boolean}|null>(null)
 useLayoutEffect(()=>{
  const wrap=tableWrap.current;if(!wrap){setContext(previous=>previous.owner||previous.category?{owner:null,category:null}:previous);return}
  let frame=0
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const rect=wrap.getBoundingClientRect(), bounded=getComputedStyle(wrap).overflowY!=='visible'&&getComputedStyle(wrap).overflowY!=='clip'
   const nav=window.document.querySelector<HTMLElement>('.mobile-nav-bar')
   const viewportTop=!bounded&&nav&&getComputedStyle(nav).display!=='none'?Math.max(0,nav.getBoundingClientRect().bottom):0
   const top=bounded?rect.top:viewportTop, bottom=bounded?rect.bottom:window.innerHeight
   wrap.style.setProperty('--budget-viewport-top',`${viewportTop}px`)
   wrap.style.setProperty('--budget-wrap-left',`${Math.max(0,rect.left)}px`);wrap.style.setProperty('--budget-wrap-width',`${Math.min(rect.width,(window.visualViewport?.width??window.innerWidth)-Math.max(0,rect.left))}px`)
   wrap.dataset.pageScroll=bounded?'false':'true'
   const header=wrap.querySelector('thead') as HTMLElement|null
   const headerHeight=header&&getComputedStyle(header).display!=='none'&&bounded?header.getBoundingClientRect().height:0
   wrap.style.setProperty('--budget-header-height',`${headerHeight}px`)
   let owner:string|null=null,category:string|null=null
   if(rect.bottom>top&&rect.top<bottom){
    const ownerLine=top+headerHeight
    const rows=Array.from(wrap.querySelectorAll<HTMLElement>('[data-budget-group]'))
    for(const row of rows){if(row.dataset.budgetGroup==='owner'&&row.getBoundingClientRect().top<=ownerLine+0.5)owner=row.dataset.groupKey??null}
    if(owner){const ownerRow=rows.find(row=>row.dataset.groupKey===owner);const ownerHeight=ownerRow?.getBoundingClientRect().height||32;wrap.style.setProperty('--budget-owner-row-height',`${ownerHeight}px`);const categoryLine=ownerLine+ownerHeight
     for(const row of rows){if(row.dataset.budgetGroup==='category'&&row.dataset.ownerKey===owner&&row.getBoundingClientRect().top<=categoryLine+0.5&&ownerRow)category=row.dataset.groupKey??null}
     if(!category)category=rows.find(row=>row.dataset.budgetGroup==='category'&&row.dataset.ownerKey===owner)?.dataset.groupKey??null
     const categoryRow=rows.find(row=>row.dataset.budgetGroup==='category'&&row.dataset.groupKey===category);wrap.style.setProperty('--budget-category-row-height',`${categoryRow?.getBoundingClientRect().height||32}px`)
    }
   }
   setContext(previous=>previous.owner===owner&&previous.category===category?previous:{owner,category})
  })}
  update();wrap.addEventListener('scroll',update,{passive:true});window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update)
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);observer?.observe(wrap);const table=wrap.querySelector('table');if(table)observer?.observe(table)
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();wrap.removeEventListener('scroll',update);window.removeEventListener('scroll',update);window.removeEventListener('resize',update)}
 },[month,query,ownerFilter,collapsed,document])
 useLayoutEffect(()=>{
  const focus=focusedGroup.current;if(!focus)return
  const wrap=tableWrap.current;const active=context.owner===focus.key||context.category===focus.key
  const candidates=wrap?Array.from(wrap.querySelectorAll<HTMLButtonElement>('[data-group-control]')):[]
  let target=candidates.find(button=>button.dataset.groupControl===focus.key&&Boolean(button.dataset.sticky)===active)
  if(!target){const parent=visibleOwners.find(owner=>owner.categories.some(category=>category.key===focus.key));target=candidates.find(button=>button.dataset.groupControl===parent?.key&&Boolean(button.dataset.sticky)===(context.owner===parent?.key))}
  if(!target){searchRef.current?.focus({preventScroll:true});focusedGroup.current=null;return}
  if(window.document.activeElement!==target){target.focus({preventScroll:true});focusedGroup.current={key:target.dataset.groupControl!,sticky:!!target.dataset.sticky}}
 })
 const groupLabel=(group:{items:BudgetItem[]})=>`${group.items.length} items · ${query?'Matching total ':''}${pounds(group.items.reduce((sum,item)=>sum+item.amountPence,0))}`
 const stickyOwner=visibleOwners.find(owner=>owner.key===context.owner),stickyCategory=stickyOwner?.categories.find(category=>category.key===context.category)
 const groupButton=(group:{name:string;key:string;items:BudgetItem[];collapsed:boolean},sticky=false)=>{const hidden=!sticky&&(context.owner===group.key||context.category===group.key);return <button type="button" data-group-control={group.key} data-sticky={sticky?'true':undefined} tabIndex={hidden?-1:undefined} aria-hidden={hidden||undefined} aria-label={`${group.name}, ${groupLabel(group)}`} aria-expanded={!group.collapsed} onFocus={()=>{focusedGroup.current={key:group.key,sticky}}} onBlur={e=>{if(!e.currentTarget.parentElement?.contains(e.relatedTarget as Node))focusedGroup.current=null}} onClick={()=>setCollapsed(value=>({...value,[group.key]:!value[group.key]}))}>{group.name}<span>{groupLabel(group)}</span></button>}
 const budgetHeader=<><div className="budget-v3-toolbar"><MonthControl month={month} onChange={setMonth} budgetMarkers={budgetDateMarkers(document.budget)} incomeMarkers={incomeDateMarkers(document.budget)}/><div className="budget-v3-tools"><button className="primary-button" onClick={()=>start()}>Add budget item</button><button className="secondary-button" onClick={()=>setIncomeOpen(true)}>Income</button><button className="secondary-button" onClick={()=>setManagement(true)}>Manage</button><button ref={summaryTrigger} className="secondary-button budget-v3-summary-trigger" onClick={()=>setSummaryOpen(true)}>People &amp; transfers</button></div></div></>
 return <PageFrame title="Budget your month" description="Plan the items you want to fund and where the money goes." className="monthly-budget-page" contentWidth="wide" pageControls={budgetHeader} summary={<div className="budget-v3-summary"><span><small>Available this month</small><strong>{pounds(available)}</strong></span><span><small>Planned budget</small><strong>{pounds(total)}</strong></span><span className={available-total<0?'is-deficit':''}><small>Budget balance</small><strong>{available-total<0?`${pounds(total-available)} over budget`:`${pounds(available-total)} remaining`}</strong></span><span><small>Employment split basis <button type="button" className="budget-v3-info" aria-label="About employment split basis" title="Employment income used to calculate proportional contributions">ⓘ</button></small><strong>{pounds(incomeTotal)}</strong></span></div>}>
 <section className="budget-v3-workspace" aria-label="Budget planning"><div className="budget-v3-scroll-tools">
 <p className="budget-v3-date-note">{resolved.hasExplicitBudget?`Budget set for ${monthLabel(resolved.sourceMonth!)}`:resolved.sourceMonth?`Using budget from ${monthLabel(resolved.sourceMonth)}`:resolved.importedBaseline?'Using imported legacy budget':'No budget is set for this month'}{resolved.nextBudgetMonth?` · Edits apply through ${monthLabel(resolved.nextBudgetMonth)}`:''}{incomeDateMarkers(document.budget).includes(month)?` · Income updated ${monthLabel(month)}`:''}</p>{!resolved.hasExplicitBudget&&resolved.sourceMonth&&<p className="budget-v3-inherited">Using budget from {monthLabel(resolved.sourceMonth)}</p>}
 <div className="budget-v3-controls"><label className="budget-v3-search">Search items, categories, owners, accounts or pots<input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search budget"/></label><label className="budget-v3-owner-filter">Owner<select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)}><option>All</option>{ownerOrder.filter(owner=>owner!=='Needs owner').map(owner=><option key={owner}>{owner}</option>)}{ownerOrder.includes('Needs owner')&&<option>Needs owner</option>}</select></label></div>
 </div>
 {!items.length?<div className="budget-v3-empty"><p>{resolved.hasExplicitBudget?'This budget date has no items yet.':'There is no budget for this month yet.'}</p><button className="primary-button" onClick={()=>start()}>Add budget item</button></div>:!visibleGrouped.length?<p className="budget-v3-empty">No items match “{query}”.</p>:<div className="budget-v3-table-wrap" ref={tableWrap}><div className="budget-v3-sticky-anchor"><div className="budget-v3-sticky-context">{stickyOwner&&<div className="budget-v3-sticky-owner">{groupButton(stickyOwner,true)}</div>}{stickyCategory&&<div className="budget-v3-sticky-category">{groupButton(stickyCategory,true)}</div>}</div></div><table className="budget-v3-table"><thead><tr><th>Item</th><th>Monthly amount</th><th>Funding</th><th>Destination</th><th>Actions</th></tr></thead><tbody>{visibleOwners.map(owner=>{return <Fragment key={owner.key}><tr className="budget-v3-owner" data-budget-group="owner" data-group-key={owner.key}><th colSpan={5}>{groupButton(owner)}</th></tr>{!owner.collapsed&&owner.categories.map(category=>{const rows=category.items;return <Fragment key={category.key}><tr className="budget-v3-category" data-budget-group="category" data-group-key={category.key} data-owner-key={owner.key}><th colSpan={5}>{groupButton(category)}</th></tr>{!category.collapsed&&rows.map(item=><tr className="budget-v3-item" key={item.id}><td data-label="Item"><strong>{item.name}</strong></td><td data-label="Monthly amount">{inlineId===item.id?<input aria-label={`Monthly amount for ${item.name}`} className="budget-v3-inline-amount" autoFocus inputMode="decimal" value={inlineValue} onChange={e=>setInlineValue(e.target.value)} onBlur={()=>commitInline(item)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitInline(item)}if(e.key==='Escape'){e.preventDefault();setInlineId(null)}}}/>:<button className="budget-v3-amount" aria-label={`Edit amount for ${item.name}`} onClick={()=>{if(item.frequency==='monthly'&&item.funding==='proportional'){setInlineId(item.id);setInlineValue((item.amountPence/100).toFixed(2))}else start(item)}}>{pounds(item.amountPence)}</button>}</td><td data-label="Funding">{item.funding==='fixed'?'Fixed contributions':item.funding==='proportional'?'Income ratio':item.funding==='equal'?'Equal split':item.funding==='single'?`One person · ${adults.find(a=>a.id===item.singleFunderId)?.name??'Person'}`:'Custom split'}</td><td data-label="Destination">{destinationLabel(item)}</td><td data-label="Actions"><button className="text-button" onClick={()=>start(item)}>Edit</button><details className="budget-v3-row-menu"><summary aria-label={`More actions for ${item.name}`}>More</summary><button type="button" onClick={()=>removeItem(item)}>Remove</button></details></td></tr>)}</Fragment>})}</Fragment>})}</tbody></table></div>}
 {resolved.hasExplicitBudget&&<button className="text-button budget-v3-remove-date" onClick={removeDate}>Remove budget date</button>}
 <div className="budget-v3-overlay" hidden={!summaryOpen} onMouseDown={e=>{if(e.target===e.currentTarget){setSummaryOpen(false);summaryTrigger.current?.focus()}}}><section className="budget-v3-panel budget-v3-summary-panel" role="dialog" aria-modal="true" aria-label="People and transfers"><header><h2>People &amp; transfers</h2><button type="button" autoFocus={summaryOpen} className="text-button" onClick={()=>{setSummaryOpen(false);summaryTrigger.current?.focus()}}>Close</button></header><section className="budget-v3-transfers"><h2>Money by person</h2><div className="budget-v3-person-grid">{transfers.people.map(person=>{const p=adults.find(a=>a.id===person.personId)!;return <article key={person.personId}><h3>{p?.name??'Person'}</h3><p>Employment income <strong>{pounds(person.employmentPence)}</strong></p><p>Additional income <strong>{pounds(person.additionalPence)}</strong></p><p>Planned contributions <strong>{pounds(person.plannedPence)}</strong></p><p>Remaining <strong>{pounds(person.remainingPence)}</strong></p></article>})}</div>{transfers.unresolvedItemIds.length>0&&<p role="status">Needs funding: {items.filter(i=>transfers.unresolvedItemIds.includes(i.id)).map(i=>i.name).join(', ')}. Add employment income to calculate the income ratio.</p>}<h3>Transfers by destination account</h3><ul>{transfers.accounts.map(row=><li key={row.accountId}>{accountLabels.get(row.accountId)??'Account'} — {pounds(row.amountPence)}{row.pots.map(p=><span key={p.potId}> · {document.budget.pots.find(x=>x.id===p.potId)?.name}: {pounds(p.amountPence)}</span>)}</li>)}</ul></section></section></div>
 <div className="budget-v3-save-status" role="status">{batchMessage}{batchMessage&&saveStatus?' · ':''}{saveStatus}</div>{formError&&<p role="alert">{formError}</p>}</section>
 {editor&&<BudgetItemEditor document={document} month={month} item={editingItem} onSave={saveBatch} onClose={()=>setEditor(false)}/>}
 {incomeOpen&&<div className="budget-v3-overlay"><form className="budget-v3-panel" onSubmit={saveIncome}><h2>Income for {monthLabel(month)}</h2><p>Income changes are independent of budget dates. Employment income sets proportional shares; additional income affects available money only. £0 stops a source from this month.</p>{incomes.map(source=><label key={source.id}>{adults.find(a=>a.id===source.personId)?.name} · {source.name} ({source.type})<input inputMode="decimal" value={incomeDraft[source.id]??(source.amountPence/100).toFixed(2)} onChange={e=>setIncomeDraft(x=>({...x,[source.id]:e.target.value}))}/></label>)}<fieldset><legend>Add recurring income source</legend><label>Person<select value={newIncomePerson} onChange={e=>setNewIncomePerson(e.target.value)}>{adults.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Source name<input value={newIncomeName} onChange={e=>setNewIncomeName(e.target.value)} placeholder="Parents"/></label><label>Classification<select value={newIncomeType} onChange={e=>setNewIncomeType(e.target.value as 'employment'|'additional')}><option value="employment">Employment income</option><option value="additional">Additional income</option></select></label><label>Monthly amount<input inputMode="decimal" value={newIncomeAmount} onChange={e=>setNewIncomeAmount(e.target.value)}/></label></fieldset><div className="budget-v3-actions"><button type="button" className="secondary-button" onClick={()=>setIncomeOpen(false)}>Cancel</button><button className="primary-button">Save income</button></div></form></div>}
 {management&&<BudgetManagement document={document} setDocument={setDocument} onClose={()=>setManagement(false)}/>}
 </PageFrame>
}
