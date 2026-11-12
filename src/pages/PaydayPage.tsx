import { useState, type Dispatch, type SetStateAction } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import type { BudgetImpact } from '../domain/budgetImpact'
import { personProgress, setStepTick } from '../domain/transferTicks'
import { PageFrameRegions } from '../components/PageFrame'
import { BudgetInfoDialog, MobileBudgetSummary, type TransferPersonChoice } from './MobileBudgetViews'
import { TransfersPanel } from './TransfersPanel'
import type { MonthBudget } from './budget/useMonthBudget'
import { readTransferPerson, rememberTransferPerson, resolveTransferPerson } from '../state/transferPerson'
import { formatMonth } from '../formatting/month'
import { formatGBP } from '../formatting/money'
import type { StepsReturn } from '../state/navigation'

const pounds = (pence: number) => formatGBP(pence / 100)

type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; budget: MonthBudget; mobilePresentation: boolean; affectedTransfers?: BudgetImpact | null; stepsReturn?: StepsReturn | null; onSeeItems?: (accountId: string) => void; onEditIncome: () => void; onReviewPerson: (personId: string) => void }

/** Transfers: whose payday it is, the steps to move money and tick them off, and funding by account. Rendered inside MonthlyBudget's frame. */
export function PaydayPage({document,setDocument,month,budget,mobilePresentation,affectedTransfers,stepsReturn,onSeeItems,onEditIncome,onReviewPerson}:Props) {
 const {items,adults,transfers,instructions,unfundedItems,shortLabels,transferAccounts,personPlans}=budget
 const [infoOpen,setInfoOpen]=useState(false)
 const [storedTransferPerson,setStoredTransferPerson]=useState(readTransferPerson)
 const transferPerson=resolveTransferPerson(storedTransferPerson,adults.map(person=>person.id))
 const chooseTransferPerson=(value:string)=>{rememberTransferPerson(value);setStoredTransferPerson(value)}
 const selectedPersonPlan=transferPerson&&transferPerson!=='both'?personPlans.people.find(plan=>plan.personId===transferPerson):undefined
 const transferPersonChoice:TransferPersonChoice={adults,selection:transferPerson,onSelect:chooseTransferPerson,plan:selectedPersonPlan&&{name:adults.find(person=>person.id===selectedPersonPlan.personId)?.name??'Person',fundingPence:selectedPersonPlan.fundingPence,fundCount:selectedPersonPlan.fundCount,moveCount:selectedPersonPlan.moveCount},reviewCount:personPlans.needsReview.length,progress:Object.fromEntries(personPlans.people.map(plan=>[plan.personId,personProgress(plan,document.ticks?.[month])])),monthName:formatMonth(month).split(' ')[0]}
 const tickStep=(key:string,amountPence:number|null)=>setDocument(current=>setStepTick(current,month,key,amountPence))
 // Someone shown on Transfers whose steps add up to more than they have available; the furthest over first.
 const overPerson=[...transfers.people].filter(row=>(transferPerson==='both'||!transferPerson||row.personId===transferPerson)&&row.plannedPence>row.availablePence).sort((a,b)=>(b.plannedPence-b.availablePence)-(a.plannedPence-a.availablePence))[0]
 const overName=overPerson&&(adults.find(person=>person.id===overPerson.personId)?.name??'Person')
 if(overPerson&&adults.length>1)transferPersonChoice.overBy={text:`${overName}’s steps add up to ${pounds(overPerson.plannedPence)}, which is ${pounds(overPerson.plannedPence-overPerson.availablePence)} more than ${overName}’s ${pounds(overPerson.availablePence)} available.`,onReview:()=>onReviewPerson(overPerson.personId)}
 return <>
 <PageFrameRegions summary={<MobileBudgetSummary allocated={transfers.accounts.reduce((sum,account)=>sum+account.amountPence,0)} hasItems={items.length>0} incomplete={!instructions||instructions.incomplete} onDetails={()=>setInfoOpen(true)} person={transferPersonChoice}/>}
  afterSummary={<TransfersPanel month={month} onTick={tickStep} onReviewPerson={onReviewPerson} document={document} transfers={transfers} accounts={transferAccounts} instructions={instructions} unfundedItems={unfundedItems} labels={shortLabels} plans={personPlans} personSelection={transferPerson} view="transfers" mobilePresentation={mobilePresentation} affectedTransfers={affectedTransfers} stepsReturn={stepsReturn} onSeeItems={onSeeItems} onEditIncome={onEditIncome}/>}/>
 {infoOpen&&<BudgetInfoDialog title="Transfers summary details" onClose={()=>setInfoOpen(false)}><p>Each account’s funding already includes its moves.</p></BudgetInfoDialog>}
 </>
}
