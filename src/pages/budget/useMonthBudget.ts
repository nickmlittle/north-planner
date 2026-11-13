import { useMemo } from 'react'
import type { BudgetDocument } from '../../domain/budgetDocument'
import { budgetTransfers } from '../../domain/budgetTransfers'
import { buildTransferInstructions, type TransferInstructions } from '../../domain/transferInstructions'
import { budgetEditScope, resolveBudget, resolveIncomeSources } from '../../domain/monthlyBudget'
import { orderTransferAccounts, personTransferPlans } from '../../domain/personTransfers'
import { accountOptionLabels, shortAccountLabels } from '../budgetLabels'
import { planItemLabels, planOwnerOrder } from '../planRows'
import { formatEditScope, formatMonth as monthLabel } from '../../formatting/month'
import { formatGBP } from '../../formatting/money'

const pounds = (pence: number) => formatGBP(pence / 100)

/** Everything Plan and Transfers both read from the document for one month. Pure: no state. */
export function monthBudget(document: BudgetDocument, month: string) {
 const resolved=resolveBudget(document.budget,month), items=resolved.items, adults=document.household.adults
 const editScopeLabel=formatEditScope(budgetEditScope(document.budget,month))
 const incomes=resolveIncomeSources(document.budget,month), transfers=budgetTransfers(document.budget,adults.map(p=>p.id),month,items)
 let instructions:TransferInstructions|undefined
 try{instructions=buildTransferInstructions(document,month)}catch{/* Keep the comparison view available; unavailable instructions are labelled below. */}
 const unfundedItems=items.filter(item=>transfers.unresolvedItemIds.includes(item.id))
 const accountLabels=accountOptionLabels(document.budget.accounts,adults)
 // One short account name wherever a destination is shown; the long labels only order Transfers.
 const shortLabels=shortAccountLabels(document.budget.accounts,adults)
 const labels=planItemLabels(document,shortLabels)
 const total=items.reduce((sum,item)=>sum+item.amountPence,0)
 const transferAccounts=orderTransferAccounts(transfers.accounts,instructions,document.budget.accounts,adults.map(person=>person.id),accountLabels)
 const personPlans=personTransferPlans(transferAccounts,instructions,adults.map(person=>person.id))
 const snapshotsWithoutMonth=()=>{const snapshots={...document.budget.snapshots};delete snapshots[month];return snapshots}
 const previousBudget=resolved.hasExplicitBudget?resolveBudget({...document.budget,snapshots:snapshotsWithoutMonth()},month):null
 const revertLabel=!previousBudget?undefined:previousBudget.sourceMonth?`Go back to the ${monthLabel(previousBudget.sourceMonth)} budget`:previousBudget.importedBaseline?'Go back to the imported budget':`Clear the ${monthLabel(month)} budget`
 const revertReplacement=!previousBudget?undefined:previousBudget.sourceMonth?`the budget from ${monthLabel(previousBudget.sourceMonth)}`:previousBudget.importedBaseline?'the imported legacy budget':'no budget'
 const incomeTotal=incomes.filter(x=>x.type==='employment').reduce((s,x)=>s+x.amountPence,0),available=transfers.availablePence
 // Where Available comes from, only when it isn't simply salary: "£6,000.00 salary + £500.00 other".
 const basisDetail=available===0?'no income yet':incomeTotal===0?'none from salary':incomeTotal===available?'':`${pounds(incomeTotal)} salary + ${pounds(available-incomeTotal)} other`
 const ownerOrder=planOwnerOrder(adults)
 const meterPeople=transfers.people.map(row=>({personId:row.personId,name:adults.find(person=>person.id===row.personId)?.name??'Person',availablePence:row.availablePence,plannedPence:row.plannedPence}))
 // Only a carried-over budget needs a note: the month button already names the month, and the picker marks budget and income changes.
 const carriedOverNote=resolved.hasExplicitBudget?null:resolved.sourceMonth?`Carried over from ${resolved.sourceMonth.slice(0,4)===month.slice(0,4)?monthLabel(resolved.sourceMonth).split(' ')[0]:monthLabel(resolved.sourceMonth)}`:resolved.importedBaseline?'Carried over from the imported budget':null
 return {resolved,items,adults,editScopeLabel,incomes,transfers,instructions,unfundedItems,shortLabels,labels,total,transferAccounts,personPlans,snapshotsWithoutMonth,revertLabel,revertReplacement,available,basisDetail,ownerOrder,meterPeople,carriedOverNote}
}

export type MonthBudget = ReturnType<typeof monthBudget>

/** monthBudget, worked out once per document and month. */
export function useMonthBudget(document: BudgetDocument, month: string) {
 return useMemo(()=>monthBudget(document,month),[document,month])
}
