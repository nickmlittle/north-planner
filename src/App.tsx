import { useState } from 'react'
import { defaultPlanning } from './config/defaultPlanning'
import { PlanningInputs } from './components/PlanningInputs'
import { AppLayout } from './components/AppLayout'
import { StartingPosition } from './components/StartingPosition'
import { HomePage } from './pages/HomePage'
import { useHousehold } from './state/useHousehold'

export default function App() {
  const [planning, setPlanning] = useState(() => structuredClone(defaultPlanning))
  const { household, update } = useHousehold()
  return <AppLayout><HomePage household={household} /><StartingPosition household={household} onChange={update} /><PlanningInputs value={planning} onChange={setPlanning} /></AppLayout>
}
