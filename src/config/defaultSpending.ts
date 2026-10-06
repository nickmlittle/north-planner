import type { SpendingPlan } from '../domain/spending'
/** Unconfigured lifestyle spending is visibly zero until entered. */
export const defaultSpending: SpendingPlan = { baseline: 0, events: [] }
