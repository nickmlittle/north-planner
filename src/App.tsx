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
  const [income, setIncome] = useState(() => structuredClone(defaultIncome))
  const [planning, setPlanning] = useState(() => structuredClone(defaultPlanning))
  const { household, update } = useHousehold()
  return <AppLayout><HomePage household={household} /><StartingPosition household={household} onChange={update} /><PlanningInputs value={planning} onChange={setPlanning} /><IncomeInputs household={household} value={income} onChange={setIncome} /></AppLayout>
}
