// First, so a local review's staged day is in place before anything reads the date.
import './reviewClock'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { registerServiceWorker } from './registerServiceWorker'

const root = document.getElementById('root')
if (!root) throw new Error('Application root element is missing')

createRoot(root).render(<StrictMode><App /></StrictMode>)
registerServiceWorker()
