import { render } from '@testing-library/react'
import App from '../App'
import { storageKey } from '../state/useAppDocument'
import { completeDocument } from './setupFixture'

export function renderPlanner(section = 'planning') {
  const doc = completeDocument()
  doc.step = 10
  localStorage.setItem(storageKey, JSON.stringify(doc))
  window.history.replaceState(null, '', `/?view=settings&settings=${section}`)
  return render(<App />)
}
