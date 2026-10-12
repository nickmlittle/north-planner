import type { Household } from './models'

export type StartingPositionField =
  | { kind: 'age'; personId: string }
  | { kind: 'money'; collection: 'isas' | 'pensions' | 'properties' | 'cash' | 'mortgages'; id: string }
  | { kind: 'year' }

export type InputResult = { value: number; error?: never } | { error: string; value?: never }

/** Strict decimal input; no coercion of blanks, exponent notation, or partial numbers. */
export function parseStartingPositionInput(raw: string, kind: StartingPositionField['kind']): InputResult {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) {
    return { error: kind === 'money' ? 'Enter a non-negative amount with up to two decimal places.' : 'Enter a positive whole number.' }
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER / 100) {
    return { error: 'Enter a finite number within the supported range.' }
  }
  if (kind === 'age' && (!Number.isInteger(value) || value < 1 || value > 120)) {
    return { error: 'Enter an age from 1 to 120 whole years.' }
  }
  if (kind === 'year' && (!Number.isInteger(value) || value < 1900 || value > 9999)) {
    return { error: 'Enter a whole base year from 1900 to 9999.' }
  }
  return { value }
}

export function getStartingPositionValue(household: Household, field: StartingPositionField): number {
  if (field.kind === 'year') return household.assumptions.startYear
  if (field.kind === 'age') {
    const person = household.people.find(person => person.id === field.personId)
    if (!person || person.birthYear === null) throw new Error('Starting-position person is not configured')
    return household.assumptions.startYear - person.birthYear
  }
  const asset = household[field.collection].find(asset => asset.id === field.id)
  if (!asset) throw new Error('Starting-position asset is not configured')
  return 'balance' in asset ? asset.balance : asset.value
}

/** Invalid input returns the original household. UI draft strings never enter domain state. */
export function updateStartingPosition(household: Household, field: StartingPositionField, raw: string): { household: Household; error?: string } {
  const result = parseStartingPositionInput(raw, field.kind)
  if (result.error !== undefined) return { household, error: result.error }
  const value = result.value
  if (field.kind === 'year') {
    if (value > household.assumptions.endYear) return { household, error: `Base year must be no later than ${household.assumptions.endYear}.` }
    if (household.people.some(person => person.birthYear !== null && (value - person.birthYear < 1 || value - person.birthYear > 120))) {
      return { household, error: 'Base year must keep household ages between 1 and 120.' }
    }
  }
  const next = structuredClone(household)
  if (field.kind === 'year') {
    next.assumptions.startYear = value
    next.assumptions.startDate = `${value}-01-01`
  }
  else if (field.kind === 'age') {
    const person = next.people.find(person => person.id === field.personId)
    if (!person) return { household, error: 'Person could not be found.' }
    person.birthYear = next.assumptions.startYear - value
  } else {
    const asset = next[field.collection].find(asset => asset.id === field.id)
    if (!asset) return { household, error: 'Asset could not be found.' }
    if ('balance' in asset) asset.balance = value
    else asset.value = value
  }
  return { household: next }
}
