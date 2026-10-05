import type { StartingPositionField } from '../domain/startingPosition'

export interface StartingPositionInput {
  key: string
  label: string
  field: StartingPositionField
}

export const startingPositionGroups: { name: string; inputs: StartingPositionInput[] }[] = [
  { name: 'Household', inputs: [
    { key: 'nick-age', label: 'Nick age', field: { kind: 'age', personId: 'nick' } },
    { key: 'immy-age', label: 'Immy age', field: { kind: 'age', personId: 'immy' } },
    { key: 'base-year', label: 'Base year', field: { kind: 'year' } },
  ] },
  { name: 'Investments', inputs: [
    { key: 'nick-isa', label: 'Nick ISA balance', field: { kind: 'money', collection: 'isas', id: 'nick-isa' } },
    { key: 'immy-isa', label: 'Immy ISA balance', field: { kind: 'money', collection: 'isas', id: 'immy-isa' } },
    { key: 'nick-pension', label: 'Nick pension balance', field: { kind: 'money', collection: 'pensions', id: 'nick-pension' } },
    { key: 'immy-pension', label: 'Immy pension balance', field: { kind: 'money', collection: 'pensions', id: 'immy-pension' } },
  ] },
  { name: 'Property', inputs: [
    { key: 'house', label: 'Current house value', field: { kind: 'money', collection: 'properties', id: 'home' } },
    { key: 'mortgage', label: 'Current mortgage balance', field: { kind: 'money', collection: 'mortgages', id: 'home-mortgage' } },
  ] },
  { name: 'Cash', inputs: [
    { key: 'cash', label: 'Household cash balance', field: { kind: 'money', collection: 'cash', id: 'household-cash' } },
  ] },
]
