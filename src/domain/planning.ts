export interface ReturnAssumptions {
  equityReturn: number
  equityVolatility: number
  bondReturn: number
  bondVolatility: number
  houseGrowth: number
  cashReturn: 0
  fireAge: number
  pensionAccessAge: number
  horizonAge: number
  withdrawalRate: number
}

export function validatePlanning(value: ReturnAssumptions): string | undefined {
  for (const key of ['equityReturn', 'bondReturn', 'houseGrowth'] as const) {
    if (!Number.isFinite(value[key]) || value[key] <= -1 || value[key] > 1) return 'Real returns must be greater than -100% and no more than 100%.'
  }
  for (const key of ['equityVolatility', 'bondVolatility', 'withdrawalRate'] as const) {
    if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1) return 'Volatility and withdrawal rates must be between 0% and 100%.'
  }
  for (const key of ['fireAge', 'pensionAccessAge', 'horizonAge'] as const) {
    if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > 120) return 'Planning ages must be whole years from 1 to 120.'
  }
  if (value.horizonAge < Math.max(value.fireAge, value.pensionAccessAge)) return 'Horizon must be at or after FIRE and pension access ages.'
  if (value.cashReturn !== 0) return 'V1 cash return must be 0% real.'
}
