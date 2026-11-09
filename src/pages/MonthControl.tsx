import { useState } from 'react'
import { formatMonth } from '../formatting/month'

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const shift = (month: string, by: number) => { const [y,m] = month.split('-').map(Number); const d = new Date(y!,m!-1+by,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }

/** Previous / next month, and a year grid marking months where the budget or income changed. */
export function MonthControl({month,onChange,budgetMarkers,incomeMarkers}:{month:string;onChange:(value:string)=>void;budgetMarkers:string[];incomeMarkers:string[]}) {
 const [open,setOpen]=useState(false), [year,setYear]=useState(Number(month.slice(0,4)))
 return <div className="budget-v3-month"><button type="button" aria-label="Previous month" onClick={()=>onChange(shift(month,-1))}>‹</button><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setYear(Number(month.slice(0,4)));setOpen(!open)}}>{formatMonth(month)}</button><button type="button" aria-label="Next month" onClick={()=>onChange(shift(month,1))}>›</button>{open&&<div className="budget-v3-picker" role="dialog" aria-label="Choose budget month"><header><button type="button" onClick={()=>setYear(year-1)}>‹</button>{year}<button type="button" onClick={()=>setYear(year+1)}>›</button></header><div>{monthNames.map((name,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`;const b=budgetMarkers.includes(key),inc=incomeMarkers.includes(key);return <button type="button" key={key} aria-label={`${name} ${year}${b?', budget updated':''}${inc?', income updated':''}`} onClick={()=>{onChange(key);setOpen(false)}}>{name.slice(0,3)}{(b||inc)&&<small aria-hidden="true">{b?'●':''}{inc?'•':''}</small>}</button>})}</div><p>● Budget updated · • Income updated</p></div>}</div>
}
