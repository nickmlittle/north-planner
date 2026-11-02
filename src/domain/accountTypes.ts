export const accountTypes = [
  { id: 'current-account', label: 'Current account' },
  { id: 'savings-account', label: 'Savings account' },
  { id: 'cash-isa', label: 'Cash ISA' },
  { id: 'stocks-shares-isa', label: 'S&S ISA' },
  { id: 'mortgage', label: 'Mortgage' },
  { id: 'credit-card', label: 'Credit card' },
  { id: 'loan', label: 'Loan' },
  { id: 'pension', label: 'Pension' },
  { id: 'other', label: 'Other' },
] as const

export type AccountTypeId = typeof accountTypes[number]['id']
export function isAccountTypeId(value: unknown): value is AccountTypeId {
  return accountTypes.some(type => type.id === value)
}
export function accountTypeLabel(id: AccountTypeId | undefined): string {
  return accountTypes.find(type => type.id === id)?.label ?? ''
}
