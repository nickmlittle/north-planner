// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { newBudgetDocument, type BudgetDocument } from '../domain/budgetDocument'
import { MonthlyBudget } from './MonthlyBudget'
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
function Harness(){const [document,setDocument]=useState<BudgetDocument>(()=>{const d=newBudgetDocument();d.household={name:'Home',adults:[{id:'nick',name:'Nick'},{id:'immy',name:'Immy'}]};return d});return <MonthlyBudget document={document} setDocument={setDocument}/>}
function createAccountInPicker(form: HTMLElement, owner='Nick', provider='Monzo', nickname='') {
  fireEvent.click(within(form).getByRole('button',{name:owner}))
  fireEvent.click(within(form).getByRole('button',{name:'+ Add account'}))
  fireEvent.change(within(form).getByLabelText('Account type'),{target:{value:'current-account'}})
  fireEvent.change(within(form).getByLabelText('Nickname (optional)'),{target:{value:nickname}})
  fireEvent.change(within(form).getByLabelText('Bank / provider'),{target:{value:provider}})
  fireEvent.click(within(form).getByRole('button',{name:'Continue'}))
}
function addItem(name='Apple TV',amount='8.99',nickname='',funding?:string) {
  fireEvent.click(screen.getAllByRole('button',{name:'Add budget item'})[0]!)
  const dialog=screen.getByRole('form',{name:'Add budget item'})
  fireEvent.change(within(dialog).getByLabelText('Item name'),{target:{value:name}})
  fireEvent.change(within(dialog).getByLabelText('Amount'),{target:{value:amount}})
  fireEvent.change(within(dialog).getByLabelText('New category'),{target:{value:'Subscriptions'}})
  createAccountInPicker(dialog,'Nick','Monzo',nickname)
  fireEvent.click(within(dialog).getByRole('button',{name:'Use account directly'}))
  if(funding)fireEvent.change(within(dialog).getByLabelText('Funding type'),{target:{value:funding}})
  fireEvent.click(within(dialog).getByRole('button',{name:'Save 1 item'}))
  const owner=screen.getByRole('button',{name:/^Nick,/})
  if(owner.getAttribute('aria-expanded')==='false')fireEvent.click(owner)
  const category=document.querySelector<HTMLButtonElement>('.budget-v3-category button')!
  if(category.getAttribute('aria-expanded')==='false')fireEvent.click(category)
}
it('starts with no budget records and adds a categorized item with a staged account',()=>{render(<Harness/>);expect(screen.getByText('There is no budget for this month yet.')).toBeVisible();addItem();expect(screen.getByText('Apple TV')).toBeVisible();expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Nick');expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Subscriptions');expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Nick · Monzo · Current')})
it('keeps mobile Plan headings and funding context in a semantic three-column table',()=>{
  render(<Harness/>)
  addItem()
  const table=screen.getByRole('table',{name:'Budget items by owner and category'})
  expect(within(table).getAllByRole('columnheader').map(header=>header.textContent)).toEqual(['Item','Amount','Actions'])
  expect(within(table).getByRole('rowheader',{name:/Apple TV/})).toHaveTextContent('Destination: Nick · Monzo · Current account')
  expect(table.querySelector('.budget-v3-owner th')).toHaveAttribute('colspan','3')
})
it('shows annual entry frequency and the monthly equivalent',()=>{render(<Harness/>);fireEvent.click(screen.getAllByRole('button',{name:'Add budget item'})[0]!);const dialog=screen.getByRole('form',{name:'Add budget item'});fireEvent.change(within(dialog).getByLabelText('Amount'),{target:{value:'720'}});fireEvent.change(within(dialog).getByLabelText('Frequency'),{target:{value:'annually'}});expect(within(dialog).getByText(/Monthly equivalent:/)).toHaveTextContent('£60.00')})
it('keeps income changes independent from budget snapshots',()=>{render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Edit income'}));const form=screen.getByRole('heading',{name:/Income for/}).closest('form')!;fireEvent.change(within(form).getByLabelText('Source name'),{target:{value:'Parents'}});fireEvent.change(within(form).getByLabelText('Classification'),{target:{value:'additional'}});fireEvent.change(within(form).getByLabelText('Monthly amount'),{target:{value:'400'}});fireEvent.click(within(form).getByRole('button',{name:'Save income'}));fireEvent.click(screen.getAllByText('Income details')[0]!);expect(screen.getAllByText('Additional income').some(node=>node.closest('div')?.textContent?.includes('£400.00'))).toBe(true);expect(screen.queryByText(/Budget set for/)).not.toBeInTheDocument()})
it('searches destination details in flat results with owner and category context',()=>{render(<Harness/>);addItem();fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'Monzo'}});expect(screen.getByRole('button',{name:'Apple TV'})).toBeVisible();expect(document.querySelector('.budget-v3-result-context')).toHaveTextContent('Nick · Subscriptions');expect(screen.getByText('1 matching item · Matching total £8.99')).toBeVisible();expect(document.querySelector('.budget-v3-owner')).not.toBeInTheDocument()})
it('filters by owner and expands or collapses category groups',()=>{render(<Harness/>);addItem();expect(screen.getByText('Apple TV')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:/Subscriptions/}));expect(screen.queryByText('Apple TV')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/Subscriptions/}));fireEvent.change(screen.getByLabelText('Owner'),{target:{value:'Immy'}});expect(screen.queryByText('Apple TV')).not.toBeInTheDocument();expect(screen.getByText(/No items match/)).toBeVisible()})
it('opens at owner level and retains category expansion across collapse, filters and months',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'hierarchy-item',name:'Groceries',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'}]}
  render(<SeededHarness initial={initial}/>)
  expect(screen.getByRole('button',{name:/^Nick,/})).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByRole('button',{name:/^Bills,/})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:/^Nick,/}))
  const category=screen.getByRole('button',{name:/^Bills,/})
  expect(category).toHaveAttribute('aria-expanded','false')
  expect(screen.queryByText('Groceries')).not.toBeInTheDocument()
  fireEvent.click(category)
  expect(screen.getByText('Groceries')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:/^Nick,/}))
  fireEvent.click(screen.getByRole('button',{name:/^Nick,/}))
  expect(screen.getByText('Groceries')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Owner'),{target:{value:'Immy'}})
  fireEvent.change(screen.getByLabelText('Owner'),{target:{value:'All'}})
  fireEvent.click(screen.getByRole('button',{name:/Next month/}))
  fireEvent.click(screen.getByRole('button',{name:/Previous month/}))
  expect(screen.getByText('Groceries')).toBeVisible()
})
it('shows direct search matches and restores the saved group state when cleared',()=>{
  render(<Harness/>);addItem()
  fireEvent.click(screen.getByRole('button',{name:/^Subscriptions,/}))
  expect(screen.queryByText('Apple TV')).not.toBeInTheDocument()
  const search=screen.getByPlaceholderText('Search budget')
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
  const search=screen.getByPlaceholderText('Search budget')
  fireEvent.pointerDown(search)
  fireEvent.change(search,{target:{value:'  Apple TV  '}})
  expect(screen.getByRole('button',{name:'Apple TV'})).toBeVisible()
  fireEvent.change(screen.getByLabelText('Owner'),{target:{value:'Nick'}})
  fireEvent.click(screen.getByRole('button',{name:'Clear search'}))
  expect(search).toHaveValue('')
  expect(screen.getByLabelText('Owner')).toHaveValue('Nick')
  expect(scrollTo).toHaveBeenCalledWith(0,420)
})
it('shows the balance and people and transfers summary',()=>{render(<Harness/>);addItem('Deficit item','10');expect(within(screen.getByRole('region',{name:'Plan summary'})).getByText('£10.00 over budget')).toBeVisible();expect(screen.getByRole('region',{name:'People and transfers'})).toBeVisible();expect(screen.getByText('Monthly plan by person')).toBeVisible();expect(screen.getByText('Transfers by destination')).toBeVisible()})
it('omits the page subtitle and places the page heading before the month selector',()=>{render(<Harness/>);const heading=screen.getByRole('heading',{name:'Budget your month'}),month=screen.getByRole('button',{name:/November|December|January|February|March|April|May|June|July|August|September|October/});expect(screen.queryByText('Plan the items you want to fund and where the money goes.')).not.toBeInTheDocument();expect(heading.compareDocumentPosition(month)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()})
it('confirms removal from the selected budget month',()=>{vi.spyOn(window,'confirm').mockReturnValue(false);render(<Harness/>);addItem();fireEvent.click(screen.getByLabelText('More actions for Apple TV'));fireEvent.click(screen.getByRole('button',{name:'Remove'}));expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Apple TV'));expect(screen.getByText('Apple TV')).toBeVisible()})
it('shows explicit budget and income change markers in the month picker',()=>{render(<Harness/>);addItem('Bill');fireEvent.click(screen.getByRole('button',{name:'November 2026'}));expect(screen.getByRole('dialog',{name:'Choose budget month'})).toBeVisible()})
it('saves a quick amount only after explicit confirmation',()=>{render(<Harness/>);addItem('Phone', '10', '', 'proportional');fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));const form=screen.getByRole('form',{name:'Quick edit amount for Phone'}),input=within(form).getByRole('textbox',{name:'Monthly amount for Phone'});expect(input).toHaveValue('10.00');fireEvent.change(input,{target:{value:'15'}});fireEvent.blur(input);expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£10.00');fireEvent.click(within(form).getByRole('button',{name:'Save'}));expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£15.00');expect(screen.getByText('Amount saved.')).toBeVisible()})
it('cancels and validates quick edits without changing the amount',()=>{render(<Harness/>);addItem('Phone','10','','equal');fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));let form=screen.getByRole('form',{name:'Quick edit amount for Phone'});fireEvent.change(within(form).getByRole('textbox',{name:'Monthly amount for Phone'}),{target:{value:'-1'}});fireEvent.click(within(form).getByRole('button',{name:'Save'}));expect(within(form).getByRole('alert')).toHaveTextContent('£0 or more');fireEvent.click(within(form).getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£10.00');fireEvent.click(screen.getByRole('button',{name:'Edit amount for Phone'}));form=screen.getByRole('form',{name:'Quick edit amount for Phone'});fireEvent.change(within(form).getByRole('textbox',{name:'Monthly amount for Phone'}),{target:{value:'0'}});fireEvent.click(within(form).getByRole('button',{name:'Save'}));expect(screen.getByRole('button',{name:'Edit amount for Phone'})).toHaveTextContent('£0.00')})
it('uses the full editor for annual amounts and fixed contributions',()=>{const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;initial.budget.snapshots[month]={items:[{id:'annual',name:'Annual bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:12000,amountPence:1000,frequency:'annually',funding:'equal'},{id:'fixed',name:'Fixed bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'fixed',contributions:[{personId:'nick',amountPence:1000}]}]};render(<SeededHarness initial={initial}/>);fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'bill'}});expect(screen.queryByRole('button',{name:'Edit amount for Annual bill'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Edit amount for Fixed bill'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Annual bill'}));expect(screen.getByRole('form',{name:'Edit budget item'})).toBeVisible()})
it('opens item editing from the name and dismisses the actions menu with Escape',()=>{
  render(<Harness/>);addItem()
  const menu=screen.getByLabelText('More actions for Apple TV')
  fireEvent.click(menu)
  expect(menu.closest('details')).toHaveAttribute('open')
  fireEvent.keyDown(menu,{key:'Escape'})
  expect(menu.closest('details')).not.toHaveAttribute('open')
  expect(menu).toHaveFocus()
  fireEvent.click(screen.getByRole('button',{name:'Apple TV'}))
  expect(screen.getByRole('form',{name:'Edit budget item'})).toBeVisible()
})
it('keeps compact destination details and opens editing from the row menu',()=>{
  render(<Harness/>);addItem()
  const row=screen.getByRole('button',{name:'Apple TV'}).closest('tr')!
  expect(row.querySelector('.budget-v3-compact-destination')).toHaveTextContent('Nick · Monzo')
  const summary=within(row).getByLabelText('More actions for Apple TV')
  fireEvent.click(summary)
  fireEvent.click(within(summary.closest('details')!).getByRole('button',{name:'Edit'}))
  expect(screen.getByRole('form',{name:'Edit budget item'})).toBeVisible()
})
it('creates an account and its pot with an item in one save',()=>{render(<Harness/>);fireEvent.click(screen.getAllByRole('button',{name:'Add budget item'})[0]!);const form=screen.getByRole('form',{name:'Add budget item'});fireEvent.change(within(form).getByLabelText('Item name'),{target:{value:'Council tax'}});fireEvent.change(within(form).getByLabelText('Amount'),{target:{value:'150'}});fireEvent.change(within(form).getByLabelText('New category'),{target:{value:'Housing'}});createAccountInPicker(form);fireEvent.click(within(form).getByRole('button',{name:'+ Add pot'}));fireEvent.change(within(form).getByLabelText('Pot name'),{target:{value:'Bills'}});fireEvent.click(within(form).getByRole('button',{name:'Use new pot'}));fireEvent.click(within(form).getByRole('button',{name:'Save 1 item'}));fireEvent.click(screen.getByRole('button',{name:/^Nick,/}));fireEvent.click(document.querySelector<HTMLButtonElement>('.budget-v3-category button')!);expect(screen.getByText('Council tax')).toBeVisible();expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Bills · Nick · Monzo · Current')})

it('searches the account type when its stored name is a custom nickname',()=>{render(<Harness/>);addItem('Groceries','100','Everyday');fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'Current account'}});expect(screen.getByText('Groceries')).toBeVisible();expect(document.querySelector('.budget-v3-table')).toHaveTextContent('Nick · Monzo · Current account · Everyday')})

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
function SeededHarness({ initial, view = 'plan' }: { initial: BudgetDocument; view?: 'transfers' | 'plan' }) {
  const [document, setDocument] = useState(initial)
  return <><MonthlyBudget document={document} setDocument={setDocument} mobileBudgetView={view}/><output data-testid="saved-budget">{JSON.stringify(document.budget)}</output></>
}
function savedBudget() { return JSON.parse(screen.getByTestId('saved-budget').textContent!) as BudgetDocument['budget'] }

it('shows grouped destination rows and opens direct and pot breakdowns',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.incomeSources=[{id:'n',personId:'nick',name:'Job',type:'employment',baseAmountPence:400000,changes:{}},{id:'i',personId:'immy',name:'Job',type:'employment',baseAmountPence:200000,changes:{}}]
  initial.budget.snapshots[month]={items:[
    {id:'direct',name:'Direct item',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'},
    {id:'pot-item',name:'Pot item',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:2000,amountPence:2000,frequency:'monthly',funding:'equal'},
    {id:'pot-item-2',name:'Second pot item',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'},
    {id:'single-item',name:'Single funder',categoryId:'bills',destination:{kind:'account',accountId:'a2'},entryAmountPence:500,amountPence:500,frequency:'monthly',funding:'single',singleFunderId:'nick'},
  ]}
  render(<SeededHarness initial={initial} view="transfers"/>)
  const transfers=screen.getByRole('region',{name:'Transfers by account owner'})
  expect(within(transfers).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Nick','Immy'])
  const row=within(transfers).getByRole('button',{name:/Nick · Monzo · Current account/})
  expect(row).toHaveTextContent('Monzo · Current account£40.00')
  expect(row).toHaveTextContent('Nick £20.00 · Immy £20.00')
  expect(row).toHaveTextContent('3 items')
  expect(within(transfers).queryByText('Direct item')).not.toBeInTheDocument()
  expect(screen.getByRole('region',{name:'Transfers summary'})).toHaveTextContent('Funding total£45.00All items allocated')
  expect(document.querySelector('.budget-v3-transfer-table')).toHaveTextContent('Direct to account')
  expect(document.querySelector('.budget-v3-transfer-table')).toHaveTextContent('Spending')
  row.focus();fireEvent.click(row)
  const dialog=screen.getByRole('dialog',{name:'Monzo · Current account'})
  expect(within(dialog).getByRole('region',{name:'Direct to account'})).toHaveTextContent('Direct to account£10.00Nick£5.00Immy£5.00')
  expect(within(dialog).getByRole('region',{name:'Spending'})).toHaveTextContent('Spending£30.00Nick£15.00Immy£15.00')
  expect(dialog).not.toHaveTextContent('Direct item')
  expect(dialog).not.toHaveTextContent('Pot item')
  expect(dialog).not.toHaveTextContent('Second pot item')
  fireEvent.click(within(dialog).getByRole('button',{name:'Back to Transfers'}))
  expect(row).toHaveFocus()
  expect(within(transfers).queryByText('Direct item')).not.toBeInTheDocument()
})

it('keeps the budget title and month selector shared between Transfers and Plan',()=>{
  const initial=seededDocument()
  const {rerender}=render(<SeededHarness initial={initial} view="transfers"/>)
  const title=screen.getByRole('heading',{name:'Budget your month'})
  const selector=document.querySelector('.budget-v3-date-selector')!
  expect(selector).toBeVisible()
  expect(selector.querySelector('.budget-v3-date-context')).toBeVisible()
  rerender(<SeededHarness initial={initial} view="plan"/>)
  expect(screen.getByRole('heading',{name:'Budget your month'})).toBe(title)
  expect(document.querySelector('.budget-v3-date-selector')).toBe(selector)
  expect(selector.querySelector('.budget-v3-date-context')).toBeVisible()
})

it('omits zero contributions only in the overview and preserves them in the breakdown',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.household.adults.push({id:'sam',name:'Sam'})
  initial.budget.snapshots[month]={items:[{id:'single',name:'Solo transfer',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:500,amountPence:500,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial} view="transfers"/>)
  const row=within(screen.getByRole('region',{name:'Transfers by account owner'})).getByRole('button',{name:/Nick · Monzo · Current account/})
  expect(row).toHaveTextContent('Nick £5.00')
  expect(row).not.toHaveTextContent('Immy')
  expect(row).not.toHaveTextContent('Sam')
  fireEvent.click(row)
  const dialog=screen.getByRole('dialog',{name:'Monzo · Current account'})
  expect(dialog).toHaveTextContent('Nick£5.00Immy£0.00Sam£0.00')
  expect(within(dialog).getByRole('region',{name:'Direct to account'})).toHaveTextContent('Nick£5.00Immy£0.00Sam£0.00')
  expect(dialog).not.toHaveTextContent('Solo transfer')
})

it('keeps owner group order, duplicate account suffixes and nonzero pence',()=>{
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
  initial.budget.snapshots[month]={items:initial.budget.accounts.map(account=>({id:`item-${account.id}`,name:account.name,categoryId:'bills',destination:{kind:'account' as const,accountId:account.id},entryAmountPence:1,amountPence:1,frequency:'monthly' as const,funding:'single' as const,singleFunderId:'nick'}))}
  render(<SeededHarness initial={initial} view="transfers"/>)
  const overview=screen.getByRole('region',{name:'Transfers by account owner'})
  expect(within(overview).getAllByRole('heading',{level:3}).map(element=>element.textContent)).toEqual(['Joint','Nick','Immy','Sam','Needs owner'])
  const rows=within(overview).getAllByRole('button')
  expect(rows).toHaveLength(6)
  expect(rows[1]).toHaveTextContent('Monzo · Current account · Everyday (Account 1)')
  expect(rows[2]).toHaveTextContent('Monzo · Current account · Everyday (Account 2)')
  expect(rows[1]).toHaveTextContent('Nick £0.01')
  expect(rows[1]).not.toHaveTextContent('No contribution allocated')
  expect(rows[1]).toHaveAccessibleName(/Nick · Monzo · Current account · Everyday \(Account 1\)/)
})

it('keeps incomplete allocation warnings actionable and distinguishes zero from resolved',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'unresolved',name:'Unfunded',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'proportional'}]}
  render(<SeededHarness initial={initial} view="transfers"/>)
  const warning=document.querySelector<HTMLElement>('.budget-v3-transfer-warning')!
  expect(warning).toHaveTextContent('Unfunded')
  expect(screen.getByRole('region',{name:'Transfers summary'})).toHaveTextContent('Instructions need review')
  const row=within(screen.getByRole('region',{name:'Transfers by account owner'})).getByRole('button',{name:/Nick · Monzo · Current account/})
  expect(row).toHaveTextContent('No contribution allocated')
  expect(row).toHaveTextContent('Account instructions need review')
  fireEvent.click(row)
  const dialog=screen.getByRole('dialog',{name:'Monzo · Current account'})
  expect(dialog).toHaveTextContent('Account instructions need review')
  expect(within(dialog).getByRole('region',{name:'Direct to account'})).toHaveTextContent('£0.00')
  expect(dialog).not.toHaveTextContent('Unfunded')
  fireEvent.click(screen.getByRole('button',{name:'Back to Transfers'}))
  fireEvent.click(within(warning).getByRole('button',{name:'Edit income'}))
  expect(screen.getByRole('heading',{name:/Income for/})).toBeVisible()
  cleanup()
  render(<SeededHarness initial={seededDocument()} view="transfers"/>)
  expect(screen.getByText('No transfers planned')).toBeVisible()
  expect(screen.getByRole('region',{name:'Transfers summary'})).toHaveTextContent('No allocations yet')
})

it('labels a resolved zero allocation without an incomplete warning',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'zero',name:'Zero item',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:0,amountPence:0,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial} view="transfers"/>)
  const row=within(screen.getByRole('region',{name:'Transfers by account owner'})).getByRole('button',{name:/Nick · Monzo · Current account/})
  expect(row).toHaveTextContent('No contribution allocated')
  expect(row).not.toHaveTextContent('Account instructions need review')
})

it('replaces a detail URL and reports when its account is removed',async()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'bill',name:'Bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'}]}
  const dismiss=vi.fn()
  const setDocument=vi.fn()
  const {rerender}=render(<MonthlyBudget document={initial} setDocument={setDocument} mobileBudgetView="transfers" transferAccount="a1" onDismissTransferAccount={dismiss}/>)
  expect(screen.getByRole('dialog',{name:'Monzo · Current account'})).toBeInTheDocument()
  rerender(<MonthlyBudget document={{...initial,budget:{...initial.budget,accounts:initial.budget.accounts.filter(account=>account.id!=='a1')}}} setDocument={setDocument} mobileBudgetView="transfers" transferAccount="a1" onDismissTransferAccount={dismiss}/>)
  expect(screen.queryByRole('dialog',{name:'Monzo · Current account'})).not.toBeInTheDocument()
  await waitFor(()=>expect(dismiss).toHaveBeenCalledOnce())
  expect(screen.getByText('Destination is no longer available')).toBeVisible()
})

it('keeps a large destination at pot summary level',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:Array.from({length:23},(_,index)=>({id:`item-${index}`,name:`Budget item ${index+1}`,categoryId:'bills',destination:{kind:'pot' as const,potId:'p1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly' as const,funding:'equal' as const}))}
  render(<SeededHarness initial={initial} view="transfers"/>)
  const overview=screen.getByRole('region',{name:'Transfers by account owner'})
  const row=within(overview).getByRole('button',{name:/Nick · Monzo · Current account/})
  expect(row).toHaveTextContent('23 items')
  fireEvent.click(row)
  const detail=screen.getByRole('dialog',{name:'Monzo · Current account'})
  expect(within(detail).getByRole('region',{name:'Spending'})).toHaveTextContent('£230.00')
  expect(detail).not.toHaveTextContent('Budget item 1')
  expect(within(overview).getByRole('button',{name:/Nick · Monzo · Current account/})).toBe(row)
})

it('navigates an existing account and pot and saves the selected stable pot ID', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Groceries' } })
  fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '120' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Spending' }))
  expect(within(form).getByText(/Nick · Monzo · Current account · Spending/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save 1 item' }))
  const items = Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)
  expect(items).toHaveLength(1)
  expect(items[0]!.destination).toEqual({ kind: 'pot', potId: 'p1' })
  expect(items[0]).toMatchObject({ funding: 'single', singleFunderId: 'nick' })
  expect(savedBudget().pots).toHaveLength(1)
})

it('requires a new explicit destination after changing branches while keeping other item fields', () => {
  const initial = seededDocument()
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month] = { items: [{ id: 'item1', name: 'Groceries', categoryId: 'bills', destination: { kind: 'pot', potId: 'p1' }, entryAmountPence: 12000, amountPence: 12000, frequency: 'monthly', funding: 'equal' }] }
  render(<SeededHarness initial={initial}/>)
  fireEvent.click(screen.getByRole('button', { name: /^Nick,/ }))
  fireEvent.click(document.querySelector<HTMLButtonElement>('.budget-v3-category button')!)
  fireEvent.click(screen.getByRole('button', { name: 'Groceries' }))
  const form = screen.getByRole('form', { name: 'Edit budget item' })
  expect(within(form).getByText(/Nick · Monzo · Current account · Spending/)).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Change' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Owners' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Immy' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Nationwide · Mortgage' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(within(form).getByRole('alert')).toHaveTextContent('Choose an account or pot destination.')
  expect(within(form).getByLabelText('Item name')).toHaveValue('Groceries')
  expect(within(form).getByLabelText('Amount')).toHaveValue('120.00')
  expect(within(form).getByLabelText('Funding type')).toHaveValue('equal')
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save item' }))
  expect(savedBudget().snapshots[month]!.items[0]!.destination).toEqual({ kind: 'account', accountId: 'a2' })
  expect(savedBudget().snapshots[month]!.items[0]!.funding).toBe('equal')
})

it('does not persist a staged account or pot when the item is cancelled', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
  createAccountInPicker(form, 'Nick', 'Starling')
  fireEvent.click(within(form).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(form).getByLabelText('Pot name'), { target: { value: 'Holiday' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Use new pot' }))
  expect(savedBudget().accounts).toHaveLength(2)
  expect(savedBudget().pots).toHaveLength(1)
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(savedBudget().accounts).toHaveLength(2)
  expect(savedBudget().pots).toHaveLength(1)
})

it('creates a pot under an existing account only when the item is saved', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Fuel' } })
  fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '50' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: '+ Add pot' }))
  fireEvent.change(within(form).getByLabelText('Pot name'), { target: { value: ' Fuel ' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Use new pot' }))
  expect(savedBudget().pots).toHaveLength(1)
  fireEvent.click(within(form).getByRole('button', { name: 'Save 1 item' }))
  expect(savedBudget().pots).toHaveLength(2)
  expect(savedBudget().pots[1]!.name).toBe('Fuel')
  expect(savedBudget().pots[1]!.accountId).toBe('a1')
  expect(Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)[0]!.destination).toEqual({ kind: 'pot', potId: savedBudget().pots[1]!.id })
})

function openSeededEditor() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Monzo · Current account' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  return form
}
function fillRow(form: HTMLElement, index: number, name: string, amount: string) {
  const row = within(form).getByRole('row', { name: `Item ${index}` })
  fireEvent.change(within(row).getByLabelText('Item name'), { target: { value: name } })
  fireEvent.change(within(row).getByLabelText('Amount'), { target: { value: amount } })
  return row
}

it('prioritises name, amount, destination and funding in the single-item editor', () => {
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'item1',name:'Groceries',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'}]}
  render(<SeededHarness initial={initial}/>)
  fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'Groceries'}})
  fireEvent.click(screen.getByRole('button',{name:'Groceries'}))
  const form=screen.getByRole('form',{name:'Edit budget item'}),details=form.querySelector<HTMLDetailsElement>('.budget-single-details')!
  expect(details.open).toBe(false)
  expect(within(form).getByLabelText('Item name')).toHaveValue('Groceries')
  expect(within(form).getByLabelText('Amount')).toHaveValue('120.00')
  expect(within(form).getByText('Estimated monthly contributions')).toBeVisible()
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
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
  expect(within(invalid).getByLabelText('Amount')).toHaveFocus()
  expect(savedBudget().snapshots).toEqual({})
  fireEvent.change(within(invalid).getByLabelText('Amount'), { target: { value: '20' } })
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
  expect(within(remaining).getByLabelText('Amount')).toHaveValue('35')
  expect(within(remaining).getByLabelText('Person')).toHaveValue('immy')
  fireEvent.click(within(form).getByRole('button', { name: 'Save 1 item' }))
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
  fireEvent.change(within(row).getByLabelText('Amount'), { target: { value: '120' } })
  fireEvent.change(within(row).getByLabelText('Frequency'), { target: { value: 'annually' } })
  expect(within(row).getByLabelText('Annual amount')).toHaveValue('120')
  fireEvent.change(within(row).getByLabelText('Nick monthly contribution'), { target: { value: '3' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save 1 item' }))
  expect(within(row).getByRole('alert')).toHaveTextContent('Monthly contributions must total £10.00.')
  expect(within(row).getByText('£7.00 left to allocate')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Immy monthly contribution'), { target: { value: '7' } })
  expect(within(row).getByText('£0.00 left to allocate')).toBeVisible()
  fireEvent.change(within(row).getByLabelText('Frequency'), { target: { value: 'monthly' } })
  fireEvent.change(within(row).getByLabelText('Amount'), { target: { value: '10.01' } })
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'custom' } })
  fireEvent.change(within(row).getByLabelText('Nick relative weight'), { target: { value: '1' } })
  fireEvent.change(within(row).getByLabelText('Immy relative weight'), { target: { value: '2' } })
  expect(within(row).getByText('£3.34')).toBeVisible()
  expect(within(row).getByText('£6.67')).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save 1 item' }))
  expect(Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)[0]).toMatchObject({ funding: 'custom', customShares: { nick: 1, immy: 2 } })
})

it('shows missing income without blocking an income-ratio item from saving', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  const form = openSeededEditor()
  const row = fillRow(form, 1, 'No income yet', '10')
  fireEvent.change(within(row).getByLabelText('Funding type'), { target: { value: 'proportional' } })
  expect(within(row).getByText('Add employment income to calculate')).toBeVisible()
  fireEvent.click(within(form).getByRole('button', { name: 'Save 1 item' }))
  fireEvent.click(screen.getByRole('button', { name: /^Nick,/ }))
  fireEvent.click(document.querySelector<HTMLButtonElement>('.budget-v3-category button')!)
  expect(screen.getByText('No income yet')).toBeVisible()
})

it('protects changed drafts through Cancel, backdrop and Escape, then restores focus on discard', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SeededHarness initial={seededDocument()}/>)
  const trigger = screen.getAllByRole('button', { name: 'Add budget item' })[0]!
  trigger.focus()
  fireEvent.click(trigger)
  const form = screen.getByRole('form', { name: 'Add budget item' })
  fireEvent.change(within(form).getByLabelText('Item name'), { target: { value: 'Draft' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(form).toBeInTheDocument()
  fireEvent.mouseDown(document.querySelector('.budget-batch-overlay')!)
  expect(confirm).toHaveBeenCalledTimes(2)
  fireEvent.keyDown(within(form).getByLabelText('Item name'), { key: 'Escape' })
  expect(confirm).toHaveBeenCalledTimes(3)
  expect(form).toBeInTheDocument()
  confirm.mockReturnValue(true)
  fireEvent.keyDown(within(form).getByLabelText('Item name'), { key: 'Escape' })
  expect(form).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(savedBudget().snapshots).toEqual({})
})

it('protects unfinished inline destination details and traps Tab within the dialog', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
  fireEvent.click(within(form).getByRole('button', { name: 'Nick' }))
  fireEvent.click(within(form).getByRole('button', { name: '+ Add account' }))
  fireEvent.change(within(form).getByLabelText('Bank / provider'), { target: { value: 'Unfinished bank' } })
  const save = within(form).getByRole('button', { name: 'Save 0 items' })
  save.focus()
  fireEvent.keyDown(save, { key: 'Tab' })
  expect(within(form).getByLabelText('Category')).toHaveFocus()
  fireEvent.keyDown(within(form).getByLabelText('Category'), { key: 'Tab', shiftKey: true })
  expect(save).toHaveFocus()
  fireEvent.keyDown(save, { key: 'Escape' })
  expect(confirm).toHaveBeenCalledWith('Discard unsaved budget items?')
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
  expect(within(form).getByRole('alert')).toHaveTextContent('Choose an account or pot destination.')
  expect(within(within(form).getByRole('row', { name: 'Item 2' })).getByLabelText('Amount')).toHaveValue('24')
  fireEvent.click(within(form).getByRole('button', { name: 'Use account directly' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save 2 items' }))
  const items = Object.values(savedBudget().snapshots).flatMap(snapshot => snapshot.items)
  expect(items.map(item => item.name)).toEqual(['First', 'Second'])
  expect(items.every(item => item.categoryId === 'subscriptions' && item.destination.kind === 'account' && item.destination.accountId === 'a2')).toBe(true)
})

it('defaults a personal account and additional rows to its owner rather than the first household member', () => {
  render(<SeededHarness initial={seededDocument()}/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Add budget item' })[0]!)
  const form = screen.getByRole('form', { name: 'Add budget item' })
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


it('keeps a single operable sticky group context as boundaries cross and results change', async () => {
  const initial=seededDocument()
  const month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'sticky-item',name:'Groceries',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'}]}
  render(<SeededHarness initial={initial}/>)
  fireEvent.click(screen.getByRole('button',{name:/^Nick,/}))
  fireEvent.click(document.querySelector<HTMLButtonElement>('.budget-v3-category button')!)
  const wrap=document.querySelector<HTMLDivElement>('.budget-v3-table-wrap')!
  wrap.style.overflowY='auto'
  const rect=(top:number,bottom:number,height=bottom-top)=>({top,bottom,height,left:0,right:800,width:800,x:0,y:top,toJSON:()=>({})})
  vi.spyOn(wrap,'getBoundingClientRect').mockImplementation(()=>rect(100,500))
  vi.spyOn(wrap.querySelector('thead')!,'getBoundingClientRect').mockImplementation(()=>rect(100,130))
  const owner=wrap.querySelector<HTMLElement>('[data-budget-group="owner"]')!
  const category=wrap.querySelector<HTMLElement>('[data-budget-group="category"]')!
  let ownerTop=140,categoryTop=180
  vi.spyOn(owner,'getBoundingClientRect').mockImplementation(()=>rect(ownerTop,ownerTop+32))
  vi.spyOn(category,'getBoundingClientRect').mockImplementation(()=>rect(categoryTop,categoryTop+32))
  ownerTop=120;categoryTop=200
  fireEvent.scroll(wrap)
  await waitFor(()=>expect(wrap.querySelector('.budget-v3-sticky-owner')).toBeInTheDocument())
  expect(wrap.querySelector('.budget-v3-sticky-category')).not.toBeInTheDocument()
  categoryTop=150
  fireEvent.scroll(wrap)
  await waitFor(()=>expect(wrap.querySelector('.budget-v3-sticky-category')).toHaveTextContent('Bills'))
  expect(screen.getAllByRole('button',{name:/Bills, 1 items/})).toHaveLength(1)
  const sticky=within(wrap.querySelector<HTMLElement>('.budget-v3-sticky-category')!).getByRole('button')
  sticky.focus()
  categoryTop=200;ownerTop=140
  fireEvent.scroll(wrap)
  await waitFor(()=>expect(sticky).not.toBeInTheDocument())
  expect(within(category).getByRole('button')).toHaveFocus()
  ownerTop=120
  fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'Groceries'}})
  await waitFor(()=>expect(wrap.querySelector('.budget-v3-sticky-owner')).not.toBeInTheDocument())
  expect(screen.getByText('1 matching item · Matching total £120.00')).toBeVisible()
  fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'no match'}})
  expect(screen.getByText(/No items match/)).toBeVisible()
  expect(document.querySelector('.budget-v3-sticky-context')).not.toBeInTheDocument()
})

it.each([
  {income:2000,text:'£10.00 left to allocate'},
  {income:1000,text:'Budget balanced'},
  {income:0,text:'£10.00 over budget'},
])('leads the mobile Plan summary with $text',({income,text})=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.incomeSources=[{id:'job',personId:'nick',name:'Job',type:'employment',baseAmountPence:income,changes:{}}]
  initial.budget.snapshots[month]={items:[{id:'bill',name:'Bill',categoryId:'bills',destination:{kind:'account',accountId:'a1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'single',singleFunderId:'nick'}]}
  render(<SeededHarness initial={initial}/>)
  const summary=screen.getByRole('region',{name:'Plan summary'})
  expect(summary).toHaveTextContent(text)
  expect(summary).toHaveTextContent('Available income')
  expect(summary).not.toHaveTextContent('Employment split basis')
  const trigger=within(summary).getByRole('button',{name:'Plan summary details'})
  trigger.focus();fireEvent.click(trigger)
  const dialog=screen.getByRole('dialog',{name:'Plan summary details'})
  expect(dialog).toHaveTextContent('Employment split basis')
  expect(dialog).toHaveTextContent('Additional income increases available money')
  expect(within(dialog).getByRole('button',{name:'Close dialog'})).toHaveFocus()
  fireEvent.keyDown(dialog,{key:'Escape'})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('shows mobile items under combined owner and category headers and filters them',()=>{
  vi.stubGlobal('matchMedia',vi.fn().mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.categories.push({id:'other',name:'Other'})
  initial.budget.snapshots[month]={items:[
    {id:'food',name:'Groceries',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:12000,amountPence:12000,frequency:'monthly',funding:'equal'},
    {id:'home',name:'Mortgage',categoryId:'bills',destination:{kind:'account',accountId:'a2'},entryAmountPence:80000,amountPence:80000,frequency:'monthly',funding:'equal'},
  ]}
  render(<SeededHarness initial={initial}/>)
  const table=screen.getByRole('table',{name:'Budget items by owner and category'})
  expect(within(table).getByRole('button',{name:'Groceries'})).toBeVisible()
  expect(within(table).getByRole('button',{name:'Mortgage'})).toBeVisible()
  expect(table.querySelectorAll('.budget-v3-compact-group')).toHaveLength(2)
  expect(table).toHaveTextContent('Nick · Bills')
  fireEvent.change(screen.getByLabelText('Owner'),{target:{value:'Immy'}})
  expect(within(table).queryByRole('button',{name:'Groceries'})).not.toBeInTheDocument()
  expect(within(table).getByRole('button',{name:'Mortgage'})).toBeVisible()
  fireEvent.change(screen.getByLabelText('Category'),{target:{value:'other'}})
  expect(screen.getByText(/No items match/)).toBeVisible()
})

it('keeps month options keyboard focus contained and preserves a budget when removal is cancelled',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[]}
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<SeededHarness initial={initial}/>)
  const trigger=screen.getByRole('button',{name:'Month options'})
  trigger.focus();fireEvent.click(trigger)
  const dialog=screen.getByRole('dialog',{name:'Month options'})
  const close=within(dialog).getByRole('button',{name:'Close dialog'}),remove=within(dialog).getByRole('button',{name:'Remove budget date'})
  expect(close).toHaveFocus()
  fireEvent.keyDown(close,{key:'Tab',shiftKey:true})
  expect(remove).toHaveFocus()
  fireEvent.keyDown(remove,{key:'Tab'})
  expect(close).toHaveFocus()
  fireEvent.click(remove)
  expect(confirm).toHaveBeenCalled()
  expect(savedBudget().snapshots[month]).toBeDefined()
  expect(screen.queryByRole('dialog',{name:'Month options'})).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('hands off from month options to income and management and restores focus',()=>{
  render(<SeededHarness initial={seededDocument()} view="transfers"/>)
  const trigger=screen.getByRole('button',{name:'Month options'})
  trigger.focus();fireEvent.click(trigger)
  let dialog=screen.getByRole('dialog',{name:'Month options'})
  expect(within(dialog).queryByRole('button',{name:'Remove budget date'})).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button',{name:'Edit income'}))
  expect(screen.queryByRole('dialog',{name:'Month options'})).not.toBeInTheDocument()
  const form=screen.getByRole('heading',{name:/Income for/}).closest('form')!
  expect(form).toContainElement(document.activeElement as HTMLElement)
  expect(form.closest('.page-frame-body')).toBeNull()
  fireEvent.click(within(form).getByRole('button',{name:'Cancel'}))
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  dialog=screen.getByRole('dialog',{name:'Month options'})
  fireEvent.click(within(dialog).getByRole('button',{name:'Manage accounts, pots & categories'}))
  expect(screen.queryByRole('dialog',{name:'Month options'})).not.toBeInTheDocument()
  const management=screen.getByRole('dialog',{name:'Manage accounts, pots and categories'})
  expect(management).toContainElement(document.activeElement as HTMLElement)
  fireEvent.click(within(management).getByRole('button',{name:'Done'}))
  expect(trigger).toHaveFocus()
})

it('preserves month, search and owner when switching views',()=>{
  const initial=seededDocument(),month=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
  initial.budget.snapshots[month]={items:[{id:'bill',name:'Bill',categoryId:'bills',destination:{kind:'pot',potId:'p1'},entryAmountPence:1000,amountPence:1000,frequency:'monthly',funding:'equal'}]}
  const {rerender}=render(<SeededHarness initial={initial} view="plan"/>)
  fireEvent.click(screen.getByRole('button',{name:'Next month'}))
  const selectedMonth=document.querySelector('.budget-v3-month>button:nth-child(2)')!.textContent
  fireEvent.change(screen.getByPlaceholderText('Search budget'),{target:{value:'Bill'}})
  fireEvent.change(screen.getByLabelText('Owner'),{target:{value:'Nick'}})
  rerender(<SeededHarness initial={initial} view="transfers"/>)
  const row=within(screen.getByRole('region',{name:'Transfers by account owner'})).getByRole('button',{name:/Nick · Monzo · Current account/})
  expect(row).toHaveTextContent('Nick £5.00 · Immy £5.00')
  const trigger=screen.getByRole('button',{name:'Transfers summary details'})
  trigger.focus();fireEvent.click(trigger)
  const dialog=screen.getByRole('dialog',{name:'Transfers summary details'})
  expect(dialog).toHaveTextContent('Destination accounts1')
  expect(dialog).toHaveTextContent('account funding requirements')
  expect(dialog).toHaveTextContent('exact pennies')
  fireEvent.click(within(dialog).getByRole('button',{name:'Close dialog'}))
  expect(trigger).toHaveFocus()
  rerender(<SeededHarness initial={initial} view="plan"/>)
  expect(screen.getByPlaceholderText('Search budget')).toHaveValue('Bill')
  expect(screen.getByLabelText('Owner')).toHaveValue('Nick')
  expect(document.querySelector('.budget-v3-month>button:nth-child(2)')).toHaveTextContent(selectedMonth!)
  rerender(<SeededHarness initial={initial} view="transfers"/>)
  expect(within(screen.getByRole('region',{name:'Transfers by account owner'})).getByRole('button',{name:/Nick · Monzo · Current account/})).toBe(row)
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
function MonthRulesHarness({ initial = monthRulesDocument(), month = '2026-12', view = 'plan' }: { initial?: BudgetDocument; month?: string; view?: 'plan' | 'transfers' }) {
  const [document, setDocument] = useState(initial)
  return <><MonthlyBudget document={document} setDocument={setDocument} month={month} mobileBudgetView={view}/><output data-testid="saved-budget">{JSON.stringify(document.budget)}</output></>
}

it.each(['plan', 'transfers'] as const)('identifies inherited months and hides date removal in %s', view => {
  render(<MonthRulesHarness view={view}/>)
  expect(screen.getAllByText('Using budget from November 2026').length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Remove budget date' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Month options' }))
  const dialog = screen.getByRole('dialog', { name: 'Month options' })
  expect(dialog).toHaveTextContent('Budget edits apply: December 2026–February 2027.')
  expect(within(dialog).queryByRole('button', { name: 'Remove budget date' })).not.toBeInTheDocument()
})

it('shows scope before full and inline edits and preserves later saved budgets', () => {
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rent' }))
  const form = screen.getByRole('form', { name: 'Edit budget item' })
  expect(form).toHaveTextContent('Changes apply: December 2026–February 2027.')
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit amount for Rent' }))
  const amount = screen.getByRole('textbox', { name: 'Monthly amount for Rent' })
  expect(amount).toHaveAccessibleDescription('Changes apply: December 2026–February 2027.')
  fireEvent.change(amount, { target: { value: '120' } })
  fireEvent.click(within(screen.getByRole('form', { name: 'Quick edit amount for Rent' })).getByRole('button', { name: 'Save' }))
  expect(savedBudget().snapshots['2026-12']?.items[0]?.amountPence).toBe(12000)
  expect(savedBudget().snapshots['2026-11']?.items[0]?.amountPence).toBe(10000)
  expect(savedBudget().snapshots['2027-03']?.items[0]?.amountPence).toBe(10000)
})

it('confirms the exact item-removal range', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MonthRulesHarness/>)
  fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByLabelText('More actions for Rent'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(confirm).toHaveBeenCalledWith('Remove “Rent” from the budget? Changes apply: December 2026–February 2027. Later saved budgets stay unchanged.')
  expect(savedBudget().snapshots['2026-12']?.items).toEqual([])
  expect(savedBudget().snapshots['2027-03']?.items).toHaveLength(1)
})

it('explains what replaces a removed budget date, including when there is no previous budget', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MonthRulesHarness month="2026-11"/>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove budget date' })[0]!)
  expect(confirm).toHaveBeenCalledWith('Remove the November 2026 budget date? November 2026–February 2027 will use no budget. Later saved budgets stay unchanged.')
  expect(savedBudget().snapshots['2026-11']).toBeUndefined()
  expect(savedBudget().snapshots['2027-03']?.items).toHaveLength(1)
})

it('shows independent source scopes and clears income drafts between editing sessions', () => {
  render(<MonthRulesHarness/>)
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  let pay = screen.getByLabelText('Nick · Salary (employment)')
  expect(pay).toHaveAccessibleDescription('Changes apply: December 2026–January 2027.')
  expect(screen.getByLabelText('Immy · Gift (additional)')).toHaveAccessibleDescription('Changes apply: December 2026.')
  expect(screen.getByText('New income applies: December 2026 onward.')).toBeVisible()
  fireEvent.change(pay, { target: { value: '2200' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit income' }))
  pay = screen.getByLabelText('Nick · Salary (employment)')
  expect(pay).toHaveValue('2000.00')
  fireEvent.change(pay, { target: { value: '2300' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save income' }))
  expect(savedBudget().incomeSources[0]?.changes).toEqual({ '2026-12': 230000, '2027-02': 300000 })
  expect(savedBudget().incomeSources[1]?.changes).toEqual({ '2027-01': 20000 })
  expect(Object.keys(savedBudget().snapshots)).toEqual(['2026-11', '2027-03'])
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
  fireEvent.change(screen.getByPlaceholderText('Search budget'), { target: { value: 'Rent' } })
  fireEvent.click(screen.getByRole('button', { name: 'Edit amount for Rent' }))
  fireEvent.blur(screen.getByRole('textbox', { name: 'Monthly amount for Rent' }))
  expect(Object.keys(savedBudget().snapshots)).toEqual(['2026-11', '2027-03'])
})

it('explains the owner-handled pot movement without changing contribution attribution', () => {
  const initial = monthRulesDocument()
  initial.budget.snapshots['2026-12'] = { items: [{ id: 'personal-pot', name: 'Personal pot funding', categoryId: 'bills', destination: { kind: 'pot', potId: 'p1' }, entryAmountPence: 10001, amountPence: 10001, frequency: 'monthly', funding: 'fixed', contributions: [{ personId: 'nick', amountPence: 3000 }, { personId: 'immy', amountPence: 7001 }] }] }
  render(<MonthRulesHarness initial={initial} view="transfers"/>)
  const overview = screen.getByRole('region', { name: 'Transfers by account owner' })
  const account = within(overview).getByRole('button', { name: /Nick · Monzo/ })
  expect(account).toHaveTextContent('Nick £30.00 · Immy £70.01')
  fireEvent.click(account)
  const dialog = screen.getByRole('dialog', { name: 'Monzo · Current account' })
  expect(dialog).toHaveTextContent('Funding total£100.01')
  expect(dialog).toHaveTextContent('After account funding: Nick moves £100.01 into this pot.')
  expect(dialog).not.toHaveTextContent('Immy moves')
  expect(dialog).toHaveTextContent('not an extra contribution')
  expect(dialog).toHaveTextContent('money already in the account may not need transferring')
})

it('marks missing pot responsibility as needing review and withholds movement wording', () => {
  const initial = monthRulesDocument()
  initial.budget.accounts[0]!.ownerPersonIds = []
  render(<MonthRulesHarness initial={initial} view="transfers"/>)
  expect(screen.getByRole('region', { name: 'Transfers summary' })).toHaveTextContent('Instructions need review')
  const overview = screen.getByRole('region', { name: 'Transfers by account owner' })
  const account = within(overview).getByRole('button', { name: /Needs owner · Monzo/ })
  expect(account).toHaveTextContent('Account instructions need review')
  fireEvent.click(account)
  const dialog = screen.getByRole('dialog', { name: 'Monzo · Current account' })
  expect(dialog).toHaveTextContent('Assign an account owner to determine who moves money into pots.')
  expect(dialog).not.toHaveTextContent('After account funding:')
})
