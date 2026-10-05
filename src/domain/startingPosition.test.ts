import { describe, expect, it } from 'vitest'
import { loadDefaultHousehold } from '../config/defaultHousehold'
import { startingPositionGroups } from '../config/startingPositionFields'
import { getStartingPositionValue, parseStartingPositionInput, updateStartingPosition } from './startingPosition'

const fields = startingPositionGroups.flatMap(group => group.inputs)

describe('starting position edits', () => {
  it.each(fields)('updates $label immutably', ({ field }) => {
    const household = loadDefaultHousehold()
    const before = structuredClone(household)
    const raw = field.kind === 'year' ? '2027' : field.kind === 'age' ? '40' : '12345.67'
    const result = updateStartingPosition(household, field, raw)
    expect(result.error).toBeUndefined()
    expect(getStartingPositionValue(result.household, field)).toBe(Number(raw))
    expect(household).toEqual(before)
  })

  it.each(['', ' ', 'NaN', 'Infinity', '1e3', '0x10', '123oops', '£1,000', '-1', '1.234', '9'.repeat(400)])('rejects invalid money %j without corrupting state', raw => {
    const household = loadDefaultHousehold()
    for (const { field } of fields.filter(input => input.field.kind === 'money')) {
      const result = updateStartingPosition(household, field, raw)
      expect(result.error).toBeTruthy()
      expect(result.household).toBe(household)
    }
  })

  it('accepts zero mortgage and cash', () => {
    const household = loadDefaultHousehold()
    for (const { field } of fields.filter(input => input.field.kind === 'money')) {
      const result = updateStartingPosition(household, field, '0')
      expect(result.error).toBeUndefined()
      expect(getStartingPositionValue(result.household, field)).toBe(0)
    }
  })

  it.each(['0', '-1', '121', '32.5', 'Infinity'])('rejects invalid age %s', raw => {
    expect(parseStartingPositionInput(raw, 'age').error).toBeTruthy()
  })

  it('changes ages with the base year, retaining birth years and the money convention', () => {
    const original = loadDefaultHousehold()
    const result = updateStartingPosition(original, { kind: 'year' }, '2027')
    expect(result.household.people).toEqual(original.people)
    expect(getStartingPositionValue(result.household, { kind: 'age', personId: 'nick' })).toBe(33)
    expect(result.household.assumptions.moneyBasis).toEqual(original.assumptions.moneyBasis)
  })

  it.each(['2026.5', '2101', '1900', 'Infinity', ''])('rejects invalid base year %s', raw => {
    const household = loadDefaultHousehold()
    const result = updateStartingPosition(household, { kind: 'year' }, raw)
    expect(result.error).toBeTruthy()
    expect(result.household).toBe(household)
  })
})
