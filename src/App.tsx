import { AppLayout } from './components/AppLayout'
import { HomePage } from './pages/HomePage'
import { useHousehold } from './state/useHousehold'

export default function App() {
  const household = useHousehold()
  return <AppLayout><HomePage household={household} /></AppLayout>
}
