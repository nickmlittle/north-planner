import type { ReturnAssumptions } from '../domain/planning'

/** Illustrative editable assumptions, not market forecasts. Rates are decimals. */
export const defaultPlanning: ReturnAssumptions = {
  equityReturn: 0.04, equityVolatility: 0.15, bondReturn: 0.01, bondVolatility: 0.05,
  houseGrowth: 0, cashReturn: 0, fireAge: 50, pensionAccessAge: 58, horizonAge: 95, withdrawalRate: 0.035,
}
