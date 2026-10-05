import { describe, expect, it } from 'vitest'
import { loadDefaultHousehold } from './defaultHousehold'

describe('default household configuration', () => {
  it('loads Nick and Immy with the fixed real 2026 GBP convention', () => {
    const household = loadDefaultHousehold()
    expect(household.people.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'nick', name: 'Nick' }, { id: 'immy', name: 'Immy' },
    ])
    expect(household.assumptions.moneyBasis).toEqual({ currency: 'GBP', priceYear: 2026, terms: 'real' })
    expect(household.assumptions.endYear).toBeGreaterThan(household.assumptions.startYear)
    expect(household.people.every(person => person.birthYear === null && person.targetFireAge === null)).toBe(true)
    expect(household.isas).toEqual([])
    expect(household.pensions).toEqual([])
    expect(household.properties).toEqual([])
    expect(household.mortgages).toEqual([])
    expect(household.cash).toEqual([])
    expect(household.events).toEqual([])
  })

  it('isolates nested state between loads and from the source fixture', () => {
    const first = loadDefaultHousehold()
    const second = loadDefaultHousehold()
    first.people[0]!.name = 'Changed'
    first.assumptions.annualRealReturns.cash = 0.1
    first.cash.push({ id: 'cash', kind: 'cash', name: 'Cash', ownerIds: ['nick'], value: 100 })
    expect(second).toEqual(loadDefaultHousehold())
    expect(second.people[0]!.name).toBe('Nick')
    expect(second.assumptions.annualRealReturns.cash).toBeNull()
    expect(second.cash).toEqual([])
  })
})
