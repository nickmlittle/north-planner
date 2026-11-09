import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { BudgetDocument } from '../domain/budgetDocument'
import { householdReady } from '../domain/budgetDocument'
import { addIncomeSource } from '../domain/monthlyBudget'
import { PageFrame } from '../components/PageFrame'
import { AdultsFields } from './AdultsFields'

type Step = 1 | 2 | 3
const STEPS: Array<{ step: Step; label: string; title: string }> = [
  { step: 1, label: 'Household', title: 'Your household' },
  { step: 2, label: 'Adults', title: 'Who’s in the household?' },
  { step: 3, label: 'Pay', title: 'Monthly pay' },
]

/** Resume where the saved document leaves off: steps 1–2 save as you type, pay is saved on Finish. */
function firstStep(document: BudgetDocument): Step {
  if (!document.household.name.trim()) return 1
  return householdReady(document.household) ? 3 : 2
}

const validAmount = (value: string) => !value.trim() || /^\d+(\.\d{1,2})?$/.test(value.trim().replace(/,/g, ''))
const pence = (value: string) => Math.round(Number(value.trim().replace(/,/g, '') || 0) * 100)

/** First-run setup: Household → Adults → Pay, then the Plan. */
export function SetupWizard({ document, setDocument, month, onFinish }: {
  document: BudgetDocument
  setDocument: Dispatch<SetStateAction<BudgetDocument>>
  month: string
  onFinish: () => void
}) {
  const [step, setStep] = useState<Step>(() => firstStep(document))
  const [attempted, setAttempted] = useState(false)
  const [pay, setPay] = useState<Record<string, string>>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const { household } = document
  const adults = household.adults

  useEffect(() => { if (moved.current) heading.current?.focus() }, [step])
  const go = (next: Step) => { moved.current = true; setAttempted(false); setStep(next) }

  const continueFromHousehold = (event: FormEvent) => {
    event.preventDefault()
    if (!household.name.trim()) { setAttempted(true); return }
    if (!adults.length) setDocument(current => current.household.adults.length ? current : { ...current, household: { ...current.household, adults: [{ id: crypto.randomUUID(), name: '' }] } })
    go(2)
  }
  const continueFromAdults = (event: FormEvent) => {
    event.preventDefault()
    if (!householdReady(household)) { setAttempted(true); return }
    go(3)
  }
  const finish = (event: FormEvent) => {
    event.preventDefault()
    if (adults.some(person => !validAmount(pay[person.id] ?? ''))) { setAttempted(true); return }
    setDocument(current => {
      let budget = current.budget
      for (const person of current.household.adults) {
        const amount = pence(pay[person.id] ?? '')
        if (amount > 0) budget = addIncomeSource(budget, month, { personId: person.id, name: 'Pay', type: 'employment', baseAmountPence: amount })
      }
      return { ...current, budget, workflow: { setupComplete: true } }
    })
    onFinish()
  }
  const skip = () => { setDocument(current => ({ ...current, workflow: { setupComplete: true } })); onFinish() }

  const current = STEPS[step - 1]!
  const progress = <ol className="setup-progress" aria-label="Setup steps">
    {STEPS.map(row => <li key={row.step} className={row.step < step ? 'is-done' : row.step === step ? 'is-current' : ''} aria-current={row.step === step ? 'step' : undefined}><span className="setup-progress-number" aria-hidden="true">{row.step}</span>{row.label}</li>)}
  </ol>
  const back = (to: Step) => <button type="button" className="secondary-button" onClick={() => go(to)}>Back</button>

  return <PageFrame className="household-setup-page setup-wizard" title={current.title} headingRef={heading} beforeHeading={progress}>
    {step === 1 && <form onSubmit={continueFromHousehold} noValidate>
      <section className="setup-card">
        <label className="setup-field">Household name<input aria-label="Household name" value={household.name} onChange={event => setDocument(state => ({ ...state, household: { ...state.household, name: event.target.value } }))} aria-invalid={attempted && !household.name.trim()} placeholder="e.g. Alex + Sam" /></label>
      </section>
      {attempted && !household.name.trim() && <p role="alert" className="input-error">Enter a household name.</p>}
      <div className="setup-actions"><button className="primary-button">Continue</button></div>
    </form>}
    {step === 2 && <form onSubmit={continueFromAdults} noValidate>
      <section className="setup-card">
        <p className="setup-intro">Shared items are split between the adults, equally or by pay.</p>
        <AdultsFields document={document} setDocument={setDocument} attempted={attempted} />
      </section>
      {attempted && !householdReady(household) && <p role="alert" className="input-error">Add at least one adult and give each a name.</p>}
      <div className="setup-actions">{back(1)}<button className="primary-button">Continue</button></div>
    </form>}
    {step === 3 && <form onSubmit={finish} noValidate>
      <section className="setup-card setup-pay">
        <p className="setup-intro">Take-home pay sets each adult’s share of items split by pay.</p>
        {adults.map(person => <label className="setup-field" key={person.id}>{person.name}’s monthly take-home pay<span className="budget-money-field"><input inputMode="decimal" value={pay[person.id] ?? ''} onChange={event => setPay(state => ({ ...state, [person.id]: event.target.value }))} aria-invalid={attempted && !validAmount(pay[person.id] ?? '')} /></span></label>)}
      </section>
      {attempted && adults.some(person => !validAmount(pay[person.id] ?? '')) && <p role="alert" className="input-error">Enter pay as an amount in pounds, like 2450 or 2450.50.</p>}
      <div className="setup-actions">{back(2)}<button type="button" className="text-button" onClick={skip}>Skip for now</button><button className="primary-button">Finish setup</button></div>
    </form>}
  </PageFrame>
}
