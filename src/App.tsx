import { AppLayout } from './components/AppLayout'
import { StartingPosition } from './components/StartingPosition'
import { HomePage } from './pages/HomePage'
import { useHousehold } from './state/useHousehold'

export default function App() {
  const { household, update } = useHousehold()
  return <AppLayout><HomePage household={household} /><StartingPosition household={household} onChange={update} /></AppLayout>
}
