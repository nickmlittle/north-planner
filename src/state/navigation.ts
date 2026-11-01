export type PlannerView = 'household' | 'budget'
export const primaryDestinations = [
  { id: 'household', label: 'Household' },
  { id: 'budget', label: 'Budget' },
] as const

export function navigateTo(view: PlannerView) {
  const url = new URL(window.location.href)
  url.searchParams.set('view', view)
  url.searchParams.delete('section')
  url.searchParams.delete('settings')
  url.searchParams.delete('budgetView')
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
