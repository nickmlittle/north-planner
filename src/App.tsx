import { defaultSpending } from './config/defaultSpending'
import { SpendingInputs } from './components/SpendingInputs'
import { householdEmployment } from './engine/employment'
import { defaultTax } from './config/defaultTax'
import { TaxInputs } from './components/TaxInputs'
import { IncomeSummary } from './components/IncomeSummary'
import { defaultIncome } from './config/defaultIncome'
import { IncomeInputs } from './components/IncomeInputs'
import { useState } from 'react'
import { defaultPlanning } from './config/defaultPlanning'
import { PlanningInputs } from './components/PlanningInputs'
import { AppLayout } from './components/AppLayout'
import { StartingPosition } from './components/StartingPosition'
import { HomePage } from './pages/HomePage'
import { useHousehold } from './state/useHousehold'

export default function App() {
  const [spending, setSpending] = useState(() => structuredClone(defaultSpending))
  const [tax, setTax] = useState(() => structuredClone(defaultTax))
  const [income, setIncome] = useState(() => structuredClone(defaultIncome))
  const [planning, setPlanning] = useState(() => structuredClone(defaultPlanning))
  const { household, update } = useHousehold()
  return <AppLayout><HomePage household={household} /><StartingPosition household={household} onChange={update} /><PlanningInputs value={planning} onChange={setPlanning} /><IncomeInputs household={household} value={income} onChange={setIncome} /><TaxInputs value={tax} onChange={setTax} /><IncomeSummary household={household} income={income} tax={tax} planning={planning} /><SpendingInputs value={spending} onChange={setSpending} year={household.assumptions.startYear} disposable={householdEmployment(household, income, household.assumptions.startYear, planning.fireAge, tax).disposable} /></AppLayout>
}
