import { emptyPerson, newDocument } from '../domain/setup'

export function completeDocument() {
  const d = newDocument(); const p = emptyPerson('you')
  Object.assign(p, { name: 'Alex', dob: '1990-06-14', incomeKind: 'paye', pay: '5000', frequency: 'month', pensionStatus: 'yes', pension: '100000', employee: '5', employer: '3', treatment: 'salary-sacrifice', isaType: 'stocks-and-shares', isa: '20000' })
  Object.assign(d.snapshot, { name: 'Alex household', people: [p], housing: 'own', homeValue: '500000', homeOwners: [p.id], mortgageStatus: 'yes', mortgageBalance: '250000', rate: '4.5', term: '25', borrowers: [p.id], spending: '2000', noCash: true })
  return d
}
