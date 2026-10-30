import { describe, expect, it } from 'vitest'
import { defaultMonthlyBudget, migrateMonthlyBudget, monthlyContributionPence, resolveMonthBudget, updateMonthBudget, validMonthlyBudget } from './monthlyBudget'
import { budgetTransfers } from './budgetTransfers'

describe('monthly budget', () => {
  it('sweeps income above the chosen lifestyle amount into savings', () => {
    const budget = defaultMonthlyBudget()
    budget.incomes = [{ personId: 'nick', monthlyNetPence: 700000, mode: 'live-on', liveOnPence: 455000, surplusPotId: 'nick-isa' }]
    budget.lines = [{ id: 'rent', category: 'Other Living Expenses', ownerName: 'Joint', name: 'Rent', entryAmountPence: 120000, frequency: 'monthly', amountPence: 120000, potId: 'bills', funding: 'proportional' }]
    expect(budgetTransfers(budget, ['nick'])).toMatchObject({ spendablePence: 455000, plannedPence: 120000, surplusPence: 245000, remainingPence: 335000, pots: [{ potId: 'bills', amountPence: 120000 }, { potId: 'nick-isa', amountPence: 245000 }] })
  })
  it('splits pounds proportionally in whole pennies with no lost remainder', () => {
    const budget = defaultMonthlyBudget()
    budget.incomes = [{ personId: 'a', monthlyNetPence: 20000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'nick-isa' }, { personId: 'b', monthlyNetPence: 10000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'immy-isa' }]
    budget.lines = [{ id: 'x', category: 'Other Living Expenses', ownerName: 'Joint', name: 'x', entryAmountPence: 10001, frequency: 'monthly', amountPence: 10001, potId: 'bills', funding: 'proportional' }]
    expect(budgetTransfers(budget, ['a', 'b']).people.map(p => p.pots[0]!.amountPence)).toEqual([6667, 3334])
  })
  it('keeps month overrides separate from the recurring template', () => {
    const budget = defaultMonthlyBudget(); budget.lines = [{ id: 'rent', category: 'Other Living Expenses', ownerName: 'Joint', name: 'Rent', entryAmountPence: 100000, frequency: 'monthly', amountPence: 100000, potId: 'bills', funding: 'equal' }]
    const changed = updateMonthBudget(budget, '2026-11', current => ({ ...current, lines: current.lines.map(line => ({ ...line, entryAmountPence: 110000, amountPence: 110000 })) }))
    expect(resolveMonthBudget(changed, '2026-10').lines[0]!.amountPence).toBe(100000)
    expect(resolveMonthBudget(changed, '2026-11').lines[0]!.amountPence).toBe(110000)
  })
  it('turns annual bills into monthly savings contributions, rounding to the nearest penny', () => {
    expect(monthlyContributionPence(72000, 'annually')).toBe(6000)
    expect(monthlyContributionPence(1001, 'annually')).toBe(83)
    const budget = defaultMonthlyBudget()
    budget.incomes = [{ personId: 'nick', monthlyNetPence: 100000, mode: 'all-income', liveOnPence: 0, surplusPotId: 'nick-isa' }]
    budget.lines = [{ id: 'insurance', category: 'Other Living Expenses', ownerName: 'Joint', name: 'Car insurance', entryAmountPence: 72000, frequency: 'annually', amountPence: monthlyContributionPence(72000, 'annually'), potId: 'bills', funding: 'equal' }]
    expect(budgetTransfers(budget, ['nick'])).toMatchObject({ plannedPence: 6000, pots: [{ potId: 'bills', amountPence: 6000 }] })
  })
  it('migrates existing budget rows to monthly uncategorised rows without changing their transfer amount', () => {
    const migrated = migrateMonthlyBudget({ ...defaultMonthlyBudget(), categories: undefined, lines: [{ id: 'legacy', name: 'Old item', amountPence: 12345, potId: 'bills', funding: 'proportional' }] }) as ReturnType<typeof defaultMonthlyBudget>
    expect(migrated.lines[0]).toMatchObject({ category: 'Uncategorised', ownerName: 'Joint', entryAmountPence: 12345, frequency: 'monthly', amountPence: 12345 })
    expect(migrated.categories).toContain('Uncategorised')
    expect(validMonthlyBudget(migrated)).toBe(true)
  })
  it('migrates legacy destination groups into reviewable master accounts', () => {
    const legacy = defaultMonthlyBudget()
    delete legacy.accounts
    delete legacy.accountsReviewed
    legacy.pots = legacy.pots.map(pot => { const copy = { ...pot }; delete copy.accountId; return copy })
    const migrated = migrateMonthlyBudget(legacy) as ReturnType<typeof defaultMonthlyBudget>
    expect(migrated.accountsReviewed).toBe(false)
    expect(migrated.accounts?.length).toBeGreaterThan(0)
    expect(migrated.pots.every(pot => !!pot.accountId && migrated.accounts?.some(account => account.id === pot.accountId))).toBe(true)
    expect(validMonthlyBudget(migrated)).toBe(true)
  })
})
