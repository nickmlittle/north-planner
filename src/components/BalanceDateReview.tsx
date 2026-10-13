import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { validISODate } from '../domain/setup'
import { SetupField } from './SetupFields'

export function BalanceDateReview({ document, setDocument, onReview }: { document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; onReview: () => void }) {
  if (document.balanceDatesReviewed) return null
  const s = document.snapshot
  const datedBalances: { label: string; value: string; update: (date: string) => void }[] = []
  s.people.forEach(p => {
    if (p.isaType !== '' && p.isaType !== 'none' && p.isa !== '' && !validISODate(p.isaAsOfDate)) datedBalances.push({ label: `${p.name || 'Unnamed person'} ISA`, value: p.isaAsOfDate, update: date => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, people: d.snapshot.people.map(person => person.id === p.id ? { ...person, isaAsOfDate: date } : person) } })) })
    if (p.pensionStatus === 'yes' && p.pension !== '' && !validISODate(p.pensionAsOfDate)) datedBalances.push({ label: `${p.name || 'Unnamed person'} pension`, value: p.pensionAsOfDate, update: date => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, people: d.snapshot.people.map(person => person.id === p.id ? { ...person, pensionAsOfDate: date } : person) } })) })
  })
  s.cash.forEach(c => { if (c.balance !== '' && !validISODate(c.asOfDate)) datedBalances.push({ label: c.name || 'Cash account', value: c.asOfDate, update: date => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, cash: d.snapshot.cash.map(entry => entry.id === c.id ? { ...entry, asOfDate: date } : entry) } })) }) })
  if (s.housing === 'own' && s.homeValue !== '' && !validISODate(s.homeAsOfDate)) datedBalances.push({ label: 'Home value', value: s.homeAsOfDate, update: homeAsOfDate => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, homeAsOfDate } })) })
  if (s.housing === 'own' && s.mortgageStatus === 'yes' && s.mortgageBalance !== '' && !validISODate(s.mortgageAsOfDate)) datedBalances.push({ label: 'Mortgage balance', value: s.mortgageAsOfDate, update: mortgageAsOfDate => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, mortgageAsOfDate } })) })
  return <aside className="storage-warning" role="status">
    <p>Your saved balances were kept. Add an observation date to each one to finish safely updating this saved household.</p>
    {datedBalances.map(balance => <SetupField key={balance.label} label={`${balance.label} observation date`} type="date" value={balance.value} onChange={balance.update} />)}
    <div className="button-row"><button type="button" className="secondary-button" disabled={datedBalances.length > 0} onClick={onReview}>Finish date review</button></div>
  </aside>
}
