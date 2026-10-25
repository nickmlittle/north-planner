export const settingsSections = [
  { id: 'planning', label: 'Planning assumptions', description: 'Set the returns, ages, and withdrawal rate used in your forecast.' },
  { id: 'tax', label: 'Tax estimates', description: 'Review the tax and employee National Insurance assumptions.' },
  { id: 'income', label: 'Income timeline', description: 'Adjust earnings, working patterns, and pension contributions over time.' },
  { id: 'spending', label: 'Lifestyle spending', description: 'Set regular lifestyle costs in real 2026 pounds.' },
  { id: 'children', label: 'Child costs', description: 'Set future costs for each child as they move through age bands.' },
  { id: 'mortgage', label: 'Mortgage', description: 'Adjust mortgage rates, overpayments, and refinancing assumptions.' },
  { id: 'allowances', label: 'ISA allowances', description: 'Set the annual ISA allowance for each adult.' },
  { id: 'events', label: 'Goals & life events', description: 'Add and manage the goals and events that shape your plan.' },
  { id: 'forecast', label: 'Forecast details', description: 'Review the year-by-year results behind your dashboard.' },
] as const

export type SettingsSection = typeof settingsSections[number]['id']
export function isSettingsSection(value: string | null): value is SettingsSection {
  return settingsSections.some(section => section.id === value)
}

export function navigateToSettings(section: SettingsSection) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'settings')
  url.searchParams.set('settings', section)
  url.searchParams.delete('section')
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToHousehold(section = 8) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'household')
  url.searchParams.set('section', String(section))
  url.searchParams.delete('settings')
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToDashboard() {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'dashboard')
  url.searchParams.delete('settings')
  url.searchParams.delete('section')
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
export function navigateToBudget() {
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'budget')
  url.searchParams.delete('settings'); url.searchParams.delete('section')
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToStep(step: number) {
  const url = new URL(window.location.href)
  if (step === 9) url.searchParams.set('view', 'dashboard')
  else url.searchParams.delete('view')
  url.searchParams.delete('settings')
  url.searchParams.delete('section')
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
