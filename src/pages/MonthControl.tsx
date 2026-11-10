import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonth } from '../formatting/month'

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const shift = (month: string, by: number) => { const [y,m] = month.split('-').map(Number); const d = new Date(y!,m!-1+by,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

/**
 * Previous / next month, and a 4 × 3 year grid marking the chosen month, this month, and months where the budget (dot) or income (ring) changed.
 * When the month has its own budget, the picker's footer offers going back to the one before. A scrim behind the picker closes it.
 */
export function MonthControl({month,onChange,budgetMarkers,incomeMarkers,revertLabel,onRevert}:{month:string;onChange:(value:string)=>void;budgetMarkers:string[];incomeMarkers:string[];revertLabel?:string;onRevert?:()=>void}) {
 const [open,setOpen]=useState(false), [year,setYear]=useState(Number(month.slice(0,4)))
 return <div className="budget-v3-month">
  <button type="button" aria-label="Previous month" onClick={()=>onChange(shift(month,-1))}><ChevronLeft aria-hidden="true"/></button>
  <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setYear(Number(month.slice(0,4)));setOpen(!open)}}>{formatMonth(month)}<ChevronDown className="budget-v3-month-caret" aria-hidden="true"/></button>
  <button type="button" aria-label="Next month" onClick={()=>onChange(shift(month,1))}><ChevronRight aria-hidden="true"/></button>
  {/* A pointer convenience only (keyboard users have Escape and the month button), so not a button: it must not count among the month buttons the layout styles. */}
  {open&&<div className="budget-v3-picker-scrim" aria-hidden="true" onClick={()=>setOpen(false)}/>}
  {open&&<div className="budget-v3-picker" role="dialog" aria-label="Choose budget month" onKeyDown={event=>{if(event.key==='Escape')setOpen(false)}}>
   <header><button type="button" aria-label="Previous year" onClick={()=>setYear(year-1)}><ChevronLeft aria-hidden="true"/></button><span>{year}</span><button type="button" aria-label="Next year" onClick={()=>setYear(year+1)}><ChevronRight aria-hidden="true"/></button></header>
   <div>{monthNames.map((name,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`;const b=budgetMarkers.includes(key),inc=incomeMarkers.includes(key),selected=key===month,today=key===thisMonth();return <button type="button" key={key} className={[selected&&'is-selected',today&&'is-today'].filter(Boolean).join(' ')||undefined} aria-current={selected?'true':undefined} aria-label={`${name} ${year}${today?', this month':''}${b?', budget updated':''}${inc?', income updated':''}`} onClick={()=>{onChange(key);setOpen(false)}}>{name.slice(0,3)}<small aria-hidden="true">{b&&<span className="budget-v3-marker is-budget"/>}{inc&&<span className="budget-v3-marker is-income"/>}</small></button>})}</div>
   <p><span><span className="budget-v3-marker is-budget" aria-hidden="true"/>Budget updated</span><span><span className="budget-v3-marker is-income" aria-hidden="true"/>Income updated</span></p>
   {revertLabel&&onRevert&&<button type="button" className="text-button budget-v3-picker-revert" onClick={()=>{setOpen(false);onRevert()}}>{revertLabel}</button>}
  </div>}
 </div>
}
