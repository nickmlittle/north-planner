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
    expect(household.people.map(person => person.birthYear)).toEqual([1994, 1995])
    expect(household.isas.map(asset => asset.value)).toEqual([88000, 1000])
    expect(household.pensions.map(asset => asset.value)).toEqual([117000, 25000])
    expect(household.properties[0]!.value).toBe(850000)
    expect(household.mortgages[0]!.balance).toBe(446000)
    expect(household.mortgages[0]!.propertyId).toBe(household.properties[0]!.id)
    expect(household.cash[0]!.value).toBe(0)
    expect(household.assumptions.startYear).toBe(2026)
    expect(household.events).toEqual([])
  })

  it('isolates nested state between loads and from the source fixture', () => {
    const first = loadDefaultHousehold()
    const second = loadDefaultHousehold()
    first.people[0]!.name = 'Changed'
    first.assumptions.annualRealReturns.cash = 0.1
    first.cash[0]!.value = 100
    expect(second).toEqual(loadDefaultHousehold())
    expect(second.people[0]!.name).toBe('Nick')
    expect(second.assumptions.annualRealReturns.cash).toBeNull()
    expect(second.cash[0]!.value).toBe(0)
  })
})
