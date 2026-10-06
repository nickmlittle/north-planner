import { defaultMoves } from './config/defaultMoves'
import { PropertyInputs } from './components/PropertyInputs'
import { defaultMortgage } from './config/defaultMortgage'
import { MortgageInputs } from './components/MortgageInputs'
import { defaultChildren } from './config/defaultChildren'
import { ChildInputs } from './components/ChildInputs'
import { childEffects } from './engine/children'
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
  const [moves, setMoves] = useState(() => structuredClone(defaultMoves))
  const [mortgage, setMortgage] = useState(() => structuredClone(defaultMortgage))
  const [children, setChildren] = useState(() => structuredClone(defaultChildren))
  const [spending, setSpending] = useState(() => structuredClone(defaultSpending))
  const [tax, setTax] = useState(() => structuredClone(defaultTax))
  const [income, setIncome] = useState(() => structuredClone(defaultIncome))
  const [planning, setPlanning] = useState(() => structuredClone(defaultPlanning))
  const { household, update } = useHousehold()
  return <AppLayout><HomePage household={household} /><StartingPosition household={household} onChange={update} /><PlanningInputs value={planning} onChange={setPlanning} /><IncomeInputs household={household} value={income} onChange={setIncome} /><TaxInputs value={tax} onChange={setTax} /><IncomeSummary household={household} income={income} tax={tax} planning={planning} adjustments={childEffects(children, household.assumptions.startYear).adjustments} /><SpendingInputs value={spending} onChange={setSpending} year={household.assumptions.startYear} disposable={householdEmployment(household, income, household.assumptions.startYear, planning.fireAge, tax, childEffects(children, household.assumptions.startYear).adjustments).disposable} /><ChildInputs value={children} onChange={setChildren} year={household.assumptions.startYear} people={household.people} /><MortgageInputs value={mortgage} onChange={setMortgage} balance={household.mortgages[0]?.balance ?? 0} year={household.assumptions.startYear} /><PropertyInputs value={moves} onChange={setMoves} year={household.assumptions.startYear} /></AppLayout>
}
