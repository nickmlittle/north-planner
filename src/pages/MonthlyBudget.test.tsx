// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'
// Small fixtures still drive search and filters; the threshold has its own test.
vi.mock('./planListConfig', () => ({ PLAN_FILTER_MIN_ITEMS: 0 }))
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.sessionStorage.clear()})

/** Phones keep Owner and Category in the Filter sheet: open it, choose, close. */
function filterBy(label: 'Owner' | 'Category', value: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Filter/ }))
  const sheet = screen.getByRole('dialog', { name: 'Filter' })
  fireEvent.change(within(sheet).getByLabelText(label), { target: { value } })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
}
function filterValue(label: 'Owner' | 'Category') {
  fireEvent.click(screen.getByRole('button', { name: /^Filter/ }))
  const sheet = screen.getByRole('dialog', { name: 'Filter' })
  const value = (within(sheet).getByLabelText(label) as HTMLSelectElement).value
  fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
  return value
}
const desktop=()=>vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
/** Desktop has Expand all in the toolbar; phones keep it in the Filter sheet. */
const expandAll = () => { const direct = screen.queryByRole('button', { name: 'Expand all' }); if (direct) { fireEvent.click(direct); return } fireEvent.click(screen.getByRole('button', { name: /^Filter/ })); fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter' })).getByRole('button', { name: 'Expand all' })) }
/** Income, accounts, pots and categories are edited in Settings; the budget only asks to go there. */
const openSettings=vi.fn()
function Harness({ view }: { view?: 'plan' | 'month' } = {}){const [document,setDocument]=useState<BudgetDocument>(()=>{const d=newBudgetDocument();d.household={name:'Home',adults:[{id:'nick',name:'Nick'},{id:'immy',name:'Immy'}]};return d});return <MonthlyBudget document={document} setDocument={setDocument} view={view} onOpenSettings={openSettings}/>}
function createAccountInPicker(form: HTMLElement, owner='Nick', provider='Monzo', nickname='') {
  fireEvent.click(within(form).getByRole('button',{name:owner}))
  fireEvent.click(within(form).getByRole('button',{name:'+ Add account'}))
  fireEvent.change(within(form).getByLabelText('Account type'),{target:{value:'current-account'}})
  fireEvent.change(within(form).getByLabelText('Nickname (optional)'),{target:{value:nickname}})
  fireEvent.change(within(form).getByLabelText('Bank / provider'),{target:{value:provider}})
  fireEvent.click(within(form).getByRole('button',{name:'Continue'}))
}
function addItem(name='Apple TV',amount='8.99',nickname='',funding?:string) {
  fireEvent.click(screen.getAllByRole('button',{name:'Add item'})[0]!)
  const dialog=screen.getByRole('form',{name:'Add item'})
  fireEvent.change(within(dialog).getByLabelText('Item name'),{target:{value:name}})
  fireEvent.change(within(dialog).getByLabelText('Monthly amount'),{target:{value:amount}})
  fireEvent.change(within(dialog).getByLabelText('New category'),{target:{value:'Subscriptions'}})
  createAccountInPicker(dialog,'Nick','Monzo',nickname)
  fireEvent.click(within(dialog).getByRole('button',{name:'Use account directly'}))
  if(funding)fireEvent.change(within(dialog).getByLabelText('Funding type'),{target:{value:funding}})
  fireEvent.click(within(dialog).getByRole('button',{name:'Save item'}))
}
it('starts with no budget records and adds a categorized item with a staged account',()=>{render(<Harness/>);expect(screen.getByRole('heading',{name:'Start your plan'})).toBeVisible();addItem();expect(screen.getByText('Apple TV')).toBeVisible();expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Nick');expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Subscriptions');expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Monzo Nick')})
it('prompts for the first item, and for income only while there is none',()=>{
  render(<Harness/>)
  const prompt=document.querySelector<HTMLElement>('.budget-first-run')!
  expect(within(prompt).getByText('No income yet, so there’s nothing to split.')).toBeVisible()
  openSettings.mockClear()
  fireEvent.click(within(prompt).getByRole('button',{name:'Add income'}))
  expect(openSettings).toHaveBeenCalledWith('income')
  fireEvent.click(within(prompt).getByRole('button',{name:'Add your first budget item'}))
  expect(screen.getByRole('form',{name:'Add item'})).toBeVisible()
  cleanup()
  const withIncome=seededDocument()
  withIncome.budget.snapshots={}
  withIncome.budget.incomeSources=[{id:'pay',personId:'nick',name:'Pay',type:'employment',baseAmountPence:200000,changes:{}}]
  render(<SeededHarness initial={withIncome}/>)
  expect(screen.queryByRole('button',{name:'Add income'})).not.toBeInTheDocument()
})
it('keeps mobile Plan headings and funding context in a semantic two-column table, with no row menu',()=>{
  render(<Harness/>)
  addItem()
  const table=screen.getByRole('table',{name:'Budget items by category'})
  expect(within(table).getAllByRole('columnheader').map(header=>header.textContent)).toEqual(['Item','Amount'])
  expect(within(table).getByRole('rowheader',{name:/Apple TV/})).toHaveTextContent('Destination: Monzo Nick')
  expect(table.querySelector('.plan-group th')).toHaveAttribute('colspan','2')
  expect(screen.queryByLabelText('More actions for Apple TV')).not.toBeInTheDocument()
})
it('shows annual entry frequency and the monthly equivalent',()=>{render(<Harness/>);fireEvent.click(screen.getAllByRole('button',{name:'Add item'})[0]!);const dialog=screen.getByRole('form',{name:'Add item'});fireEvent.change(within(dialog).getByLabelText('Monthly amount'),{target:{value:'720'}});fireEvent.change(within(dialog).getByLabelText('Frequency'),{target:{value:'annually'}});expect(within(dialog).getByText(/Monthly equivalent:/)).toHaveTextContent('£60.00')})
it('searches destination details in flat results with owner and category context',()=>{render(<Harness/>);addItem();fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'Monzo'}});expect(screen.getByRole('button',{name:'Apple TV'})).toBeVisible();expect(document.querySelector('.budget-v3-result-context')).toHaveTextContent('Nick · Subscriptions');expect(screen.getByText('1 item · £8.99')).toBeVisible();expect(document.querySelector('.plan-group')).not.toBeInTheDocument()})
it('filters by owner and expands or collapses category groups',()=>{render(<Harness/>);addItem();expect(screen.getByText('Apple TV')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:/Subscriptions/}));expect(screen.queryByText('Apple TV')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Subscriptions/}));filterBy('Owner','Immy');expect(screen.queryByText('Apple TV')).not.toBeInTheDocument();expect(screen.getByText(/No items match/)).toBeVisible()})
it('starts groups closed and keeps the open ones across filters, months and remounts',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'hierarchy-item',name:'Groceries',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'}]}
  const {unmount}=render(<SeededHarness initial={initial}/>)
  const category=screen.getByRole('button',{name:/^Bills,/})
  expect(category).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByText('Groceries')).not.toBeInTheDocument()
  fireEvent.click(category)
  expect(screen.getByText('Groceries')).toBeVisible()
  filterBy('Owner','Immy')
  filterBy('Owner','All')
  fireEvent.click(screen.getByRole('button',{name:/Next month/}))
  fireEvent.click(screen.getByRole('button',{name:/Previous month/}))
  expect(screen.getByRole('button',{name:/^Bills,/})).toHaveAttribute('aria-expanded','true')
  unmount()
  render(<SeededHarness initial={initial}/>)
  expect(screen.getByRole('button',{name:/^Bills,/})).toHaveAttribute('aria-expanded','true')
  fireEvent.click(screen.getByRole('button',{name:/^Bills,/}))
  expect(screen.queryByText('Groceries')).not.toBeInTheDocument()
})
it('shows direct search matches and restores the saved group state when cleared',()=>{
  render(<Harness/>);addItem()
  fireEvent.click(screen.getByRole('button',{name:/^Subscriptions,/}))
  expect(screen.queryByText('Apple TV')).not.toBeInTheDocument()
  const search=screen.getByPlaceholderText('Search items')
  fireEvent.change(search,{target:{value:'Apple TV'}})
  expect(screen.getByText('Apple TV')).toBeVisible()
  expect(screen.queryByRole('button',{name:/^Subscriptions,/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Clear search'}))
  expect(screen.queryByText('Apple TV')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/^Subscriptions,/})).toHaveAttribute('aria-expanded','false')
})
it('restores browsing scroll and keeps changed filters after clearing search',()=>{
  vi.spyOn(window,'scrollY','get').mockReturnValue(420)
  const scrollTo=vi.spyOn(window,'scrollTo').mockImplementation(()=>{})
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{callback(0);return 1})
  render(<Harness/>);addItem()
  const search=screen.getByPlaceholderText('Search items')
  fireEvent.pointerDown(search)
  fireEvent.change(search,{target:{value:'  Apple TV  '}})
  expect(screen.getByRole('button',{name:'Apple TV'})).toBeVisible()
  filterBy('Owner','Nick')
  fireEvent.click(screen.getByRole('button',{name:'Clear search'}))
  expect(search).toHaveValue('')
  expect(filterValue('Owner')).toBe('Nick')
  expect(scrollTo).toHaveBeenCalledWith(0,420)
})
it('shows the balance and people and transfers summary',()=>{const {rerender}=render(<Harness/>);addItem('Deficit item','10');expect(screen.getByRole('region',{name:'Plan summary'}).querySelector('.allocation-meter-balance')).toHaveTextContent('£10.00 over');rerender(<Harness view="month"/>);expect(screen.getByRole('region',{name:'Steps by person'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'More Month options'}));fireEvent.click(screen.getByRole('menuitem',{name:'Funding by account'}));expect(screen.getByRole('heading',{name:'Funding by account'})).toBeVisible();expect(screen.queryByText('Monthly plan by person')).not.toBeInTheDocument()})
it('omits the page subtitle and places the page heading before the month selector',()=>{render(<Harness/>);const heading=screen.getByRole('heading',{level:1,name:/^Plan, /}),month=screen.getByRole('button',{name:/November|December|January|February|March|April|May|June|July|August|September|October/});expect(screen.queryByText('Plan the items you want to fund and where the money goes.')).not.toBeInTheDocument();expect(heading.compareDocumentPosition(month)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()})
it('removes an item from inside its editor after the same confirm, and keeps the edit open on cancel',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  const item=(id:string,name:string)=>({id,name,categoryId:'bills',destination:{kind:'account' as const,accountId:'a1'},entryAmountPence:899,amountPence:899,frequency:'monthly' as const,funding:'single' as const,singleFunderId:'nick'})
  initial.budget.snapshots[month]={items:[item('tv','Apple TV'),item('nf','Netflix')]}
  render(<SeededHarness initial={initial}/>)
  expandAll()
  const name=screen.getByRole('button',{name:'Apple TV'})
  name.focus();fireEvent.click(name)
  const form=screen.getByRole('form',{name:'Edit item'})
  fireEvent.change(within(form).getByLabelText('Item name'),{target:{value:'Apple TV+'}})
  fireEvent.click(within(form).getByRole('button',{name:'Remove item'}))
  const dialog=screen.getByRole('dialog',{name:'Remove Apple TV?'})
  expect(within(dialog).getByRole('region',{name:'Impact preview'})).toBeVisible()
  fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}))
  expect(form).toBeInTheDocument()
  expect(within(form).getByLabelText('Item name')).toHaveValue('Apple TV+')
  const remove=within(form).getByRole('button',{name:'Remove item'})
  remove.focus();fireEvent.click(remove)
  fireEvent.click(within(screen.getByRole('dialog',{name:'Remove Apple TV?'})).getByRole('button',{name:'Remove item'}))
  expect(screen.queryByRole('form',{name:'Edit item'})).not.toBeInTheDocument()
  expect(screen.queryByText('Apple TV')).not.toBeInTheDocument()
  expect(document.querySelector('.budget-v3-table-wrap')).toHaveFocus()
})
it('offers Remove only when editing, not when adding',()=>{
  render(<Harness/>)
  fireEvent.click(screen.getAllByRole('button',{name:'Add item'})[0]!)
  expect(within(screen.getByRole('form',{name:'Add item'})).queryByRole('button',{name:'Remove item'})).not.toBeInTheDocument()
})
it('confirms removal from the selected budget month and returns focus to the row menu on cancel',()=>{
  desktop()
  render(<Harness/>);addItem()
  const menu=screen.getByLabelText('More actions for Apple TV')
  fireEvent.click(menu);fireEvent.click(screen.getByRole('button',{name:'Remove'}))
  const dialog=screen.getByRole('dialog',{name:'Remove Apple TV?'})
  expect(within(dialog).getByRole('region',{name:'Impact preview'})).toBeVisible()
  expect(within(dialog).getByRole('button',{name:'Cancel'})).toHaveFocus()
  fireEvent.keyDown(dialog,{key:'Escape'})
  expect(screen.queryByRole('dialog',{name:'Remove Apple TV?'})).not.toBeInTheDocument()
  expect(screen.getByText('Apple TV')).toBeVisible()
  expect(menu).toHaveFocus()
  fireEvent.click(menu);fireEvent.click(screen.getByRole('button',{name:'Remove'}))
  fireEvent.click(within(screen.getByRole('dialog',{name:'Remove Apple TV?'})).getByRole('button',{name:'Remove item'}))
  expect(screen.queryByText('Apple TV')).not.toBeInTheDocument()
})
it('shows explicit budget and income change markers in the month picker',()=>{render(<Harness/>);addItem('Bill');fireEvent.click(screen.getByRole('button',{name:'November 2026'}));const picker=screen.getByRole('dialog',{name:'Choose budget month'});expect(picker).toBeVisible();const current=within(picker).getByRole('button',{current:true});expect(current).toHaveAccessibleName(/^November 2026/);expect(current).toHaveClass('is-selected');expect(within(picker).getByRole('button',{name:/November 2026.*budget updated/})).toBe(current);fireEvent.keyDown(picker,{key:'Escape'});expect(screen.queryByRole('dialog',{name:'Choose budget month'})).not.toBeInTheDocument()})
it('saves a quick amount only after explicit confirmation',()=>{render(<Harness/>);addItem('Phone', '10', '', 'proportional');fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));let form=screen.getByRole('form',{name:'Quick edit amount for Phone'}),input=screen.getByRole('textbox',{name:'Monthly amount for Phone'});expect(input).toHaveValue('10.00');fireEvent.change(input,{target:{value:'15'}});
  // Moving to Save keeps the edit; leaving the row without Enter cancels it.
  fireEvent.blur(input,{relatedTarget:within(form).getByRole('button',{name:'Save'})});expect(screen.queryByRole('button',{name:'Edit amount for Phone'})).not.toBeInTheDocument()
  fireEvent.blur(input,{relatedTarget:document.body});expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£10.00')
  fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));form=screen.getByRole('form',{name:'Quick edit amount for Phone'});input=screen.getByRole('textbox',{name:'Monthly amount for Phone'});fireEvent.change(input,{target:{value:'15'}})
  fireEvent.submit(form);expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£15.00');expect(screen.getByText('Phone saved')).toBeVisible()})
it('cancels and validates quick edits without changing the amount',()=>{render(<Harness/>);addItem('Phone','10','','equal');fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));let form=screen.getByRole('form',{name:'Quick edit amount for Phone'});fireEvent.change(screen.getByRole('textbox',{name:'Monthly amount for Phone'}),{target:{value:'-1'}});fireEvent.click(within(form).getByRole('button',{name:'Save'}));expect(within(form).getByRole('alert')).toHaveTextContent('£0 or more');fireEvent.click(within(form).getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£10.00');fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));form=screen.getByRole('form',{name:'Quick edit amount for Phone'});fireEvent.change(screen.getByRole('textbox',{name:'Monthly amount for Phone'}),{target:{value:'0'}});fireEvent.click(within(form).getByRole('button',{name:'Save'}));expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£0.00')})
it('uses the full editor for annual amounts and fixed contributions',()=>{const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;initial.budget.snapshots[month]={items:[{id:'annual',name:'Annual bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:12000,amountPence:1000,frequency:'annually',funding:'equal'},{id:'fixed',name:'Fixed bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'fixed',contributions:[{personId:'nick',amountPence:1000}]}]};render(<SeededHarness initial={initial}/>);fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'bill'}});expect(screen.queryByRole('button',{name:'Edit amount for Annual bill'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Edit amount for Fixed bill'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Annual bill'}));expect(screen.getByRole('form',{name:'Edit item'})).toBeVisible()})
it('opens item editing from the name and dismisses the actions menu with Escape',()=>{
  desktop()
  render(<Harness/>);addItem()
  const menu=screen.getByLabelText('More actions for Apple TV')
  fireEvent.click(menu)
  expect(menu.closest('details')).toHaveAttribute('open')
  fireEvent.keyDown(menu,{key:'Escape'})
  expect(menu.closest('details')).not.toHaveAttribute('open')
  expect(menu).toHaveFocus()
  fireEvent.click(screen.getByRole('button',{name:'Apple TV'}))
  expect(screen.getByRole('form',{name:'Edit item'})).toBeVisible()
})
it('opens the editor from anywhere on the row except its controls',()=>{
  render(<Harness/>);addItem()
  const row=screen.getByRole('button',{name:'Apple TV'}).closest('tr')!
  fireEvent.click(within(row).getByRole('button',{name:'Edit amount for Apple TV'}))
  expect(screen.queryByRole('form',{name:'Edit item'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
  fireEvent.click(row.querySelector<HTMLElement>('.budget-v3-item-meta')!)
  expect(screen.getByRole('form',{name:'Edit item'})).toBeVisible()
})
it('keeps compact destination details on phones and removes from the editor the row opens',()=>{
  render(<Harness/>);addItem()
  const row=screen.getByRole('button',{name:'Apple TV'}).closest('tr')!
  expect(row.querySelector('.budget-v3-item-meta')).toHaveTextContent(/Destination: Monzo Nick$/)
  fireEvent.click(row.querySelector<HTMLElement>('.budget-v3-item-meta')!)
  const form=screen.getByRole('form',{name:'Edit item'})
  fireEvent.click(within(form).getByRole('button',{name:'Remove item'}))
  fireEvent.click(within(screen.getByRole('dialog',{name:'Remove Apple TV?'})).getByRole('button',{name:'Remove item'}))
  expect(screen.queryByText('Apple TV')).not.toBeInTheDocument()
})
it('duplicates from the desktop row menu into a prefilled new item',()=>{
  desktop()
  render(<Harness/>);addItem('Apple TV','8.99','','equal')
  fireEvent.click(screen.getByLabelText('More actions for Apple TV'))
  expect(screen.queryByRole('button',{name:'Edit'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Duplicate'}))
  const form=screen.getByRole('form',{name:'Add item'})
  expect(within(form).getByRole('heading',{name:'Duplicate item'})).toBeInTheDocument()
  expect(within(form).getByLabelText('Item name')).toHaveValue('Apple TV (copy)')
  expect(within(form).getByLabelText('Monthly amount')).toHaveValue('8.99')
  expect(within(form).getByLabelText('Funding type')).toHaveValue('equal')
  fireEvent.click(within(form).getByRole('button',{name:'Save item'}))
  expect(screen.getByRole('button',{name:'Apple TV'})).toBeVisible()
  expect(screen.getByRole('button',{name:'Apple TV (copy)'})).toBeVisible()
})
it('duplicates from the editor, confirming that unsaved changes are left behind',()=>{
  render(<Harness/>);addItem()
  fireEvent.click(screen.getByRole('button',{name:'Apple TV'}))
  let form=screen.getByRole('form',{name:'Edit item'})
  fireEvent.click(within(form).getByRole('button',{name:'Duplicate'}))
  expect(screen.getByRole('form',{name:'Add item'})).toBeVisible()
  expect(screen.getByLabelText('Item name')).toHaveValue('Apple TV (copy)')
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
  fireEvent.click(screen.getByRole('button',{name:'Apple TV'}))
  form=screen.getByRole('form',{name:'Edit item'})
  fireEvent.change(within(form).getByLabelText('Item name'),{target:{value:'Apple TV+'}})
  fireEvent.click(within(form).getByRole('button',{name:'Duplicate'}))
  const confirm=screen.getByRole('dialog',{name:'Discard changes to this item?'})
  expect(confirm).toHaveTextContent('The copy starts from the saved item.')
  fireEvent.click(within(confirm).getByRole('button',{name:'Discard'}))
  expect(screen.getByLabelText('Item name')).toHaveValue('Apple TV (copy)')
})
it('creates an account and its pot with an item in one save',()=>{render(<Harness/>);fireEvent.click(screen.getAllByRole('button',{name:'Add item'})[0]!);const form=screen.getByRole('form',{name:'Add item'});fireEvent.change(within(form).getByLabelText('Item name'),{target:{value:'Council tax'}});fireEvent.change(within(form).getByLabelText('Monthly amount'),{target:{value:'150'}});fireEvent.change(within(form).getByLabelText('New category'),{target:{value:'Housing'}});createAccountInPicker(form);fireEvent.click(within(form).getByRole('button',{name:'+ Add pot'}));fireEvent.change(within(form).getByLabelText('Pot name'),{target:{value:'Bills'}});fireEvent.click(within(form).getByRole('button',{name:'Use new pot'}));fireEvent.click(within(form).getByRole('button',{name:'Save item'}));expect(screen.getByText('Council tax')).toBeVisible();expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Bills · Monzo Nick')})

it('searches the account type when its stored name is a custom nickname',()=>{render(<Harness/>);addItem('Groceries','100','Everyday');fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'Current account'}});expect(screen.getByText('Groceries')).toBeVisible();expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Everyday')})

function seededDocument() {
  const d = newBudgetDocument()
  d.household = { name: 'Home', adults: [{ id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' }] }
  d.budget.categories = [{ id: 'bills', name: 'Bills' }]
  d.budget.accounts = [
    { id: 'a1', name: 'Current account', provider: 'Monzo', accountTypeId: 'current-account', ownerPersonIds: ['nick'] },
    { id: 'a2', name: 'Mortgage', provider: 'Nationwide', accountTypeId: 'mortgage', ownerPersonIds: ['immy'] },
  ]
  d.budget.pots = [{ id: 'p1', name: 'Spending', accountId: 'a1' }]
  return d
}
function SeededHarness({ initial, view = 'plan', onSeeTransferItems }: { initial: BudgetDocument; view?: 'month' | 'plan'; onSeeTransferItems?: (accountId: string) => void }) {
  const [document, setDocument] = useState(initial)
  return <><MonthlyBudget document={document} setDocument={setDocument} view={view} onSeeTransferItems={onSeeTransferItems} onOpenSettings={openSettings}/><output data-testid="saved-budget">{JSON.stringify(document.budget)}</output></>
}
/** Each numbered payday step as read: number, action, amount, captions. */
const stepTexts = (region: HTMLElement) => within(region).getAllByRole('listitem').map(step => step.textContent)
function savedBudget() { return JSON.parse(screen.getByTestId('saved-budget').textContent!) as BudgetDocument['budget'] }

it('lists each person’s payday steps in order, with pot moves under their account',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.incomeSources=[{id:'n',personId:'nick',name:'Job',type:'employment',baseAmountPence:400000,changes:{}},{id:'i',personId:'immy',name:'Job',type:'employment',baseAmountPence:200000,changes:{}}]
  initial.budget.snapshots[month]={items:[
    {id:'direct',name:'Direct item',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'},
    {id:'pot-item',name:'Pot item',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:2000,amountPence:2000,frequency:'monthly',funding:'equal'},
    {id:'pot-item-2',name:'Second pot item',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'},
    {id:'single-item',name:'Single funder',categoryId:'bills',destination:{kind:'account',accountId:'a2'},entryAmountPence:500,amountPence:500,frequency:'monthly',funding:'single',singleFunderId:'nick'},
  ]}
  const seeItems=vi.fn()
  render(<SeededHarness initial={initial} view="month" onSeeTransferItems={seeItems}/>)
  const transfers=screen.getByRole('region',{name:'Steps by person'})
  // Nobody chosen yet: everyone's steps, each card headed by progress and what it adds up to.
  expect(within(transfers).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Nick0 of 3 · 2 to fund · 1 move','Immy0 of 1 · 1 to fund'])
  expect(transfers.querySelector('.payday-person-sub')).toHaveTextContent('£25.00 from £4,000.00 available')
  const nick=screen.getByRole('region',{name:'Nick steps'})
  expect(stepTexts(nick)).toEqual([
    'Fund Monzo Nick£20.00',
    'Move to Spending from Monzo Nick£30.00Includes £15.00 from Immy',
    'Fund Nationwide Immy£5.00',
  ])
  expect(within(nick).getAllByRole('listitem')[1]).toHaveClass('is-indent')
  // The band carries the owner and the item count; Immy pays into Nick's account and Nick moves her share on.
  expect([...nick.querySelectorAll('.step-group-band')].map(band=>band.textContent)).toEqual(['Monzo NickNick’s · 3 items','Nationwide ImmyImmy’s · 1 item'])
  expect(stepTexts(screen.getByRole('region',{name:'Immy steps'}))).toEqual(['Fund Monzo Nick£20.00Nick moves £15.00 of it into Spending'])
  expect(transfers).not.toHaveTextContent('Direct item')
  expect(screen.getByRole('heading',{name:'Payday0 of 4'})).toBeInTheDocument()
  // Items live in Plan now; there is no detail screen to open.
  fireEvent.click(within(nick).getByRole('button',{name:'See 3 items for Monzo Nick'}))
  expect(seeItems).toHaveBeenCalledWith('a1')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

function personSwitchDocument() {
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.incomeSources=[{id:'n',personId:'nick',name:'Job',type:'employment',baseAmountPence:400000,changes:{}},{id:'i',personId:'immy',name:'Job',type:'employment',baseAmountPence:200000,changes:{}}]
  initial.budget.snapshots[month]={items:[
    {id:'direct',name:'Direct item',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'},
    {id:'pot-item',name:'Pot item',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:3000,amountPence:3000,frequency:'monthly',funding:'equal'},
    {id:'single-item',name:'Single funder',categoryId:'bills',destination:{kind:'account',accountId:'a2'},entryAmountPence:500,amountPence:500,frequency:'monthly',funding:'single',singleFunderId:'immy'},
  ]}
  return initial
}

it('switches whose steps show on this phone, with each person’s progress, and remembers the choice',()=>{
  const {unmount}=render(<SeededHarness initial={personSwitchDocument()} view="month"/>)
  const choice=screen.getByRole('group',{name:'Whose steps'})
  expect(screen.queryByText(/Who’s moving money/)).not.toBeInTheDocument()
  expect(within(choice).getAllByRole('button').map(button=>button.textContent)).toEqual(['Nick0/2','Immy0/2','Both'])
  // Unchosen, it shows Both: everyone's steps.
  expect(within(choice).getByRole('button',{name:/^Both/})).toHaveAttribute('aria-pressed','true')
  expect(within(screen.getByRole('region',{name:'Steps by person'})).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Nick0 of 2 · 1 to fund · 1 move','Immy0 of 2 · 2 to fund'])
  fireEvent.click(within(choice).getByRole('button',{name:/^Immy/}))
  expect(window.localStorage.getItem('north.transferPerson')).toBe('immy')
  expect(within(choice).getByRole('button',{name:/^Immy/})).toHaveAttribute('aria-pressed','true')
  expect(screen.getByRole('heading',{name:'Payday0 of 2'})).toBeInTheDocument()
  const overview=screen.getByRole('region',{name:'Steps by person'})
  expect(within(overview).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Immy0 of 2 · 2 to fund'])
  expect(stepTexts(overview)).toEqual([
    'Fund Monzo Nick£20.00Nick moves £15.00 of it into Spending',
    'Fund Nationwide Immy£5.00',
  ])
  unmount()
  render(<SeededHarness initial={personSwitchDocument()} view="month"/>)
  const again=screen.getByRole('group',{name:'Whose steps'})
  expect(within(again).getByRole('button',{name:/^Immy/})).toHaveAttribute('aria-pressed','true')
  fireEvent.click(within(again).getByRole('button',{name:/^Nick/}))
  expect(stepTexts(screen.getByRole('region',{name:'Steps by person'}))[1]).toBe('Move to Spending from Monzo Nick£30.00Includes £15.00 from Immy')
  fireEvent.click(within(again).getByRole('button',{name:'Both'}))
  expect(window.localStorage.getItem('north.transferPerson')).toBe('both')
  expect(within(screen.getByRole('region',{name:'Steps by person'})).getAllByRole('heading',{level:3})).toHaveLength(2)
})

it('falls back to Both when the remembered person has left, and has no switch for a household of one',()=>{
  window.localStorage.setItem('north.transferPerson','someone-else')
  const {unmount}=render(<SeededHarness initial={personSwitchDocument()} view="month"/>)
  expect(within(screen.getByRole('group',{name:'Whose steps'})).getByRole('button',{name:'Both'})).toHaveAttribute('aria-pressed','true')
  unmount()
  const solo=personSwitchDocument()
  solo.household.adults=[{id:'nick',name:'Nick'}]
  solo.budget.incomeSources=solo.budget.incomeSources.filter(source=>source.personId==='nick')
  solo.budget.accounts=solo.budget.accounts.filter(account=>account.id==='a1')
  for(const snapshot of Object.values(solo.budget.snapshots))snapshot.items=snapshot.items.filter(item=>item.funding!=='single')
  render(<SeededHarness initial={solo} view="month"/>)
  expect(screen.queryByRole('group',{name:'Whose steps'})).not.toBeInTheDocument()
  expect(within(screen.getByRole('region',{name:'Steps by person'})).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Nick0 of 2 · 1 to fund · 1 move'])
  expect(screen.getByRole('region',{name:'Steps by person'}).querySelector('.payday-person-sub')).toHaveTextContent('£40.00 from')
})

it('gives Month and Plan one h1 each, naming the screen and the month they share',()=>{
  const initial=seededDocument()
  const {rerender}=render(<SeededHarness initial={initial} view="month"/>)
  const month=document.querySelector('.budget-v3-month>button:nth-child(2)')!.textContent!
  expect(screen.getAllByRole('heading',{level:1}).map(heading=>heading.textContent)).toEqual([`Month, ${month}`])
  expect(screen.getByRole('heading',{level:2,name:'Payday'})).toBeInTheDocument()
  expect(screen.getByRole('heading',{level:2,name:'Pots'})).toBeInTheDocument()
  rerender(<SeededHarness initial={initial} view="plan"/>)
  expect(screen.getAllByRole('heading',{level:1}).map(heading=>heading.textContent)).toEqual([`Plan, ${month}`])
  expect(document.querySelector('.budget-v3-date-selector')).toBeVisible()
})

it('copies a step amount as a plain number and says so; desktop hints once',async()=>{
  desktop()
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'single',name:'Solo transfer',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:221545,amountPence:221545,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  const writeText=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  render(<SeededHarness initial={initial} view="month"/>)
  const overview=screen.getByRole('region',{name:'Steps by person'})
  expect(screen.getByText('Click an amount to copy it')).toBeVisible()
  fireEvent.click(within(overview).getByRole('button',{name:'Copy £2,215.45'}))
  expect(writeText).toHaveBeenCalledWith('2215.45')
  await waitFor(()=>expect(document.querySelector('.step-copied')).toHaveTextContent('Copied £2,215.45'))
  expect(screen.queryByText('Click an amount to copy it')).not.toBeInTheDocument()
  expect(window.localStorage.getItem('north.copyHint.seen')).toBe('1')
  fireEvent.click(within(overview).getByRole('button',{name:'Copy £2,215.45'}))
  await waitFor(()=>expect(document.querySelector('.step-copied')).toHaveTextContent('Couldn’t copy'))
  Reflect.deleteProperty(navigator,'clipboard')
  vi.unstubAllGlobals()
})

it('leaves people with nothing to move out of the steps',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.household.adults.push({id:'sam',name:'Sam'})
  initial.budget.snapshots[month]={items:[{id:'single',name:'Solo transfer',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:500,amountPence:500,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial} view="month"/>)
  const overview=screen.getByRole('region',{name:'Steps by person'})
  expect(within(overview).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Nick0 of 1 · 1 to fund'])
  expect(stepTexts(overview)).toEqual(['Fund Monzo Nick£5.00'])
  expect(overview).not.toHaveTextContent('Immy')
  expect(overview).not.toHaveTextContent('Sam')
  // Without a Plan route there is nowhere for the item count to go.
  expect(within(overview).queryByRole('button',{name:/^See /})).not.toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('group',{name:'Whose steps'})).getByRole('button',{name:'Sam'}))
  expect(screen.getByRole('region',{name:'Steps by person'})).toHaveTextContent('Sam has nothing to move this month.')
})

it('lists steps by who pays, with short account names, duplicate suffixes and nonzero pence',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.household.adults.push({id:'sam',name:'Sam'})
  initial.budget.accounts=[
    {id:'joint',name:'Home',provider:'Monzo',accountTypeId:'current-account',ownerPersonIds:['nick','immy']},
    {id:'nick-1',name:'Everyday',provider:'Monzo',accountTypeId:'current-account',ownerPersonIds:['nick']},
    {id:'nick-2',name:'Everyday',provider:'Monzo',accountTypeId:'current-account',ownerPersonIds:['nick']},
    {id:'immy',name:'ISA',provider:'HL',accountTypeId:'stocks-shares-isa',ownerPersonIds:['immy']},
    {id:'sam',name:'Cash',provider:'Barclays',accountTypeId:'current-account',ownerPersonIds:['sam']},
    {id:'unknown',name:'Old account',provider:'',ownerPersonIds:[]},
  ]
  initial.budget.pots=[]
  initial.budget.snapshots[month]={items:initial.budget.accounts.map(account=>({id:`item-${account.id}`,name:account.name,categoryId:'bills',destination:{kind:'account' as const,accountId:account.id},entryAmountPence:1,amountPence:1,frequency:'monthly' as const,funding:'single' as const,singleFunderId:'nick'}))}
  render(<SeededHarness initial={initial} view="month"/>)
  const overview=screen.getByRole('region',{name:'Steps by person'})
expect(within(overview).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Nick0 of 6 · 6 to fund'])
  const labels=within(overview).getAllByRole('listitem').map(step=>step.querySelector('.step-label')!.textContent)
  expect(labels).toEqual(['Fund Home','Fund Everyday (Account 1)','Fund Everyday (Account 2)','Fund ISA','Fund Cash','Fund Old account'])
  expect(within(overview).getAllByRole('listitem')[1]).toHaveTextContent('£0.01')
})

it('keeps incomplete allocation warnings actionable and withholds steps for accounts needing review',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'unresolved',name:'Unfunded',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'proportional'}]}
  const seeItems=vi.fn()
  render(<SeededHarness initial={initial} view="month" onSeeTransferItems={seeItems}/>)
  const warning=document.querySelector<HTMLElement>('.budget-v3-transfer-warning')!
  expect(warning).toHaveTextContent('Unfunded')
  const overview=screen.getByRole('region',{name:'Steps by person'})
  expect(overview.querySelector('ol')).toBeNull()
  const review=within(overview).getByRole('region',{name:'Needs review'})
  expect(review).toHaveTextContent('Monzo Nick—Not calculated')
  expect(review).not.toHaveTextContent('£0.00')
  expect(review).toHaveTextContent('Some items here can’t be funded yet.')
  expect(review).not.toHaveTextContent('Unfunded')
  fireEvent.click(within(review).getByRole('button',{name:'See 1 item for Monzo Nick'}))
  expect(seeItems).toHaveBeenCalledWith('a1')
  openSettings.mockClear()
  fireEvent.click(within(warning).getByRole('button',{name:'Edit income'}))
  expect(openSettings).toHaveBeenCalledWith('income')
  cleanup()
  render(<SeededHarness initial={seededDocument()} view="month"/>)
  expect(screen.getByText('Nothing to fund yet')).toBeVisible()
  expect(screen.getByText('Add items on the Plan and each person’s payday steps appear here.')).toBeVisible()
})

it('labels a resolved zero allocation without an incomplete warning',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'zero',name:'Zero item',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:0,amountPence:0,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial} view="month"/>)
  const overview=screen.getByRole('region',{name:'Steps by person'})
  // Nothing to fund and nothing to review: a resolved zero is not a payday step.
  expect(within(overview).queryByRole('button')).not.toBeInTheDocument()
  expect(overview).toHaveTextContent('Nothing to move this month.')
  expect(overview).not.toHaveTextContent('Account instructions need review')
})

it('withholds a partly calculated account from the steps but keeps its known amounts',()=>{
  const initial=personSwitchDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]!.items.push({id:'unresolved',name:'Unfunded',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'single'})
  window.localStorage.setItem('north.transferPerson','nick')
  render(<SeededHarness initial={initial} view="month"/>)
  const overview=screen.getByRole('region',{name:'Steps by person'})
  expect(overview).toHaveTextContent('Nick has no steps ready this month.')
  const review=within(overview).getByRole('region',{name:'Needs review'})
  expect(review).toHaveTextContent('Nick so far£20.00')
  expect(review).not.toHaveTextContent('Immy so far')
})

it('keeps a large destination to one funding step and one pot step',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:Array.from({length:23},(_,index)=>({id:`item-${index}`,name:`Budget item ${index+1}`,categoryId:'bills',destination:{kind:'pot' as const,potId:'p1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly' as const,funding:'equal' as const}))}
  render(<SeededHarness initial={initial} view="month" onSeeTransferItems={vi.fn()}/>)
  const nick=screen.getByRole('region',{name:'Nick steps'})
  expect(stepTexts(nick)).toEqual(['Fund Monzo Nick£115.00','Move to Spending from Monzo Nick£230.00Includes £115.00 from Immy'])
  expect(nick.querySelector('.step-group-band')).toHaveTextContent('Nick’s · 23 items')
  expect(nick).not.toHaveTextContent('Budget item 1')
})

it('navigates an existing account and pot and saves the selected stable pot ID', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Groceries' } })
  fireEvent.change(within(form).getByLabelText('Monthly amount'), { target: { value: '120' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Spending' }))
  expect(within(form).getByText(/Spending · Monzo Nick/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  const items = Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)
  expect(items).toHaveLength(1)
  expect(items[0]!.destination).toEqual({ kind: 'pot', potId: 'p1' })
  expect(items[0]).toMatchObject({ funding: 'single', singleFunderId: 'nick' })
  expect(savedBudget().pots).toHaveLength(1)
})

it('keeps the saved destination while changing branches and asks to finish or keep it before saving', () => {
  const initial = seededDocument()
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month] = { items: [{ id: 'item1', name: 'Groceries', categoryId: 'bills', destination: { kind: 'pot', potId: 'p1' }, entryAmountPence: 12000, amountPence: 12000, frequency: 'monthly', funding: 'equal' }] }
  render(<SeededHarness initial={initial}/>)
  expandAll()
  fireEvent.click(screen.getByRole('button', { name: 'Groceries' }))
  const form = screen.getByRole('form', { name: 'Edit item' })
  expect(within(form).getByText(/Spending · Monzo Nick/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Immy' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Nationwide · Mortgage' }))
  expect(within(form).getByText('Spending · Monzo Nick')).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(within(form).getByRole('alert')).toHaveTextContent('Finish choosing a destination, or keep the current one.')
  expect(within(form).getByLabelText('Item name')).toHaveValue('Groceries')
  expect(within(form).getByLabelText('Monthly amount')).toHaveValue('120.00')
  expect(within(form).getByLabelText('Funding type')).toHaveValue('equal')
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(savedBudget().snapshots[month]!.items[0]!.destination).toEqual({ kind: 'account', accountId: 'a2' })
  expect(savedBudget().snapshots[month]!.items[0]!.funding).toBe('equal')
})

it('does not persist a staged account or pot when the item is cancelled', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  createAccountInPicker(form, 'Nick', 'Starling')
  fireEvent.click(within(form).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(form).getByLabelText('Pot name'), { target: { value: 'Holiday' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Use new pot' }))
  expect(savedBudget().accounts).toHaveLength(2)
  expect(savedBudget().pots).toHaveLength(1)
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved items?' })).getByRole('button', { name: 'Discard' }))
  expect(form).not.toBeInTheDocument()
  expect(savedBudget().accounts).toHaveLength(2)
  expect(savedBudget().pots).toHaveLength(1)
})

it('creates a pot under an existing account only when the item is saved', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Fuel' } })
  fireEvent.change(within(form).getByLabelText('Monthly amount'), { target: { value: '50' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(form).getByLabelText('Pot name'), { target: { value: ' Fuel ' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Use new pot' }))
  expect(savedBudget().pots).toHaveLength(1)
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(savedBudget().pots).toHaveLength(2)
  expect(savedBudget().pots[1]!.name).toBe('Fuel')
  expect(savedBudget().pots[1]!.accountId).toBe('a1')
  expect(Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)[0]!.destination).toEqual({ kind: 'pot', potId: savedBudget().pots[1]!.id })
})

function openSeededEditor() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  return form
}
function fillRow(form: HTMLElement, index: number, name: string, amount: string) {
  const row = within(form).getByRole('row', { name: `Item ${index}` })
  fireEvent.change(within(row).getByLabelText('Item name'), { target: { value: name } })
  fireEvent.change(within(row).getByLabelText('Monthly amount'), { target: { value: amount } })
  return row
}

it('prioritises name, amount, destination and funding in the single-item editor', () => {
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'item1',name:'Groceries',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'}]}
  render(<SeededHarness initial={initial}/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'Groceries'}})
  fireEvent.click(screen.getByRole('button',{name:'Groceries'}))
  const form=screen.getByRole('form',{name:'Edit item'}),details=form.querySelector<HTMLDetailsElement>('.budget-single-details')!
  expect(details.open).toBe(false)
  expect(within(form).getByLabelText('Item name')).toHaveValue('Groceries')
  expect(within(form).getByLabelText('Monthly amount')).toHaveValue('120.00')
  expect(within(form).getByText('Funding')).toBeVisible()
  expect(within(form).getByRole('button',{name:'Change'})).toBeVisible()
  fireEvent.click(within(form).getByText(/More details/))
  expect(details.open).toBe(true)
  expect(within(form).getByLabelText('Category')).toHaveValue('bills')
  expect(within(form).getByLabelText('Frequency')).toHaveValue('monthly')
})

it('creates several items with one shared category, account and pot while ignoring an untouched blank row', () => {
  const initial = newBudgetDocument()
  initial.household = seededDocument().household
  render(<SeededHarness initial={initial}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  fireEvent.change(within(form).getByLabelText('New category'), { target: { value: 'Subscriptions' } })
  createAccountInPicker(form)
  fireEvent.click(within(form).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(form).getByLabelText('Pot name'), { target: { value: 'Bills' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Use new pot' }))
  fillRow(form, 1, 'Subscription', '10.01')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const second = within(form).getByRole('row', { name: 'Item 2' })
  expect(within(second).getByLabelText('Item name')).toHaveFocus()
  expect(within(second).getByLabelText('Frequency')).toHaveValue('monthly')
  expect(within(second).getByLabelText('Funding type')).toHaveValue('single')
  expect(within(second).getByLabelText('Person')).toHaveValue('nick')
  fillRow(form, 2, 'Subscription', '120')
  fireEvent.change(within(second).getByLabelText('Frequency'), { target: { value: 'annually' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  expect(within(form).getByText('Monthly total £20.01')).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  const budget = savedBudget()
  const items = Object.values(budget.snapshots).flatMap(snapshot => snapshot.items)
  expect(items).toHaveLength(2)
  expect(new Set(items.map(item => item.id)).size).toBe(2)
  expect(items.every(item => item.name === 'Subscription')).toBe(true)
  expect(budget.categories).toHaveLength(1)
  expect(budget.accounts).toHaveLength(1)
  expect(budget.accounts[0]!.name).toBe('Current account')
  expect(budget.pots).toHaveLength(1)
  expect(items.every(item => item.destination.kind === 'pot' && item.destination.potId === budget.pots[0]!.id)).toBe(true)
  expect(screen.getByText('Created 2 budget items.')).toBeVisible()
})

it('blocks the entire batch on an invalid row and focuses its first invalid field', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  const form = openSeededEditor()
  fillRow(form, 1, 'Valid', '10')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const invalid = fillRow(form, 2, 'Invalid', '-1')
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  expect(within(invalid).getByRole('alert')).toHaveTextContent('Enter a non-negative amount')
  expect(within(invalid).getByLabelText('Monthly amount')).toHaveFocus()
  expect(savedBudget().snapshots).toEqual({})
  fireEvent.change(within(invalid).getByLabelText('Monthly amount'), { target: { value: '20' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  expect(Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)).toHaveLength(2)
})

it('removes a row without losing another row’s values or funding settings', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  const form = openSeededEditor()
  fillRow(form, 1, 'Remove me', '10')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const second = fillRow(form, 2, 'Keep me', '35')
  fireEvent.change(within(second).getByLabelText('Funding type'), { target: { value: 'single' } })
  fireEvent.change(within(second).getByLabelText('Person'), { target: { value: 'immy' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Remove item 1' }))
  const remaining = within(form).getByRole('row', { name: 'Item 1' })
  expect(within(remaining).getByLabelText('Item name')).toHaveValue('Keep me')
  expect(within(remaining).getByLabelText('Item name')).toHaveFocus()
  expect(within(remaining).getByLabelText('Monthly amount')).toHaveValue('35')
  expect(within(remaining).getByLabelText('Person')).toHaveValue('immy')
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  const items = Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ name: 'Keep me', funding: 'single', singleFunderId: 'immy' })
})

it('shows monthly funding previews for every funding type and validates annual fixed contributions', () => {
  const initial = seededDocument()
  initial.budget.incomeSources = [
    { id: 'nick-income', personId: 'nick', name: 'Salary', type: 'employment', baseAmountPence: 200000, changes: {} },
    { id: 'immy-income', personId: 'immy', name: 'Salary', type: 'employment', baseAmountPence: 100000, changes: {} },
  ]
  render(<SeededHarness initial={initial}/>)
  const form = openSeededEditor()
  const row = fillRow(form, 1, 'Preview', '10.01')
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'proportional' } })
  expect(within(row).getByText('£6.67')).toBeVisible()
  expect(within(row).getByText('£3.34')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'equal' } })
  expect(within(row).getByText('£5.01')).toBeVisible()
  expect(within(row).getByText('£5.00')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'single' } })
  fireEvent.change(within(row).getByLabelText('Person'), { target: { value: 'immy' } })
  expect(within(row).getByText('£10.01')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'fixed' } })
  fireEvent.change(within(row).getByLabelText('Monthly amount'), { target: { value: '120' } })
  fireEvent.change(within(row).getByLabelText('Frequency'), { target: { value: 'annually' } })
  expect(within(row).getByLabelText('Annual amount')).toHaveValue('120')
  fireEvent.change(within(row).getByLabelText('Nick fixed amount'), { target: { value: '3' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(within(row).getByRole('alert')).toHaveTextContent('Fixed amounts must total £10.00.')
  expect(within(row).getByText('£7.00 unassigned')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Immy fixed amount'), { target: { value: '7' } })
  expect(within(row).getByText('£0.00 unassigned')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Frequency'), { target: { value: 'monthly' } })
  fireEvent.change(within(row).getByLabelText('Monthly amount'), { target: { value: '10.01' } })
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'custom' } })
  fireEvent.change(within(row).getByLabelText('Nick relative weight'), { target: { value: '1' } })
  fireEvent.change(within(row).getByLabelText('Immy relative weight'), { target: { value: '2' } })
  expect(within(row).getByText('£3.34')).toBeVisible()
  expect(within(row).getByText('£6.67')).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)[0]).toMatchObject({ funding: 'custom', customShares: { nick: 1, immy: 2 } })
})

it('shows missing income without blocking an income-ratio item from saving', () => {
  const initial = seededDocument()
  const { rerender } = render(<SeededHarness initial={initial}/>)
  const form = openSeededEditor()
  const row = fillRow(form, 1, 'No income yet', '10')
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'proportional' } })
  expect(within(row).getByText('Add employment income to work out funding.')).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(within(document.querySelector<HTMLElement>('.budget-v3-table')!).getByText('No income yet')).toBeVisible()
  rerender(<SeededHarness initial={initial} view="month"/>)
  const warning=screen.getByText(/1 item can’t be funded yet/).closest<HTMLElement>('.budget-v3-transfer-warning')!
  expect(within(warning).getByText('Show items')).toBeVisible()
  expect(within(warning).getByRole('button',{name:'Edit income'})).toBeVisible()
  expect(screen.queryByText(/Planned amounts, not payments/)).not.toBeInTheDocument()
})

it('protects changed drafts through Cancel, backdrop and Escape, then restores focus on discard', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  const trigger = screen.getAllByRole('button', { name: 'Add item' })[0]!
  trigger.focus()
  fireEvent.click(trigger)
  const form = screen.getByRole('form', { name: 'Add item' })
  expect(form.querySelector('.budget-batch-footer')).toHaveTextContent('Nothing added yet')
  expect(within(form).getByRole('button', { name: 'Save item' })).toBeDisabled()
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Draft' } })
  expect(within(form).getByRole('button', { name: 'Save item' })).toBeEnabled()
  expect(form.querySelector('.budget-batch-footer')).toHaveTextContent('1 item')
  const keepEditing = () => {
    const dialog = screen.getByRole('dialog', { name: 'Discard unsaved items?' })
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(form).toBeInTheDocument()
  }
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  keepEditing()
  fireEvent.click(within(form).getByRole('button', { name: 'Close' }))
  keepEditing()
  fireEvent.mouseDown(document.querySelector('.budget-batch-overlay')!)
  keepEditing()
  fireEvent.keyDown(within(form).getByLabelText('Item name'), { key: 'Escape' })
  const dialog = screen.getByRole('dialog', { name: 'Discard unsaved items?' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Discard unsaved items?' })).not.toBeInTheDocument()
  expect(form).toBeInTheDocument()
  fireEvent.keyDown(within(form).getByLabelText('Item name'), { key: 'Escape' })
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved items?' })).getByRole('button', { name: 'Discard' }))
  expect(form).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(savedBudget().snapshots).toEqual({})
})

it('protects unfinished inline destination details and traps Tab within the dialog', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: '+ Add account' }))
  fireEvent.change(within(form).getByLabelText('Bank / provider'), { target: { value: 'Unfinished bank' } })
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Draft' } })
  const save = within(form).getByRole('button', { name: 'Save item' })
  save.focus()
  fireEvent.keyDown(save, { key: 'Tab' })
  expect(within(form).getByRole('button', { name: 'Close' })).toHaveFocus()
  fireEvent.keyDown(within(form).getByRole('button', { name: 'Close' }), { key: 'Tab', shiftKey: true })
  expect(save).toHaveFocus()
  fireEvent.keyDown(save, { key: 'Escape' })
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard unsaved items?' })).getByRole('button', { name: 'Keep editing' }))
  expect(form).toBeInTheDocument()
  expect(savedBudget().accounts).toHaveLength(2)
})

it('changes the shared category and destination without losing entered rows', () => {
  const initial = seededDocument()
  initial.budget.categories.push({ id: 'subscriptions', name: 'Subscriptions' })
  render(<SeededHarness initial={initial}/>)
  const form = openSeededEditor()
  fillRow(form, 1, 'First', '12')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  fillRow(form, 2, 'Second', '24')
  fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'subscriptions' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Immy' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Nationwide · Mortgage' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  expect(within(form).getByRole('alert')).toHaveTextContent('Finish choosing a destination, or keep the current one.')
  expect(within(within(form).getByRole('row', { name: 'Item 2' })).getByLabelText('Monthly amount')).toHaveValue('24')
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  const items = Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)
  expect(items.map(item => item.name)).toEqual(['First', 'Second'])
  expect(items.every(item => item.categoryId === 'subscriptions' && item.destination.kind === 'account' && item.destination.accountId === 'a2')).toBe(true)
})

it('defaults a personal account and additional rows to its owner rather than the first household member', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add item' })
  fillRow(form, 1, 'Personal bill', '20')
  fireEvent.click(within(form).getByRole('button', { name: 'Immy' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Nationwide · Mortgage' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  expect(within(form).getByLabelText('Funding type')).toHaveValue('single')
  expect(within(form).getByLabelText('Person')).toHaveValue('immy')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const second = fillRow(form, 2, 'Another personal bill', '10')
  expect(within(second).getByLabelText('Funding type')).toHaveValue('single')
  expect(within(second).getByLabelText('Person')).toHaveValue('immy')
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  const items = Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)
  expect(items).toHaveLength(2)
  expect(items.every(item => item.funding === 'single' && item.singleFunderId === 'immy')).toBe(true)
})

it('updates automatic defaults between personal and Joint destinations while preserving explicit funding choices', () => {
  const initial = seededDocument()
  initial.budget.accounts.push({ id: 'joint', name: 'Current account', provider: 'Joint bank', accountTypeId: 'current-account', ownerPersonIds: ['nick', 'immy'] })
  render(<SeededHarness initial={initial}/>)
  const form = openSeededEditor()
  const first = fillRow(form, 1, 'Default funding', '10')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const second = fillRow(form, 2, 'Explicit equal split', '20')
  fireEvent.change(within(second).getByLabelText('Funding type'), { target: { value: 'equal' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const third = fillRow(form, 3, 'Explicit person', '30')
  fireEvent.change(within(third).getByLabelText('Person'), { target: { value: 'immy' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Joint' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Joint bank · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  expect(within(first).getByLabelText('Funding type')).toHaveValue('proportional')
  expect(within(second).getByLabelText('Funding type')).toHaveValue('equal')
  expect(within(third).getByLabelText('Funding type')).toHaveValue('single')
  expect(within(third).getByLabelText('Person')).toHaveValue('immy')
  fireEvent.click(within(form).getByRole('button', { name: 'Add another item' }))
  const fourth = within(form).getByRole('row', { name: 'Item 4' })
  expect(within(fourth).getByLabelText('Funding type')).toHaveValue('proportional')
  fireEvent.click(within(form).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Spending' }))
  expect(within(first).getByLabelText('Person')).toHaveValue('nick')
  expect(within(second).getByLabelText('Funding type')).toHaveValue('equal')
  expect(within(third).getByLabelText('Person')).toHaveValue('immy')
  expect(within(fourth).getByLabelText('Person')).toHaveValue('nick')
})


it('keeps an open group heading in view, operable, as boundaries cross and results change', async () => {
  const initial=seededDocument()
  const month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.categories.push({id:'other',name:'Other'})
  initial.budget.snapshots[month]={items:[
    {id:'sticky-item',name:'Groceries',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'},
    {id:'other-item',name:'Gifts',categoryId:'other',destination:{kind:'pot',potId:'p1'},entryAmountPence:3000,amountPence:3000,frequency:'monthly',funding:'equal'},
  ]}
  render(<SeededHarness initial={initial}/>)
  fireEvent.click(screen.getByRole('button',{name:/^Bills,/}))
  const wrap=document.querySelector<HTMLDivElement>('.budget-v3-table-wrap')!
  wrap.style.overflowY='auto'
  const rect=(top:number,bottom:number,height=bottom-top)=>({top,bottom,height,left:0,right:800,width:800,x:0,y:top,toJSON:()=>({})})
  vi.spyOn(wrap,'getBoundingClientRect').mockImplementation(()=>rect(100,500))
  vi.spyOn(wrap.querySelector('thead')!,'getBoundingClientRect').mockImplementation(()=>rect(100,130))
  const [bills,other]=[...wrap.querySelectorAll<HTMLElement>('[data-budget-group="category"]')]
  let billsTop=140,otherTop=240
  vi.spyOn(bills!,'getBoundingClientRect').mockImplementation(()=>rect(billsTop,billsTop+44))
  vi.spyOn(other!,'getBoundingClientRect').mockImplementation(()=>rect(otherTop,otherTop+44))
  billsTop=120
  fireEvent.scroll(wrap)
  await waitFor(()=>expect(wrap.querySelector('.plan-sticky-band')).toHaveTextContent('Bills'))
  expect(screen.getAllByRole('button',{name:/^Bills, 1 item\b/})).toHaveLength(1)
  const sticky=within(wrap.querySelector<HTMLElement>('.plan-sticky-band')!).getByRole('button')
  sticky.focus()
  billsTop=140
  fireEvent.scroll(wrap)
  await waitFor(()=>expect(sticky).not.toBeInTheDocument())
  expect(within(bills!).getByRole('button')).toHaveFocus()
  // A closed group is one row: its heading does not stick.
  billsTop=40;otherTop=120
  fireEvent.scroll(wrap)
  await waitFor(()=>expect(wrap.querySelector('.plan-sticky-band')).not.toBeInTheDocument())
  fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'Groceries'}})
  expect(screen.getByText('1 item · £120.00')).toBeVisible()
  fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'no match'}})
  expect(screen.getByText(/No items match/)).toBeVisible()
  expect(document.querySelector('.budget-v3-sticky-context')).not.toBeInTheDocument()
})

it.each([
  {income:2000,text:'£10.00 left'},
  {income:1000,text:'Balanced'},
  {income:0,text:'£10.00 over'},
])('leads the mobile Plan summary with $text',({income,text})=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.incomeSources=[{id:'job',personId:'nick',name:'Job',type:'employment',baseAmountPence:income,changes:{}}]
  initial.budget.snapshots[month]={items:[{id:'bill',name:'Bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial}/>)
  const summary=screen.getByRole('region',{name:'Plan summary'})
  expect(summary.querySelector('.allocation-meter-balance')).toHaveTextContent(text)
  expect(summary).toHaveTextContent(`£10.00 of £${(income/100).toFixed(2)}`)
  expect(within(summary).getByRole('meter',{name:`Nick: £10.00 planned of £${(income/100).toFixed(2)} available`})).toBeInTheDocument()
  // Phones keep the card short: no share and no basis; the pencil still edits income.
  expect(summary).not.toHaveTextContent('% planned')
  expect(summary).not.toHaveTextContent('salary')
  openSettings.mockClear()
  fireEvent.click(within(summary).getByRole('button',{name:'Edit income'}))
  expect(openSettings).toHaveBeenCalledWith('income')
})

it('shows mobile items under category groups and filters them by owner',()=>{
  vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.categories.push({id:'other',name:'Other'})
  initial.budget.snapshots[month]={items:[
    {id:'food',name:'Groceries',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'},
    {id:'home',name:'Mortgage',categoryId:'bills',destination:{kind:'account',accountId:'a2'},entryAmountPence:80000,amountPence:80000,frequency:'monthly',funding:'equal'},
  ]}
  render(<SeededHarness initial={initial}/>)
  const table=screen.getByRole('table',{name:'Budget items by category'})
  expect(table.querySelectorAll('.plan-group')).toHaveLength(1)
  expect(within(table).getByRole('button',{name:'Bills, 2 items, £920.00, 100.0% of plan'})).toBeVisible()
  expandAll()
  expect(within(table).getByRole('button',{name:'Groceries'})).toBeVisible()
  expect(within(table).getByRole('button',{name:'Mortgage'})).toBeVisible()
  filterBy('Owner','Immy')
  expect(within(table).queryByRole('button',{name:'Groceries'})).not.toBeInTheDocument()
  expect(within(table).getByRole('button',{name:'Mortgage'})).toBeVisible()
  filterBy('Category','other')
  expect(screen.getByText(/No items match/)).toBeVisible()
})

it('keeps month options keyboard focus contained and preserves a budget when removal is cancelled',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[]}
  render(<SeededHarness initial={initial}/>)
  const trigger=screen.getByRole('button',{name:'Plan options'})
  trigger.focus();fireEvent.click(trigger)
  const dialog=screen.getByRole('dialog',{name:'Plan options'})
  const close=within(dialog).getByRole('button',{name:'Close'}),remove=within(dialog).getByRole('button',{name:/^(Go back to|Clear) the .* budget$/})
  expect(close).toHaveFocus()
  fireEvent.keyDown(close,{key:'Tab',shiftKey:true})
  expect(remove).toHaveFocus()
  fireEvent.keyDown(remove,{key:'Tab'})
  expect(close).toHaveFocus()
  fireEvent.click(remove)
  fireEvent.click(within(screen.getByRole('dialog',{name:/budget\?$/})).getByRole('button',{name:'Cancel'}))
  expect(savedBudget().snapshots[month]).toBeDefined()
  expect(screen.queryByRole('dialog',{name:'Plan options'})).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('sends Plan options’ income and accounts entries to Settings',()=>{
  render(<SeededHarness initial={seededDocument()}/>)
  openSettings.mockClear()
  const trigger=screen.getByRole('button',{name:'Plan options'})
  fireEvent.click(trigger)
  let dialog=screen.getByRole('dialog',{name:'Plan options'})
  expect(within(dialog).queryByRole('button',{name:/^(Go back to|Clear) the/})).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button',{name:'Edit income'}))
  expect(screen.queryByRole('dialog',{name:'Plan options'})).not.toBeInTheDocument()
  expect(openSettings).toHaveBeenLastCalledWith('income')
  fireEvent.click(trigger)
  dialog=screen.getByRole('dialog',{name:'Plan options'})
  fireEvent.click(within(dialog).getByRole('button',{name:'Accounts, pots & categories'}))
  expect(openSettings).toHaveBeenLastCalledWith('accounts')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('preserves month, search and owner when switching views',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'bill',name:'Bill',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'}]}
  const {rerender}=render(<SeededHarness initial={initial} view="plan"/>)
  fireEvent.click(screen.getByRole('button',{name:'Next month'}))
  const selectedMonth=document.querySelector('.budget-v3-month>button:nth-child(2)')!.textContent
  fireEvent.change(screen.getByPlaceholderText('Search items'),{target:{value:'Bill'}})
  filterBy('Owner','Nick')
  rerender(<SeededHarness initial={initial} view="month"/>)
  const nickSteps=screen.getByRole('region',{name:'Nick steps'})
  expect(stepTexts(nickSteps)).toEqual(['Fund Monzo Nick£5.00','Move to Spending from Monzo Nick£10.00Includes £5.00 from Immy'])
  const trigger=screen.getByRole('button',{name:'More Month options'})
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem',{name:'How funding is worked out'}))
  const dialog=screen.getByRole('dialog',{name:'How funding is worked out'})
  expect(dialog).toHaveTextContent('isn’t counted twice')
  fireEvent.click(within(dialog).getByRole('button',{name:'Done'}))
  expect(trigger).toHaveFocus()
  rerender(<SeededHarness initial={initial} view="plan"/>)
  expect(screen.getByPlaceholderText('Search items')).toHaveValue('Bill')
  expect(filterValue('Owner')).toBe('Nick')
  expect(document.querySelector('.budget-v3-month>button:nth-child(2)')).toHaveTextContent(selectedMonth!)
  rerender(<SeededHarness initial={initial} view="month"/>)
  expect(stepTexts(screen.getByRole('region',{name:'Nick steps'}))).toEqual(['Fund Monzo Nick£5.00','Move to Spending from Monzo Nick£10.00Includes £5.00 from Immy'])
})

it('renders only the screen being shown: Plan or Transfers, never both',()=>{
  const initial=seededDocument()
  const {rerender}=render(<SeededHarness initial={initial} view="plan"/>)
  expect(document.getElementById('budget-plan-panel')).toBeInTheDocument()
  expect(document.getElementById('budget-transfers-panel')).toBeNull()
  rerender(<SeededHarness initial={initial} view="month"/>)
  expect(document.getElementById('budget-transfers-panel')).toBeInTheDocument()
  expect(document.getElementById('budget-plan-panel')).toBeNull()
  expect(document.querySelector('.monthly-budget-page>.page-frame-body')).toBeNull()
})

function monthRulesDocument() {
  const initial = seededDocument()
  const item = { id: 'rent', name: 'Rent', categoryId: 'bills', destination: { kind: 'pot' as const, potId: 'p1' }, entryAmountPence: 10000, amountPence: 10000, frequency: 'monthly' as const, funding: 'proportional' as const }
  initial.budget.snapshots = { '2026-11': { items: [item] }, '2027-03': { items: [item] } }
  initial.budget.incomeSources = [
    { id: 'pay', personId: 'nick', name: 'Salary', type: 'employment', baseAmountPence: 200000, changes: { '2027-02': 300000 } },
    { id: 'gift', personId: 'immy', name: 'Gift', type: 'additional', baseAmountPence: 10000, changes: { '2027-01': 20000 } },
  ]
  return initial
}
function MonthRulesHarness({ initial = monthRulesDocument(), month = '2026-12', view = 'plan' }: { initial?: BudgetDocument; month?: string; view?: 'plan' | 'month' }) {
  const [document, setDocument] = useState(initial)
  return <><MonthlyBudget document={document} setDocument={setDocument} month={month} view={view}/><output data-testid="saved-budget">{JSON.stringify(document.budget)}</output></>
}

it.each(['plan', 'month'] as const)('identifies inherited months and hides going back in %s', view => {
  render(<MonthRulesHarness view={view}/>)
  // Only Plan notes a carried-over budget: it's about the items, which Month doesn't show.
  if (view === 'plan') expect(screen.getByText('Using the November 2026 budget')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^(Go back to|Clear) the/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'December 2026' }))
  expect(within(screen.getByRole('dialog', { name: 'Choose budget month' })).queryByRole('button', { name: /^(Go back to|Clear) the/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'December 2026' })[0]!)
  if (view === 'month') { expect(screen.queryByRole('button', { name: 'Plan options' })).not.toBeInTheDocument(); return }
  fireEvent.click(screen.getByRole('button', { name: 'Plan options' }))
  const dialog = screen.getByRole('dialog', { name: 'Plan options' })
  expect(dialog).not.toHaveTextContent('Budget edits apply')
  expect(within(dialog).queryByRole('button', { name: /^(Go back to|Clear) the/ })).not.toBeInTheDocument()
})

it('says nothing under the month when it has its own budget, and offers going back from the month picker', () => {
  render(<MonthRulesHarness month="2027-03"/>)
  expect(screen.queryByText(/^Using the/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Budget set|Income updated/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'March 2027' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Choose budget month' })).getByRole('button', { name: 'Go back to the November 2026 budget' }))
  expect(screen.queryByRole('dialog', { name: 'Choose budget month' })).not.toBeInTheDocument()
  const dialog = screen.getByRole('dialog', { name: 'Go back to the November 2026 budget?' })
  expect(dialog).toHaveTextContent('will use the budget from November 2026.')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Go back to the November 2026 budget' }))
  expect(savedBudget().snapshots['2027-03']).toBeUndefined()
  expect(savedBudget().snapshots['2026-11']).toBeDefined()
})

it('shows scope before full and inline edits and preserves later saved budgets', () => {
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rent' }))
  const form = screen.getByRole('form', { name: 'Edit item' })
  expect(form).toHaveTextContent('Changes apply: December 2026–February 2027.')
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit amount for Rent' }))
  const amount = screen.getByRole('textbox', { name: 'Monthly amount for Rent' })
  expect(amount).toHaveAccessibleDescription('Changes December 2026–February 2027')
  fireEvent.change(amount, { target: { value: '120' } })
  fireEvent.click(within(screen.getByRole('form', { name: 'Quick edit amount for Rent' })).getByRole('button', { name: 'Save' }))
  expect(savedBudget().snapshots['2026-12']?.items[0]?.amountPence).toBe(12000)
  expect(savedBudget().snapshots['2026-11']?.items[0]?.amountPence).toBe(10000)
  expect(savedBudget().snapshots['2027-03']?.items[0]?.amountPence).toBe(10000)
})

it('confirms the exact item-removal range', () => {
  desktop()
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByLabelText('More actions for Rent'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  const dialog = screen.getByRole('dialog', { name: 'Remove Rent?' })
  expect(dialog).toHaveTextContent('Changes apply: December 2026–February 2027.')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove item' }))
  expect(savedBudget().snapshots['2026-12']?.items).toEqual([])
  expect(savedBudget().snapshots['2027-03']?.items).toHaveLength(1)
})

it('explains what replaces a cleared budget, including when there is no previous budget', () => {
  render(<MonthRulesHarness month="2026-11"/>)
  fireEvent.click(screen.getByRole('button', { name: 'Plan options' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Plan options' })).getByRole('button', { name: 'Clear the November 2026 budget' }))
  const dialog = screen.getByRole('dialog', { name: 'Clear the November 2026 budget?' })
  expect(dialog).toHaveTextContent('November 2026–February 2027 will use no budget.')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear the November 2026 budget' }))
  expect(savedBudget().snapshots['2026-11']).toBeUndefined()
  expect(savedBudget().snapshots['2027-03']?.items).toHaveLength(1)
})

it('shows the balance change of a removal directly above its confirm button', () => {
  desktop()
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByLabelText('More actions for Rent'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  const dialog = screen.getByRole('dialog', { name: 'Remove Rent?' })
  const impact = within(dialog).getByRole('region', { name: 'Impact preview' })
  expect(impact).toHaveTextContent('Before removing')
  expect(impact).toHaveTextContent('Changes apply: December 2026–February 2027.')
  expect(impact).toHaveTextContent('£2,000.00 left → £2,100.00 left')
  expect(impact.compareDocumentPosition(within(dialog).getByRole('button', { name: 'Remove item' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('shows the balance change of clearing a month budget', () => {
  render(<MonthRulesHarness month="2026-11"/>)
  fireEvent.click(screen.getByRole('button', { name: 'Plan options' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Plan options' })).getByRole('button', { name: 'Clear the November 2026 budget' }))
  const dialog = screen.getByRole('dialog', { name: 'Clear the November 2026 budget?' })
  const impact = within(dialog).getByRole('region', { name: 'Impact preview' })
  expect(impact).toHaveTextContent('November 2026–February 2027 will use no budget.')
  expect(impact).toHaveTextContent('£2,000.00 left → £2,100.00 left')
})

it('puts the full editor’s scope and impact in the footer, directly above Save', () => {
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rent' }))
  const form = screen.getByRole('form', { name: 'Edit item' })
  const body = form.querySelector<HTMLElement>('.budget-batch-body')!, footer = form.querySelector<HTMLElement>('.budget-batch-footer')!
  expect(body).not.toHaveTextContent('Changes apply')
  expect(footer).toHaveTextContent('Changes apply: December 2026–February 2027.')
  expect(footer).not.toHaveTextContent('1 item')
  fireEvent.change(within(form).getByLabelText('Monthly amount'), { target: { value: '150' } })
  const impact = within(footer).getByRole('region', { name: 'Impact preview' })
  expect(impact).toHaveTextContent('£2,000.00 left → £1,950.00 left')
  expect(within(body).queryByRole('region', { name: 'Impact preview' })).not.toBeInTheDocument()
  expect(impact.compareDocumentPosition(within(footer).getByRole('button', { name: 'Save item' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('distinguishes an inherited empty snapshot from a missing budget', () => {
  const initial = monthRulesDocument()
  initial.budget.snapshots['2026-11'] = { items: [] }
  render(<MonthRulesHarness initial={initial}/>)
  expect(screen.getByText('This budget has no items yet.')).toBeVisible()
  expect(screen.queryByText('There is no budget for this month yet.')).not.toBeInTheDocument()
})

it('does not create a new budget boundary when an inherited amount is left unchanged', () => {
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Edit amount for Rent' }))
  fireEvent.blur(screen.getByRole('textbox', { name: 'Monthly amount for Rent' }))
  expect(Object.keys(savedBudget().snapshots)).toEqual(['2026-11', '2027-03'])
})

it('explains the owner-handled pot movement without changing contribution attribution', () => {
  const initial = monthRulesDocument()
  initial.budget.snapshots['2026-12'] = { items: [{ id: 'personal-pot', name: 'Personal pot funding', categoryId: 'bills', destination: { kind: 'pot', potId: 'p1' }, entryAmountPence: 10001, amountPence: 10001, frequency: 'monthly', funding: 'fixed', contributions: [{ personId: 'nick', amountPence: 3000 }, { personId: 'immy', amountPence: 7001 }] }] }
  render(<MonthRulesHarness initial={initial} view="month"/>)
  // Immy funds £70.01 of Nick's account, but Nick (the owner) makes the whole pot move.
  expect(stepTexts(screen.getByRole('region', { name: 'Immy steps' }))).toEqual(['Fund Monzo Nick£70.01Nick moves it into Spending'])
  expect(stepTexts(screen.getByRole('region', { name: 'Nick steps' }))).toEqual([
    'Fund Monzo Nick£30.00',
    'Move to Spending from Monzo Nick£100.01Includes £70.01 from Immy',
  ])
  // Funding still reconciles to the account total; the pot move is not added on top.
  fireEvent.click(screen.getByRole('button', { name: 'More Month options' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Funding by account' }))
  expect(document.querySelector('.budget-v3-transfer-table tfoot')).toHaveTextContent('£100.01')
})

it('marks missing pot responsibility as needing review and withholds its steps', () => {
  const initial = monthRulesDocument()
  initial.budget.accounts[0]!.ownerPersonIds = []
  render(<MonthRulesHarness initial={initial} view="month"/>)
  const overview = screen.getByRole('region', { name: 'Steps by person' })
  expect(overview.querySelector('ol')).toBeNull()
  const review = within(overview).getByRole('region', { name: 'Needs review' })
  expect(review).toHaveTextContent('Monzo · Needs owner')
  expect(review).toHaveTextContent('Assign an account owner to decide who moves money into its pots.')
  expect(review).not.toHaveTextContent(/moves £/)
})

it.each([
  {sources:[{id:'gift',personId:'nick',name:'Gift',type:'additional' as const,baseAmountPence:5000,changes:{}}],text:'none from salary'},
  {sources:[{id:'job',personId:'nick',name:'Job',type:'employment' as const,baseAmountPence:5000,changes:{}},{id:'gift',personId:'immy',name:'Gift',type:'additional' as const,baseAmountPence:1000,changes:{}}],text:'£50.00 salary + £10.00 other'},
])('explains where available money comes from: $text',({sources,text})=>{
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const initial=seededDocument()
  initial.budget.incomeSources=sources
  render(<SeededHarness initial={initial}/>)
  expect(document.querySelector('.allocation-meter-basis')).toHaveTextContent(text)
})

it('keeps the budget actions in the ⋯ menu, and Month gets neither the meter, the ⋯ nor Add item', () => {
  const { unmount } = render(<SeededHarness initial={seededDocument()}/>)
  const toolbar = document.querySelector<HTMLElement>('.budget-page-titlebar .budget-desktop-toolbar')!
  expect(within(toolbar).getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  expect(within(toolbar).queryByRole('menuitem')).not.toBeInTheDocument()
  fireEvent.click(within(toolbar).getByRole('button', { name: 'More budget options' }))
  expect(within(toolbar).getByRole('menu').textContent).toBe('Edit incomeAccounts, pots & categories')
  fireEvent.keyDown(within(toolbar).getByRole('menu'), { key: 'Escape' })
  expect(within(toolbar).queryByRole('menu')).not.toBeInTheDocument()
  expect(within(toolbar).getByRole('button', { name: 'More budget options' })).toHaveFocus()
  fireEvent.click(within(toolbar).getByRole('button', { name: 'More budget options' }))
  openSettings.mockClear()
  fireEvent.click(within(toolbar).getByRole('menuitem', { name: 'Accounts, pots & categories' }))
  expect(openSettings).toHaveBeenCalledWith('accounts')
  expect(screen.getByRole('region', { name: 'Plan summary' })).toBeInTheDocument()
  unmount()
  render(<SeededHarness initial={seededDocument()} view="month"/>)
  expect(document.querySelector('.budget-page-titlebar')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'More budget options' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'More Month options' }))
  expect(screen.getByRole('menuitem', { name: 'Check balances' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Plan summary' })).not.toBeInTheDocument()
})

it('puts the budget actions in Plan’s ⋯ sheet on phones; save status and the account are on the app header’s account button', () => {
  render(<MonthlyBudget document={seededDocument()} setDocument={vi.fn()} saveStatus="Saving…"/>)
  const trigger = screen.getByRole('button', { name: 'Plan options' })
  expect(trigger.textContent).toBe('')
  fireEvent.click(trigger)
  const sheet = screen.getByRole('dialog', { name: 'Plan options' })
  expect(within(sheet).getAllByRole('button').map(button => button.textContent).filter(Boolean)).toEqual(['Edit income', 'Accounts, pots & categories'])
  expect(within(sheet).queryByText('Saving…')).not.toBeInTheDocument()
})

it('moves the month and ⋯ into the app header on phones, and docks a slim meter once the card scrolls away', () => {
  let report: ((entries: Partial<IntersectionObserverEntry>[]) => void) | undefined
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) { report = callback } observe() {} disconnect() {} })
  const slot = document.createElement('div')
  slot.id = 'mobile-header-page-slot'
  document.body.append(slot)
  try {
    render(<SeededHarness initial={seededDocument()}/>)
    expect(within(slot).getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(within(slot).getByRole('button', { name: 'Plan options' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Previous month' })).toHaveLength(1)
    expect(document.querySelector('.allocation-meter-mini')).toBeNull()
    act(() => report?.([{ isIntersecting: false, boundingClientRect: { bottom: -10 } as DOMRect }]))
    const mini = document.querySelector('.allocation-meter-mini')!
    expect(mini).toHaveAttribute('aria-hidden', 'true')
    expect(mini.querySelector('.allocation-meter-mini-balance')).toHaveTextContent(/^£[\d,.]+ (left|over)$|^Balanced$|^\w+ £[\d,.]+ over$/)
    act(() => report?.([{ isIntersecting: true, boundingClientRect: { bottom: 200 } as DOMRect }]))
    expect(document.querySelector('.allocation-meter-mini')).toBeNull()
  } finally { slot.remove() }
})

it('leads with whoever is over and reviews their items',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.incomeSources=[{id:'nick-job',personId:'nick',name:'Job',type:'employment',baseAmountPence:300000,changes:{}},{id:'other-job',personId:initial.household.adults[1]!.id,name:'Job',type:'employment',baseAmountPence:100000,changes:{}}]
  initial.budget.snapshots[month]={items:[{id:'bill',name:'Bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:150000,amountPence:150000,frequency:'monthly',funding:'single',singleFunderId:'nick'},{id:'treat',name:'Treats',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:400000,amountPence:400000,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial}/>)
  const summary=screen.getByRole('region',{name:'Plan summary'})
  // Figure first: the household balance leads, and Nick's own row says he's over.
  expect(summary.querySelector('.allocation-meter-balance')).toHaveTextContent('£1,500.00 over')
  expect(within(summary).getAllByRole('listitem')[0]).toHaveTextContent('Nick£2,500.00 over')
  fireEvent.click(within(summary).getByRole('button',{name:'Review Nick’s items'}))
  expect(screen.getByRole('button',{name:/^Remove filter: /})).toBeInTheDocument()
})

it('ticks steps off, counts progress in the section and the switch, and untick undoes it',()=>{
  render(<SeededHarness initial={personSwitchDocument()} view="month"/>)
  const choice=screen.getByRole('group',{name:'Whose steps'})
  fireEvent.click(within(choice).getByRole('button',{name:/^Immy/}))
  expect(screen.getByRole('heading',{name:'Payday0 of 2'})).toBeInTheDocument()
  const overview=screen.getByRole('region',{name:'Steps by person'})
  const ticks=within(overview).getAllByRole('button',{name:/ done$/})
  expect(ticks).toHaveLength(2)
  // Copying never ticks.
  fireEvent.click(within(overview).getAllByRole('button',{name:/^Copy /})[0]!)
  expect(ticks[0]).toHaveAttribute('aria-pressed','false')
  fireEvent.click(ticks[0]!)
  expect(ticks[0]).toHaveAttribute('aria-pressed','true')
  expect(screen.getByRole('heading',{name:'Payday1 of 2'})).toBeInTheDocument()
  expect(within(choice).getByRole('button',{name:/^Immy/})).toHaveTextContent('Immy1/2')
  expect(within(overview).getByRole('heading',{level:3})).toHaveTextContent('Immy1 of 2')
  fireEvent.click(ticks[1]!)
  expect(within(choice).getByRole('button',{name:/^Immy/})).toHaveTextContent('Immy✓')
  fireEvent.click(ticks[1]!)
  expect(ticks[1]).toHaveAttribute('aria-pressed','false')
  expect(screen.getByRole('heading',{name:'Payday1 of 2'})).toBeInTheDocument()
})

it('shows a step whose amount changed since it was ticked, copies the difference, and accepts it',()=>{
  const initial=personSwitchDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.ticks={[month]:{'immy:fund:a2':{amountPence:400,at:'2026-11-01T09:00:00.000Z'}}}
  const writeText=vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  render(<SeededHarness initial={initial} view="month"/>)
  fireEvent.click(within(screen.getByRole('group',{name:'Whose steps'})).getByRole('button',{name:/^Immy/}))
  const overview=screen.getByRole('region',{name:'Steps by person'})
  expect(overview).toHaveTextContent('Changed since ticked: you sent £4.00, it’s now £5.00. Send £1.00 more.')
  expect(overview.querySelector('.payday-person-sub')).toHaveTextContent('1 changed since ticked · send £1.00 more')
  expect(screen.getByRole('heading',{name:'Payday0 of 2'})).toBeInTheDocument()
  fireEvent.click(within(overview).getByRole('button',{name:'Copy £1.00'}))
  expect(writeText).toHaveBeenCalledWith('1.00')
  fireEvent.click(within(overview).getByRole('button',{name:/: mark the change done$/}))
  expect(overview).not.toHaveTextContent('Changed since ticked')
  expect(screen.getByRole('heading',{name:'Payday1 of 2'})).toBeInTheDocument()
  Reflect.deleteProperty(navigator,'clipboard')
})

it('says in each person’s line when their steps add up to more than they have available, for everyone under Both',()=>{
  const initial=personSwitchDocument()
  initial.budget.incomeSources=[{id:'n',personId:'nick',name:'Job',type:'employment',baseAmountPence:1000,changes:{}},{id:'i',personId:'immy',name:'Job',type:'employment',baseAmountPence:2000,changes:{}}]
  render(<SeededHarness initial={initial} view="month"/>)
  const subs=()=>[...screen.getByRole('region',{name:'Steps by person'}).querySelectorAll('.payday-person-sub')].map(line=>line.textContent)
  // Both people's lines show, not just the worst one; no bordered warning box.
  expect(subs()).toEqual(['£20.00 from £10.00 available · £10.00 over · Review on Plan','£25.00 from £20.00 available · £5.00 over · Review on Plan'])
  expect(document.querySelector('.transfer-over-warning')).toBeNull()
  fireEvent.click(within(screen.getByRole('region',{name:'Immy steps'})).getByRole('button',{name:'Review on Plan'}))
  fireEvent.click(within(screen.getByRole('group',{name:'Whose steps'})).getByRole('button',{name:/^Nick/}))
  expect(subs()).toEqual(['£20.00 from £10.00 available · £10.00 over · Review on Plan'])
})

it('shows everyone’s steps side by side on desktop, with progress, account bands and a Steps | By account switch',()=>{
  vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
  render(<SeededHarness initial={personSwitchDocument()} view="month"/>)
  expect(screen.queryByRole('group',{name:'Whose steps'})).not.toBeInTheDocument()
  const overview=screen.getByRole('region',{name:'Steps by person'})
  const nick=within(overview).getByRole('region',{name:'Nick steps'})
  expect(within(nick).getByRole('heading',{level:3})).toHaveTextContent('Nick0 of 2 · 1 to fund · 1 move')
  expect(nick).toHaveTextContent('£20.00 from £4,000.00 available')
  expect(nick.querySelector('.step-group-band')).toHaveTextContent('Monzo NickNick’s')
  const ticks=within(overview).getAllByRole('button',{name:/ done$/})
  for(const tick of ticks.slice(0,-1))fireEvent.click(tick)
  expect(within(nick).getByRole('heading',{level:3})).toHaveTextContent('Nick2 of 2')
  expect(screen.getByRole('heading',{name:'Payday3 of 4 done'})).toBeInTheDocument()
  // The last tick folds Payday to one line after Pots; no banner.
  fireEvent.click(ticks.at(-1)!)
  const folded=screen.getByRole('button',{name:/^Payday4 of 4 done · last ticked \w{3} \d+ \w{3}$/})
  expect(folded).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByRole('region',{name:'Steps by person'})).not.toBeInTheDocument()
  expect(screen.queryByText(/up to date/)).toBeNull()
  fireEvent.click(folded)
  expect(screen.getByRole('heading',{name:'Payday4 of 4 done'})).toBeInTheDocument()
  const view=screen.getByRole('group',{name:'Payday view'})
  fireEvent.click(within(view).getByRole('button',{name:'By account'}))
  expect(screen.queryByRole('region',{name:'Steps by person'})).not.toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Funding by account'})).toBeInTheDocument()
  expect(document.querySelector('.budget-v3-transfer-table')).toBeInTheDocument()
  fireEvent.click(within(view).getByRole('button',{name:'Steps'}))
  expect(screen.getByRole('region',{name:'Steps by person'})).toBeInTheDocument()
})

