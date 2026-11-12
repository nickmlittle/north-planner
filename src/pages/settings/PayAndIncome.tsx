import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState, ListRow, MonthTitle, Sheet } from '../../components/ui'
import type { BudgetDocument } from '../../domain/budgetDocument'
import { addIncomeSource, incomeDateMarkers, incomeEditScope, resolveIncomeSources, updateIncomeAtMonth, type ResolvedIncomeSource } from '../../domain/monthlyBudget'
import { formatEditScope, formatMonth } from '../../formatting/month'
import { formatGBP } from '../../formatting/money'
import { BudgetOptionsMenu } from '../BudgetOptionsMenu'
import { ordinal } from '../cardLabels'
import './settings.css'

type IncomeType = 'employment' | 'additional'
type Payday = { day: number; ifNotWorkingDay: 'previous' | 'next' }
type Props = { document: BudgetDocument; setDocument: Dispatch<SetStateAction<BudgetDocument>>; month: string; onMonthChange: (month: string) => void; notify: (message: string) => void }

const pence = (value: string) => Math.max(0, Math.round(Number(value.replace(/[£,\s]/g, '') || 0) * 100))
/** "4,000.00": grouped, two places; the field's £ comes from .budget-money-field. */
const amountText = (amountPence: number) => (amountPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const typeLabel = (type: IncomeType) => type === 'employment' ? 'Salary' : 'Other income'
/** "paid on the 28th (or the working day before)". */
const paydayText = (payday: Payday) => `paid on the ${ordinal(payday.day)} (or the ${payday.ifNotWorkingDay === 'previous' ? 'working day before' : 'next working day'})`

/** Edit one source for the month: its amount (month-scoped, with the scope line) and, for salary, its payday (every month). */
function SourceForm({ source, month, formId, onSave }: { source: ResolvedIncomeSource; month: string; formId: string; onSave: (amountPence: number | null, payday: Payday | null | undefined) => void }) {
  const [amount, setAmount] = useState(amountText(source.amountPence))
  const [day, setDay] = useState(source.payday ? String(source.payday.day) : '')
  const [rule, setRule] = useState<'previous' | 'next'>(source.payday?.ifNotWorkingDay ?? 'previous')
  const scopeId = useId()
  const save = (event: FormEvent) => {
    event.preventDefault()
    const typed = Number(day)
    // An empty day removes the payday; an invalid one leaves it as it was.
    const payday = source.type !== 'employment' ? undefined : !day.trim() ? null : Number.isInteger(typed) && typed >= 1 && typed <= 31 ? { day: typed, ifNotWorkingDay: rule } : undefined
    onSave(pence(amount) === source.amountPence ? null : pence(amount), payday)
  }
  return <form id={formId} className="settings-form" aria-label={`Edit ${source.name}`} onSubmit={save}>
    <label>Amount in {formatMonth(month)}<span className="budget-money-field"><input data-autofocus inputMode="decimal" aria-describedby={scopeId} value={amount} onChange={event => setAmount(event.target.value)}/></span></label>
    <p id={scopeId} className="settings-form-note">Changes apply: {formatEditScope(incomeEditScope(source, month))}. £0 stops a source.</p>
    {source.type === 'employment' && <fieldset className="settings-form-pair"><legend>Payday, every month</legend>
      <label>Paid on day<input inputMode="numeric" value={day} placeholder="28" onChange={event => setDay(event.target.value)}/></label>
      <label>On a weekend or bank holiday<select value={rule} onChange={event => setRule(event.target.value as 'previous' | 'next')}><option value="previous">The working day before</option><option value="next">The next working day</option></select></label>
    </fieldset>}
  </form>
}

/** Add a recurring source from this month on. */
function AddSourceForm({ document, month, formId, onSave }: { document: BudgetDocument; month: string; formId: string; onSave: (source: { personId: string; name: string; type: IncomeType; baseAmountPence: number }) => void }) {
  const adults = document.household.adults
  const [person, setPerson] = useState(adults[0]?.id ?? '')
  const [name, setName] = useState('')
  const [type, setType] = useState<IncomeType>('employment')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !person) { setError('Enter a name for this income.'); return }
    onSave({ personId: person, name: name.trim(), type, baseAmountPence: pence(amount) })
  }
  return <form id={formId} className="settings-form" aria-label="Add income source" onSubmit={save} noValidate>
    <p className="settings-form-note">New income applies: {formatEditScope({ fromMonth: month, throughMonth: null })}.</p>
    <label>Person<select data-autofocus value={person} onChange={event => setPerson(event.target.value)}>{adults.map(adult => <option key={adult.id} value={adult.id}>{adult.name}</option>)}</select></label>
    <label>Source name<input value={name} onChange={event => { setName(event.target.value); setError('') }} placeholder="Parents" aria-invalid={!!error || undefined}/></label>
    <label>Type<select value={type} onChange={event => setType(event.target.value as IncomeType)}><option value="employment">Salary (sets the split)</option><option value="additional">Other income</option></select></label>
    <label>Monthly amount<span className="budget-money-field"><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)}/></span></label>
    {error && <p className="input-error" role="alert">{error}</p>}
  </form>
}

/**
 * Settings › Pay & income: each source for the selected month ("Ada · Salary", "£4,000.00 a month · paid on the
 * 28th"), edited in a Sheet. Amounts change from a month on, so the month is the section's context.
 */
export function PayAndIncome({ document, setDocument, month, onMonthChange, notify }: Props) {
  const formId = useId()
  const adults = document.household.adults
  const sources = resolveIncomeSources(document.budget, month)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const source = sources.find(row => row.id === editing)
  const title = (row: ResolvedIncomeSource) => `${adults.find(adult => adult.id === row.personId)?.name ?? 'Someone'} · ${row.name}`
  const meta = (row: ResolvedIncomeSource) => [
    `${formatGBP(row.amountPence / 100)} a month`,
    row.name.trim().toLowerCase() === typeLabel(row.type).toLowerCase() ? '' : typeLabel(row.type).toLowerCase(),
    row.type === 'employment' && row.payday ? paydayText(row.payday) : '',
  ].filter(Boolean).join(' · ')

  const saveSource = (id: string, amountPence: number | null, payday: Payday | null | undefined) => {
    setDocument(current => {
      let budget = amountPence === null ? current.budget : updateIncomeAtMonth(current.budget, month, id, amountPence)
      if (payday !== undefined) budget = { ...budget, incomeSources: budget.incomeSources.map(row => {
        if (row.id !== id) return row
        const next = { ...row }
        if (payday) next.payday = payday
        else delete next.payday
        return next
      }) }
      return budget === current.budget ? current : { ...current, budget }
    })
    setEditing(null); notify('Income saved.')
  }

  return <div className="settings-income">
    <MonthTitle month={month} onChange={onMonthChange} incomeMarkers={incomeDateMarkers(document.budget)}/>
    {sources.length ? <ul className="settings-list" aria-label={`Income in ${formatMonth(month)}`}>{sources.map(row => <li key={row.id}>
      <ListRow title={title(row)} meta={meta(row)} trailing={<BudgetRowMenu label={`More actions for ${title(row)}`} onEdit={() => setEditing(row.id)}/>}/>
    </li>)}</ul>
      : <EmptyState title="No income yet" action={<button type="button" className="primary-button" onClick={() => setEditing('new')}><Plus aria-hidden="true"/>Add income source</button>}>Add each person’s pay so North can split the plan.</EmptyState>}
    {sources.length > 0 && <div className="settings-list-actions"><button type="button" className="secondary-button" onClick={() => setEditing('new')}><Plus aria-hidden="true"/>Add income source</button></div>}
    {editing && <Sheet title={source ? `${title(source)}, ${formatMonth(month)}` : 'Add income source'} onClose={() => setEditing(null)} footer={<>
      <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
      <button type="submit" form={formId} className="primary-button">{source ? 'Save income' : 'Add income'}</button>
    </>}>
      {source ? <SourceForm source={source} month={month} formId={formId} onSave={(amount, payday) => saveSource(source.id, amount, payday)}/>
        : <AddSourceForm document={document} month={month} formId={formId} onSave={row => { setDocument(current => ({ ...current, budget: addIncomeSource(current.budget, month, row) })); setEditing(null); notify(`${row.name} added.`) }}/>}
    </Sheet>}
  </div>
}

/** A row's ⋯ with Edit. */
function BudgetRowMenu({ label, onEdit }: { label: string; onEdit: () => void }) {
  return <BudgetOptionsMenu row label={label} options={[{ label: 'Edit', onSelect: onEdit }]}/>
}
