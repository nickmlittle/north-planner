import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { ageBands, currentBand, missingDetails } from '../domain/setup'
import type { IncomePeriod } from '../domain/income'
import { documentForecast } from '../state/forecast'
import { navigateToSettings, navigateToStep, settingsSections } from '../state/navigation'
import type { SettingsSection } from '../state/navigation'
import { PlannerHeader } from '../components/PlannerHeader'
import { PlanEvents } from '../components/PlanEvents'
import { householdEmployment } from '../engine/employment'
import { childEffects } from '../engine/children'
import { grossIncome } from '../engine/income'
import { PlanningInputs } from '../components/PlanningInputs'
import { IncomeInputs } from '../components/IncomeInputs'
import { TaxInputs } from '../components/TaxInputs'
import { MortgageInputs } from '../components/MortgageInputs'
import { AllowanceInputs } from '../components/AllowanceInputs'
import { SpendingInputs } from '../components/SpendingInputs'
import { ForecastResults } from '../components/ForecastResults'
import { SetupCard, MoneyField } from '../components/SetupFields'

export function HouseholdPlanner({ document: doc, setDocument, warning, replaceSavedDraft, accountBacked = false, saveStatus, email, onSignOut, settingsSection = 'planning', onSelectSettings }: {
  document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; warning: string; replaceSavedDraft: () => void; accountBacked?: boolean; saveStatus?: string; email?: string; onSignOut?: () => void
  settingsSection?: SettingsSection; onSelectSettings: (section: SettingsSection) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const target = window.location.hash.slice(1)
    const field = target ? window.document.getElementById(target) as HTMLInputElement | null : null
    if (field) {
      field.scrollIntoView?.({ block: 'center' })
      field.focus()
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    } else {
      heading.current?.focus()
      window.scrollTo?.(0, 0)
    }
  }, [settingsSection])
  const go = (step: number) => {
    setDocument(d => ({ ...d, step, completed: d.completed || step >= 8 }))
    if (step === 10) navigateToSettings('planning')
    else navigateToStep(step)
  }
  const { input, result } = documentForecast(doc)
  const missing = missingDetails(doc.snapshot, true)
  function updateIncome(incomeTimeline: IncomePeriod[]) {
    setDocument(d => ({ ...d, incomeTimeline, snapshot: { ...d.snapshot, people: d.snapshot.people.map(p => {
      if (p.role === 'child') return p
      const active = incomeTimeline.find(i => i.personId === p.id && i.startYear <= 2026 && i.endYear > 2026)
      if (!active) return { ...p, incomeKind: 'none' }
      const c = active.contributions
      return { ...p, incomeKind: active.kind, pay: String(active.kind === 'paye' ? active.annualSalary : active.dayRate), payOverride: active.annualGrossOverride !== null || active.workingFraction !== 1 ? String(grossIncome(incomeTimeline, p.id, 2026)) : '', frequency: 'year', days: String(active.billableDays),
        employee: c ? String(Number((c.employeeRate * 100).toFixed(2))) : p.employee, employer: c ? String(Number((c.employerRate * 100).toFixed(2))) : p.employer, treatment: c?.treatment ?? p.treatment }
    }) } }))
  }
  const page = settingsSections.find(section => section.id === settingsSection) ?? settingsSections[0]!
  const futureCosts = doc.snapshot.people.filter(p => p.role === 'child' && currentBand(p))
  return <div className="north-shell settings-shell"><PlannerHeader step={10} go={go} warning={warning} replaceSavedDraft={replaceSavedDraft} accountBacked={accountBacked} saveStatus={saveStatus} email={email} onSignOut={onSignOut} settingsSection={settingsSection} onSelectSettings={onSelectSettings} />
    <main className="dashboard-main dashboard-container settings-main">
      <div className="route-heading settings-heading"><div><h1 ref={heading} tabIndex={-1}>{page.label}</h1><p className="page-description">{page.description}</p></div></div>
      <div className="settings-content">
      {missing.filter(m => m.step !== 9).length > 0 && <SetupCard title="Complete your current picture"><ul className="missing-list">{missing.filter(m => m.step !== 9).map((m, i) => <li key={i}><span>{m.label}</span><button className="text-button" onClick={() => go(m.step)}>Add details</button></li>)}</ul></SetupCard>}
      {settingsSection === 'planning' && <><PlanningInputs value={doc.planning} onChange={planning => setDocument(d => ({ ...d, planning }))} /><p className="context-note">Forecasts use annual calendar-year ages derived from date of birth, in real 2026 GBP. Current earnings continue unchanged in real terms until FIRE unless adjusted on the Income timeline. Returns and retirement ages are illustrative assumptions, not recommendations.</p></>}
      {settingsSection === 'tax' && <TaxInputs value={doc.tax} onChange={tax => setDocument(d => ({ ...d, tax }))} />}
      {settingsSection === 'income' && (input ? <IncomeInputs household={input.household} value={input.income} onChange={updateIncome} /> : <SetupCard title="Income timeline unavailable"><p>Complete the household and income details to edit the forecast timeline.</p></SetupCard>)}
      {settingsSection === 'spending' && (input ? <SpendingInputs hideEvents value={input.spending} onChange={spending => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, spending: String(spending.baseline), spendingFrequency: 'year' } }))} year={2026} disposable={householdEmployment(input.household, input.income, 2026, input.planning.fireAge, input.tax, childEffects(input.children, 2026).adjustments).disposable} /> : <SetupCard title="Lifestyle spending unavailable"><p>Complete the household details to edit lifestyle spending.</p></SetupCard>)}
      {settingsSection === 'children' && <>{futureCosts.length ? futureCosts.map(p => <SetupCard title={`${p.name} · Future child costs`} key={p.id} description="Enter annual estimates for later age bands. Explicit £0 is accepted; blank future costs prevent forecasting."><div className="input-grid">{ageBands.slice(ageBands.findIndex(b => b.key === currentBand(p)) + 1).map(b => <MoneyField key={b.key} label={`${p.name} ${b.label} annual cost (£)`} value={p.futureCosts[b.key]} onChange={value => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, people: d.snapshot.people.map(person => person.id === p.id ? { ...person, futureCosts: { ...person.futureCosts, [b.key]: value } } : person) } }))} />)}</div></SetupCard>) : <SetupCard title="Future child costs"><p>No children with future age bands are currently in this household.</p></SetupCard>}</>}
      {settingsSection === 'mortgage' && (input ? <MortgageInputs value={input.mortgage} balance={input.household.mortgages[0]?.balance ?? 0} year={2026} onChange={mortgage => setDocument(d => ({ ...d, mortgageExtras: { monthlyOverpayment: mortgage.monthlyOverpayment, inflation: mortgage.inflation, refinances: mortgage.refinances }, snapshot: { ...d.snapshot, rate: mortgage.annualRate === null ? '' : String(Number((mortgage.annualRate * 100).toFixed(2))), term: mortgage.termYears === null ? '' : String(mortgage.termYears) } }))} /> : <SetupCard title="Mortgage settings unavailable"><p>Complete the household housing details to edit mortgage assumptions.</p></SetupCard>)}
      {settingsSection === 'allowances' && (input ? <AllowanceInputs people={input.household.people} value={input.allowances} onChange={allowances => setDocument(d => ({ ...d, allowances }))} /> : <SetupCard title="ISA allowances unavailable"><p>Complete the household details to edit ISA allowances.</p></SetupCard>)}
      {settingsSection === 'events' && <PlanEvents document={doc} setDocument={setDocument} />}
      {settingsSection === 'forecast' && <ForecastResults result={result} people={input?.household.people ?? []} />}
      <footer className="journey-footer">{accountBacked ? 'Changes are saved to your account.' : 'Changes are saved in this browser.'} Current household finances can be edited from your starting position.</footer>
      </div>
    </main></div>
}
