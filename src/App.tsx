import { HouseholdJourney } from './pages/HouseholdJourney'
import { HouseholdPlanner } from './pages/HouseholdPlanner'
import { useAppDocument } from './state/useAppDocument'

export default function App() {
  const state = useAppDocument()
  return state.document.step === 9 ? <HouseholdPlanner {...state} /> : <HouseholdJourney {...state} />
}
