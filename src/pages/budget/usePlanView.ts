import { useEffect, useState } from 'react'
import type { PlanDestination } from '../../state/navigation'
import { readOpenPlanGroups, readPlanGrouping, rememberOpenPlanGroups, rememberPlanGrouping } from '../../state/planGroups'
import { groupPlanItems, matchesPlanDestination, planGroupKey } from '../planRows'
import { usePlanSearch } from '../usePlanSearch'
import type { MonthBudget } from './useMonthBudget'

/**
 * How Plan is being browsed: search, owner and category filters, open groups and grouping.
 * It outlives PlanPage, so a trip to Month and back keeps them (they reset on reload),
 * and "Review Immy's items" can be set from Month or Home before Plan is on screen.
 */
export function usePlanView({ budget, month, view, planDestination, planItemId, reviewPersonId, mobilePresentation }: { budget: MonthBudget; month: string; view: 'plan' | 'month'; planDestination?: PlanDestination | null; planItemId?: string; reviewPersonId?: string; mobilePresentation: boolean }) {
 const {items,adults,labels,transferAccounts,ownerOrder}=budget
 const [ownerFilter,setOwnerFilter]=useState('All')
 const [openGroups,setOpenGroups]=useState(readOpenPlanGroups)
 const [grouping,setGrouping]=useState(readPlanGrouping)
 const chooseGrouping=(value:'category'|'destination')=>{rememberPlanGrouping(value);setGrouping(value)}
 useEffect(()=>rememberOpenPlanGroups(openGroups),[openGroups])
 const [categoryFilter,setCategoryFilter]=useState('All')
 const {query,updateSearch,captureBrowseScroll}=usePlanSearch({month,planDestination,mobilePresentation})
 const destinationItems=items.filter(item=>matchesPlanDestination(item,planDestination,labels))
 // "Review Immy's items": the Plan filtered to the accounts that person owns, with every group holding them open.
 const reviewPerson=(personId:string)=>{const name=adults.find(person=>person.id===personId)?.name;if(!name)return;setOwnerFilter(name);setCategoryFilter('All');if(query)updateSearch('');const {groups}=groupPlanItems(destinationItems,{query:'',owner:name,category:'All'},labels,grouping,transferAccounts.map(account=>account.accountId),ownerOrder);setOpenGroups(open=>({...open,...Object.fromEntries(groups.map(group=>[group.key,true]))}))}
 // Arriving from Home's "Review Immy's items": apply it once per visit.
 const [appliedReview,setAppliedReview]=useState<string|undefined>()
 if(reviewPersonId&&reviewPersonId!==appliedReview){setAppliedReview(reviewPersonId);reviewPerson(reviewPersonId)}
 // An item opened from Month may sit in a closed group: open it, and Plan's focus finds the row once it renders.
 const planItem=planItemId?items.find(row=>row.id===planItemId):undefined,planItemGroup=planItem&&planGroupKey(planItem,grouping,labels)
 const revealGroup=view==='plan'&&!planDestination?planItemGroup:undefined
 const [revealedGroup,setRevealedGroup]=useState<string|undefined>()
 if(revealGroup!==revealedGroup){setRevealedGroup(revealGroup);if(revealGroup&&!(openGroups[revealGroup]??!mobilePresentation))setOpenGroups({...openGroups,[revealGroup]:true})}
 // Desktop opens Plan's groups unless this session closed them; phones keep them closed (D4).
 const groupsOpenByDefault=!mobilePresentation
 return {query,updateSearch,captureBrowseScroll,ownerFilter,setOwnerFilter,categoryFilter,setCategoryFilter,openGroups,setOpenGroups,groupsOpenByDefault,grouping,chooseGrouping,destinationItems,reviewPerson}
}

export type PlanView = ReturnType<typeof usePlanView>
