import { HouseholdJourney } from './pages/HouseholdJourney'
import { HouseholdDashboard } from './pages/HouseholdDashboard'
import { HouseholdPlanner } from './pages/HouseholdPlanner'
import { useAppDocument } from './state/useAppDocument'

export default function App() {
  const state = useAppDocument()
  return state.document.step === 9 ? <HouseholdDashboard {...state} /> : state.document.step === 10 ? <HouseholdPlanner {...state} /> : <HouseholdJourney {...state} />
}
