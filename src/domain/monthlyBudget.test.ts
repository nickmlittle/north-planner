import { expect, it } from 'vitest'
import { addIncomeSource, defaultMonthlyBudget, resolveBudget, resolveIncomeSources, updateBudgetAtMonth, updateIncomeAtMonth, type BudgetItem } from './monthlyBudget'
const item=(id:string,amount=10000):BudgetItem=>({id,name:id,categoryId:'c',entryAmountPence:amount,frequency:'monthly',amountPence:amount,destination:{kind:'account',accountId:'a'},funding:'proportional'})
it('resolves snapshot inheritance and keeps later boundaries independent',()=>{let b=defaultMonthlyBudget();b.categories=[{id:'c',name:'Bills'}];b.accounts=[{id:'a',name:'Bank',ownerPersonIds:['nick']}];b=updateBudgetAtMonth(b,'2026-11',()=>[item('nov',10000)]);b=updateBudgetAtMonth(b,'2027-05',()=>[item('may',30000)]);expect(resolveBudget(b,'2027-01').items[0]?.id).toBe('nov');expect(resolveBudget(b,'2027-01').sourceMonth).toBe('2026-11');b=updateBudgetAtMonth(b,'2027-01',xs=>[...xs,item('jan',5000)]);expect(resolveBudget(b,'2027-02').items.map(x=>x.id)).toEqual(['nov','jan']);expect(resolveBudget(b,'2027-05').items.map(x=>x.id)).toEqual(['may'])})
it('stores intentional empty snapshots and removes a boundary cleanly',()=>{let b=defaultMonthlyBudget();b.categories=[{id:'c',name:'Bills'}];b.accounts=[{id:'a',name:'Bank',ownerPersonIds:[]}];b=updateBudgetAtMonth(b,'2026-11',()=>[item('x')]);b=updateBudgetAtMonth(b,'2027-01',()=>[]);expect(resolveBudget(b,'2027-01').items).toEqual([]);delete b.snapshots['2027-01'];expect(resolveBudget(b,'2027-01').items[0]?.id).toBe('x')})
it('resolves independent income changes without changing budgets',()=>{let b=defaultMonthlyBudget();b.incomeSources=[{id:'job',personId:'nick',name:'Job',type:'employment',baseAmountPence:400000,changes:{}},{id:'parents',personId:'nick',name:'Parents',type:'additional',baseAmountPence:0,changes:{}}];b=updateIncomeAtMonth(b,'2027-01','parents',40000);expect(resolveIncomeSources(b,'2026-12').map(x=>x.amountPence)).toEqual([400000,0]);expect(resolveIncomeSources(b,'2027-01').map(x=>x.amountPence)).toEqual([400000,40000]);expect(Object.keys(b.snapshots)).toEqual([])})

it('distinguishes saved, inherited, missing and imported months including empty budgets', () => {
  let budget = defaultMonthlyBudget()
  expect(resolveBudget(budget, '2026-10')).toMatchObject({ sourceMonth: null, hasExplicitBudget: false, importedBaseline: false, items: [] })
  budget.importedBaseline = [item('legacy')]
  budget = updateBudgetAtMonth(budget, '2026-11', () => [])
  expect(resolveBudget(budget, '2026-10')).toMatchObject({ sourceMonth: null, hasExplicitBudget: false, importedBaseline: true, items: [item('legacy')] })
  expect(resolveBudget(budget, '2026-11')).toMatchObject({ sourceMonth: '2026-11', hasExplicitBudget: true, importedBaseline: false, items: [] })
  expect(resolveBudget(budget, '2026-12')).toMatchObject({ sourceMonth: '2026-11', hasExplicitBudget: false, importedBaseline: false, items: [] })
  delete budget.snapshots['2026-11']
  expect(resolveBudget(budget, '2026-12').items).toEqual([item('legacy')])
})

it('keeps deliberate historical edits within the next whole-budget boundary', () => {
  let budget = defaultMonthlyBudget()
  budget = updateBudgetAtMonth(budget, '2026-11', () => [item('rent')])
  budget = updateBudgetAtMonth(budget, '2027-03', items => [...items, item('holiday')])
  budget = updateBudgetAtMonth(budget, '2026-12', items => items.map(row => ({ ...row, name: 'New rent', entryAmountPence: 12000, amountPence: 12000, funding: 'single', singleFunderId: 'nick', destination: { kind: 'account', accountId: 'new-bank' } })))
  expect(resolveBudget(budget, '2026-11').items).toEqual([item('rent')])
  expect(resolveBudget(budget, '2027-02').items[0]).toMatchObject({ name: 'New rent', amountPence: 12000, singleFunderId: 'nick', destination: { kind: 'account', accountId: 'new-bank' } })
  expect(resolveBudget(budget, '2027-03').items).toEqual([item('rent'), item('holiday')])
})

it('preserves later income changes and start dates when correcting an earlier month', () => {
  let budget = defaultMonthlyBudget()
  budget.incomeSources = [{ id: 'pay', personId: 'nick', name: 'Pay', type: 'employment', baseAmountPence: 100000, baseEffectiveFrom: '2026-11', changes: { '2027-03': 200000 } }]
  budget = updateIncomeAtMonth(budget, '2026-12', 'pay', 0)
  expect(resolveIncomeSources(budget, '2026-10')).toEqual([])
  expect(resolveIncomeSources(budget, '2026-11')[0]?.amountPence).toBe(100000)
  expect(resolveIncomeSources(budget, '2027-02')[0]?.amountPence).toBe(0)
  expect(resolveIncomeSources(budget, '2027-03')[0]?.amountPence).toBe(200000)
  expect(budget.snapshots).toEqual({})
})

it('adds a recurring income source that starts at its month', () => {
  const b = addIncomeSource(defaultMonthlyBudget(), '2026-11', { personId: 'nick', name: 'Pay', type: 'employment', baseAmountPence: 250000 })
  expect(b.incomeSources).toMatchObject([{ personId: 'nick', name: 'Pay', type: 'employment', baseAmountPence: 250000, baseEffectiveFrom: '2026-11', changes: {} }])
  expect(resolveIncomeSources(b, '2026-10')).toEqual([])
  expect(resolveIncomeSources(b, '2027-01').map(x => x.amountPence)).toEqual([250000])
})
