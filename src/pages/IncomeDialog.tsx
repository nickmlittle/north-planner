import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Info } from 'lucide-react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { addIncomeSource, incomeEditScope, resolveIncomeSources, updateIncomeAtMonth } from '../domain/monthlyBudget'
import { formatEditScope, formatMonth } from '../formatting/month'

type IncomeType = 'employment' | 'additional'
type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; onClose: () => void }

const pence = (value: string) => Math.max(0, Math.round(Number(value.replace(/[£,\s]/g, '') || 0) * 100))
/** "4,000.00": grouped, two places; the field's £ comes from .budget-money-field. */
const amountText = (amountPence: number) => (amountPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const typeLabel = (type: IncomeType) => type === 'employment' ? 'Salary' : 'Other income'

/** Edit each income source for the month, or add a recurring one (the form opens on request once there are sources). Drafts live only while the dialog is open. */
export function IncomeDialog({ document, setDocument, month, onClose }: Props) {
  const adults = document.household.adults
  const incomes = resolveIncomeSources(document.budget, month)
  const [draft, setDraft] = useState<Record<string, string>>({})
  // Paydays are shared by every month; an empty day removes one.
  const [paydays, setPaydays] = useState<Record<string, { day: string; ifNotWorkingDay: 'previous' | 'next' }>>({})
  const paydayFor = (source: { id: string; payday?: { day: number; ifNotWorkingDay: 'previous' | 'next' } }) => paydays[source.id] ?? { day: source.payday ? String(source.payday.day) : '', ifNotWorkingDay: source.payday?.ifNotWorkingDay ?? 'previous' }
  const [newName, setNewName] = useState('')
  const [newPerson, setNewPerson] = useState(adults[0]?.id ?? '')
  const [newType, setNewType] = useState<IncomeType>('employment')
  const [newAmount, setNewAmount] = useState('')
  const [help, setHelp] = useState(false)
  const [adding, setAdding] = useState(incomes.length === 0)
  // Say the range once when every source shares it; per field only where they differ.
  const scopes = incomes.map(source => formatEditScope(incomeEditScope(source, month)))
  const sharedScope = scopes.length > 0 && scopes.every(scope => scope === scopes[0]) ? scopes[0] : null

  const save = (event: FormEvent) => {
    event.preventDefault()
    setDocument(current => {
      let budget = current.budget
      for (const source of budget.incomeSources) if (draft[source.id] !== undefined) budget = updateIncomeAtMonth(budget, month, source.id, pence(draft[source.id]!))
      budget = { ...budget, incomeSources: budget.incomeSources.map(source => {
        const payday = paydays[source.id]
        if (!payday) return source
        const day = Number(payday.day)
        const next = { ...source }
        if (payday.day.trim() && Number.isInteger(day) && day >= 1 && day <= 31) next.payday = { day, ifNotWorkingDay: payday.ifNotWorkingDay }
        else delete next.payday
        return next
      }) }
      if (newName.trim() && newPerson) budget = addIncomeSource(budget, month, { personId: newPerson, name: newName.trim(), type: newType, baseAmountPence: pence(newAmount) })
      return { ...current, budget }
    })
    onClose()
  }

  return <div className="budget-v3-overlay"><form className="budget-v3-panel" onSubmit={save}>
    <h2>Income for {formatMonth(month)}</h2>
    <p className="budget-income-intro">Income changes don’t create a budget <span className="budget-nowrap">date. <button type="button" className="budget-v3-info" aria-label="About income changes" aria-expanded={help} onClick={() => setHelp(value => !value)}><Info aria-hidden="true"/></button></span></p>
    {help && <p className="budget-edit-scope">Salary sets each person’s share. Other income only adds to Available. £0 stops a source.</p>}
    {sharedScope && <p id="income-scope-shared" className="budget-edit-scope">Changes apply: {sharedScope}.</p>}
    {incomes.map(source => <div className="budget-income-source" key={source.id}>
      <label>{adults.find(adult => adult.id === source.personId)?.name} — {source.name}{source.name.trim().toLowerCase() === typeLabel(source.type).toLowerCase() ? '' : ` · ${typeLabel(source.type)}`}<span className="budget-money-field"><input aria-describedby={sharedScope ? 'income-scope-shared' : `income-scope-${source.id}`} inputMode="decimal" value={draft[source.id] ?? amountText(source.amountPence)} onChange={event => setDraft(current => ({ ...current, [source.id]: event.target.value }))}/></span></label>
      {!sharedScope && <p id={`income-scope-${source.id}`} className="budget-edit-scope">Changes apply: {scopes[incomes.indexOf(source)]}.</p>}
      {source.type === 'employment' && <div className="budget-income-payday">
        <label>Paid on day<input inputMode="numeric" value={paydayFor(source).day} placeholder="28" onChange={event => setPaydays({ ...paydays, [source.id]: { ...paydayFor(source), day: event.target.value } })}/></label>
        <label>On a weekend or bank holiday<select value={paydayFor(source).ifNotWorkingDay} onChange={event => setPaydays({ ...paydays, [source.id]: { ...paydayFor(source), ifNotWorkingDay: event.target.value as 'previous' | 'next' } })}><option value="previous">The working day before</option><option value="next">The next working day</option></select></label>
      </div>}
    </div>)}
    {!adding && <button type="button" className="secondary-button budget-income-add" onClick={() => setAdding(true)}>Add income source</button>}
    {adding && <fieldset><legend>Add recurring income source</legend>
      {sharedScope !== formatEditScope({ fromMonth: month, throughMonth: null }) && <p className="budget-edit-scope">New income applies: {formatEditScope({ fromMonth: month, throughMonth: null })}.</p>}
      <label>Person<select autoFocus={incomes.length > 0} value={newPerson} onChange={event => setNewPerson(event.target.value)}>{adults.map(adult => <option key={adult.id} value={adult.id}>{adult.name}</option>)}</select></label>
      <label>Source name<input value={newName} onChange={event => setNewName(event.target.value)} placeholder="Parents"/></label>
      <label>Type<select value={newType} onChange={event => setNewType(event.target.value as IncomeType)}><option value="employment">Salary (sets the split)</option><option value="additional">Other income</option></select></label>
      <label>Monthly amount<span className="budget-money-field"><input inputMode="decimal" value={newAmount} onChange={event => setNewAmount(event.target.value)}/></span></label>
    </fieldset>}
    <div className="budget-v3-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button">Save income</button></div>
  </form></div>
}
