import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppDocument } from '../domain/setup'
import { ageBands, currentBand, missingDetails } from '../domain/setup'
import type { IncomePeriod } from '../domain/income'
import { documentForecast } from '../state/forecast'
import { navigateToDashboard, navigateToHousehold, navigateToSettings, settingsSections } from '../state/navigation'
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
import { SetupCard, MoneyField, SetupField } from '../components/SetupFields'
import { BalanceDateReview } from '../components/BalanceDateReview'

export function HouseholdPlanner({ document: doc, setDocument, warning, replaceSavedDraft, downloadOriginal, recoveryOriginal, accountBacked = false, saveStatus, email, onSignOut, settingsSection = 'planning', onSelectSettings, onSelectView, currentView = 'dashboard' }: {
  document: AppDocument; setDocument: Dispatch<SetStateAction<AppDocument>>; warning: string; replaceSavedDraft: () => void; downloadOriginal?: () => void; recoveryOriginal?: string; accountBacked?: boolean; saveStatus?: string; email?: string; onSignOut?: () => void
  settingsSection?: SettingsSection; onSelectSettings: (section: SettingsSection) => void; onSelectView?: (view: 'dashboard' | 'household') => void; currentView?: 'dashboard' | 'household'
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
    if (step === 9) { if (onSelectView) onSelectView('dashboard'); else navigateToDashboard() }
    else if (step === 10) navigateToSettings('planning')
    else navigateToHousehold(step)
  }
  const { input, result } = documentForecast(doc)
  const baseYear = Number(doc.snapshot.planningStartDate.slice(0, 4))
  const unknownBalanceDates = [
    ...doc.snapshot.people.filter(p => p.isaType !== '' && p.isaType !== 'none' && p.isa !== '').map(p => p.isaAsOfDate),
    ...doc.snapshot.people.filter(p => p.pensionStatus === 'yes' && p.pension !== '').map(p => p.pensionAsOfDate),
    ...doc.snapshot.cash.filter(c => c.balance !== '').map(c => c.asOfDate),
    ...(doc.snapshot.housing === 'own' && doc.snapshot.homeValue !== '' ? [doc.snapshot.homeAsOfDate] : []),
    ...(doc.snapshot.mortgageStatus === 'yes' && doc.snapshot.mortgageBalance !== '' ? [doc.snapshot.mortgageAsOfDate] : []),
  ].filter(date => !date).length
  const missing = missingDetails(doc.snapshot, true, doc.snapshot.planningStartDate)
  function updateIncome(incomeTimeline: IncomePeriod[]) {
    setDocument(d => ({ ...d, incomeTimeline, snapshot: { ...d.snapshot, people: d.snapshot.people.map(p => {
      if (p.role === 'child') return p
      const active = incomeTimeline.find(i => i.personId === p.id && i.startYear <= baseYear && i.endYear > baseYear)
      if (!active) return { ...p, incomeKind: 'none' }
      const c = active.contributions
      return { ...p, incomeKind: active.kind, pay: String(active.kind === 'paye' ? active.annualSalary : active.dayRate), payOverride: active.annualGrossOverride !== null || active.workingFraction !== 1 ? String(grossIncome(incomeTimeline, p.id, baseYear)) : '', frequency: 'year', days: String(active.billableDays),
        employee: c ? String(Number((c.employeeRate * 100).toFixed(2))) : p.employee, employer: c ? String(Number((c.employerRate * 100).toFixed(2))) : p.employer, treatment: c?.treatment ?? p.treatment }
    }) } }))
  }
  const page = settingsSections.find(section => section.id === settingsSection) ?? settingsSections[0]!
  const futureCosts = doc.snapshot.people.filter(p => p.role === 'child' && currentBand(p, doc.snapshot.planningStartDate))
  return <div className="north-shell settings-shell"><PlannerHeader step={10} go={go} warning={warning} replaceSavedDraft={replaceSavedDraft} downloadOriginal={downloadOriginal} recoveryOriginal={recoveryOriginal} accountBacked={accountBacked} saveStatus={saveStatus} email={email} onSignOut={onSignOut} settingsSection={settingsSection} onSelectSettings={onSelectSettings} onSelectView={onSelectView} currentView={currentView} />
    <main className="dashboard-main dashboard-container settings-main">
      <div className="route-heading settings-heading"><div><h1 ref={heading} tabIndex={-1}>{page.label}</h1><p className="page-description">{page.description}</p></div></div>
      <div className="settings-content">
      <BalanceDateReview document={doc} setDocument={setDocument} onReview={() => go(3)} />
      {missing.filter(m => m.step !== 9).length > 0 && <SetupCard title="Complete your current picture"><ul className="missing-list">{missing.filter(m => m.step !== 9).map((m, i) => <li key={i}><span>{m.label}</span><button className="text-button" onClick={() => go(m.step)}>Add details</button></li>)}</ul></SetupCard>}
      {settingsSection === 'planning' && <><SetupCard title="Projection start date"><SetupField label="Planning start date" type="date" value={doc.snapshot.planningStartDate} onChange={planningStartDate => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, planningStartDate } }))} help="The first projected day. Income and saving are prorated from this date." /></SetupCard><PlanningInputs value={doc.planning} onChange={planning => setDocument(d => ({ ...d, planning }))} /><p className="context-note">Forecast amounts are real {doc.moneyBasis.priceYear} GBP. Monthly budget inputs keep this price basis; no implicit inflation conversion is applied. Current earnings continue unchanged in real terms until FIRE unless adjusted on the Income timeline. Returns and retirement ages are illustrative assumptions, not recommendations.</p></>}
      {settingsSection === 'tax' && <TaxInputs value={doc.tax} onChange={tax => setDocument(d => ({ ...d, tax }))} />}
      {settingsSection === 'income' && (input ? <IncomeInputs household={input.household} value={input.income} onChange={updateIncome} /> : <SetupCard title="Income timeline unavailable"><p>Complete the household and income details to edit the forecast timeline.</p></SetupCard>)}
      {settingsSection === 'spending' && (input ? <SpendingInputs hideEvents value={input.spending} onChange={spending => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, spending: String(spending.baseline), spendingFrequency: 'year' } }))} year={baseYear} disposable={householdEmployment(input.household, input.income, baseYear, input.planning.fireAge, input.tax, childEffects(input.children, baseYear).adjustments).disposable} /> : <SetupCard title="Lifestyle spending unavailable"><p>Complete the household details to edit lifestyle spending.</p></SetupCard>)}
      {settingsSection === 'children' && <>{futureCosts.length ? futureCosts.map(p => <SetupCard title={`${p.name} · Future child costs`} key={p.id} description="Enter annual estimates for later age bands. Explicit £0 is accepted; blank future costs prevent forecasting."><div className="input-grid">{ageBands.slice(ageBands.findIndex(b => b.key === currentBand(p)) + 1).map(b => <MoneyField key={b.key} label={`${p.name} ${b.label} annual cost (£)`} value={p.futureCosts[b.key]} onChange={value => setDocument(d => ({ ...d, snapshot: { ...d.snapshot, people: d.snapshot.people.map(person => person.id === p.id ? { ...person, futureCosts: { ...person.futureCosts, [b.key]: value } } : person) } }))} />)}</div></SetupCard>) : <SetupCard title="Future child costs"><p>No children with future age bands are currently in this household.</p></SetupCard>}</>}
      {settingsSection === 'mortgage' && (input ? <MortgageInputs value={input.mortgage} balance={input.household.mortgages[0]?.balance ?? 0} year={baseYear} priceYear={doc.moneyBasis.priceYear} onChange={mortgage => setDocument(d => ({ ...d, mortgageExtras: { monthlyOverpayment: mortgage.monthlyOverpayment, inflation: mortgage.inflation, refinances: mortgage.refinances }, snapshot: { ...d.snapshot, rate: mortgage.annualRate === null ? '' : String(Number((mortgage.annualRate * 100).toFixed(2))), term: mortgage.termYears === null ? '' : String(mortgage.termYears) } }))} /> : <SetupCard title="Mortgage settings unavailable"><p>Complete the household details to edit mortgage assumptions.</p></SetupCard>)}
      {settingsSection === 'allowances' && (input ? <AllowanceInputs people={input.household.people} value={input.allowances} onChange={allowances => setDocument(d => ({ ...d, allowances }))} /> : <SetupCard title="ISA allowances unavailable"><p>Complete the household details to edit ISA allowances.</p></SetupCard>)}
      {settingsSection === 'events' && <PlanEvents document={doc} setDocument={setDocument} />}
      {settingsSection === 'forecast' && <ForecastResults result={result} people={input?.household.people ?? []} priceYear={doc.moneyBasis.priceYear} />}
      {settingsSection === 'forecast' && unknownBalanceDates > 0 && <p className="context-note">{unknownBalanceDates} balance observation date{unknownBalanceDates === 1 ? ' is' : 's are'} unknown. Those saved balances remain visible in your household summary but are excluded from date-dependent projections until you add a date in the household setup.</p>}
      <footer className="journey-footer">{accountBacked ? 'Changes are saved to your account.' : 'Changes are saved in this browser.'} Current household finances can be edited from your starting position.</footer>
      </div>
    </main></div>
}
