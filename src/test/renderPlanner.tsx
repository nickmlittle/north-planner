import { render } from '@testing-library/react'
import App from '../App'
import { storageKey } from '../state/useAppDocument'
import { completeDocument } from './setupFixture'

export function renderPlanner() {
  const doc = completeDocument()
  doc.step = 9
  localStorage.setItem(storageKey, JSON.stringify(doc))
  return render(<App />)
}
