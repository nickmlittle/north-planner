const OPEN_GROUPS_KEY = 'north.plan.open'

/**
 * The Plan groups opened (true) or closed (false) in this browser session, by group key. A group with no entry
 * takes the default: open on desktop, closed on phones (D4), so a new session starts open again on desktop.
 */
export function readOpenPlanGroups(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(OPEN_GROUPS_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, boolean> : {}
  } catch { return {} }
}

export function rememberOpenPlanGroups(value: Record<string, boolean>) {
  try { window.sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(value)) } catch { /* Session convenience only. */ }
}

const GROUPING_KEY = 'north.plan.grouping'

export type PlanGroupingChoice = 'category' | 'destination' | 'dates'
/** ⌘K's "Bills by date" asks a Plan that's already open to switch (and remembers it for one that isn't). */
export const PLAN_GROUPING_EVENT = 'north:plan-grouping'

/** Whether this device bands the Plan by category (the default) or by destination, or shows its Dates. */
export function readPlanGrouping(): PlanGroupingChoice {
  try { const value = window.localStorage.getItem(GROUPING_KEY); return value === 'destination' || value === 'dates' ? value : 'category' } catch { return 'category' }
}

export function showPlanGrouping(value: PlanGroupingChoice) {
  rememberPlanGrouping(value)
  window.dispatchEvent(new CustomEvent(PLAN_GROUPING_EVENT, { detail: value }))
}

export function rememberPlanGrouping(value: PlanGroupingChoice) {
  try { window.localStorage.setItem(GROUPING_KEY, value) } catch { /* Per-device convenience only. */ }
}
