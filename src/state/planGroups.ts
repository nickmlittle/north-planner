const OPEN_GROUPS_KEY = 'north.plan.open'

/** The Plan groups opened in this browser session, by group key. Groups start closed. */
export function readOpenPlanGroups(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(OPEN_GROUPS_KEY) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, boolean> : {}
  } catch { return {} }
}

export function rememberOpenPlanGroups(value: Record<string, boolean>) {
  try { window.sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(value)) } catch { /* Session convenience only. */ }
}
